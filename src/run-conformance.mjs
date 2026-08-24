#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import {
  canonicalJson,
  deepSubset,
  loadJson,
  parseJson,
  validateAgainstSchema,
  validateCompositionSuite,
  validateContractSet,
} from './lib/contracts.mjs'
import { createCompositionHarness } from './lib/composition-harness.mjs'

const maxLineBytes = 1024 * 1024
const maxStderrBytes = 64 * 1024
const shutdownTimeoutMs = 2000

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: run-conformance.mjs --profile FILE --suite FILE --manifest FILE --implementation-root DIR',
      )
    }
    values.set(flag.slice(2), value)
  }
  for (const required of ['profile', 'suite', 'manifest', 'implementation-root']) {
    if (!values.has(required)) throw new Error(`Missing --${required}`)
  }
  return values
}

function assertResponseEnvelope(response) {
  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('implementation response must be an object')
  }
  const keys = Object.keys(response).sort()
  const expected = response.ok === true ? ['id', 'ok', 'result'] : ['error', 'id', 'ok']
  if (canonicalJson(keys) !== canonicalJson(expected)) {
    throw new Error(`invalid implementation response fields: ${keys.join(', ')}`)
  }
  if (response.ok !== true && response.ok !== false) {
    throw new Error('implementation response ok must be true or false')
  }
  if (response.ok === false) {
    if (
      response.error === null ||
      typeof response.error !== 'object' ||
      Array.isArray(response.error) ||
      !/^[A-Z][A-Z0-9_]*$/.test(response.error.code) ||
      typeof response.error.message !== 'string' ||
      response.error.message.length === 0 ||
      Object.keys(response.error).some((key) => !['code', 'message'].includes(key))
    ) {
      throw new Error('invalid implementation error envelope')
    }
  }
}

function assertExpectation({ testCase, response, schemas }) {
  assertResponseEnvelope(response)
  if (testCase.expect.result === 'error') {
    if (response.ok !== false) throw new Error('expected an error response')
    if (response.error.code !== testCase.expect.code) {
      throw new Error(`expected error code ${testCase.expect.code}, got ${response.error.code}`)
    }
    if (
      testCase.expect.messageIncludes !== undefined
      && !response.error.message.includes(testCase.expect.messageIncludes)
    ) {
      throw new Error(`error message does not include ${testCase.expect.messageIncludes}`)
    }
    return
  }
  if (response.ok !== true) {
    throw new Error(`expected success, got ${response.error?.code ?? 'unknown error'}`)
  }
  validateAgainstSchema(schemas.output, response.result, `${testCase.id} result`)
  if (
    testCase.expect.match === 'exact' &&
    canonicalJson(response.result) !== canonicalJson(testCase.expect.value)
  ) {
    throw new Error('result did not exactly match expected value')
  }
  if (
    testCase.expect.match === 'subset' &&
    !deepSubset(response.result, testCase.expect.value)
  ) {
    throw new Error('result did not contain expected subset')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const profilePath = resolve(args.get('profile'))
  const profile = await loadJson(profilePath)
  const suite = await loadJson(resolve(args.get('suite')))
  const manifest = await loadJson(resolve(args.get('manifest')))
  const validated = await validateContractSet({ profile, profilePath, manifest, suite })
  const compositionSuite = args.has('composition-suite')
    ? await loadJson(resolve(args.get('composition-suite')))
    : undefined
  if (compositionSuite !== undefined) {
    await validateCompositionSuite({ profile, suite, compositionSuite })
  }
  const implementationRoot = resolve(args.get('implementation-root'))
  const adapterCwd = resolve(implementationRoot, validated.implementation.adapter.cwd ?? '.')
  if (adapterCwd !== implementationRoot && !adapterCwd.startsWith(`${implementationRoot}/`)) {
    throw new Error('implementation adapter cwd escapes the implementation root')
  }

  const compositionHarness = compositionSuite === undefined
    ? undefined
    : await createCompositionHarness({ profile, implementation: validated.implementation })
  const child = spawn(
    validated.implementation.adapter.command,
    validated.implementation.adapter.args,
    {
      cwd: adapterCwd,
      env: {
        ...process.env,
        OPENADAM_IMPLEMENTATION_ROOT: implementationRoot,
        ...(compositionHarness === undefined
          ? {}
          : { OPENADAM_PROCEDURE_CONFORMANCE_BINDINGS: compositionHarness.environment }),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  const pending = new Map()
  let adapterFailure
  let stdoutBuffer = ''
  let stderr = ''
  let stderrBytes = 0
  let closing = false
  const exitPromise = new Promise((resolveExit) => {
    child.once('close', (code, signal) => resolveExit({ code, signal }))
  })

  function terminateAdapter() {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }

  function failAdapter(error) {
    if (adapterFailure !== undefined) return
    adapterFailure = error instanceof Error ? error : new Error(String(error))
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(adapterFailure)
    }
    pending.clear()
    terminateAdapter()
  }

  function handleLine(line) {
    if (Buffer.byteLength(line, 'utf8') > maxLineBytes) {
      failAdapter(new Error(`implementation response exceeds ${maxLineBytes} bytes`))
      return
    }
    try {
      const response = parseJson(line, 'implementation response')
      const entry = pending.get(response?.id)
      if (entry === undefined) {
        throw new Error(`implementation returned unknown or duplicate id ${response?.id}`)
      }
      pending.delete(response.id)
      clearTimeout(entry.timer)
      entry.resolve(response)
    } catch (error) {
      failAdapter(error)
    }
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    if (adapterFailure !== undefined) return
    stdoutBuffer += chunk
    if (Buffer.byteLength(stdoutBuffer, 'utf8') > maxLineBytes) {
      failAdapter(new Error(`implementation response exceeds ${maxLineBytes} bytes`))
      return
    }
    let newline = stdoutBuffer.indexOf('\n')
    while (newline !== -1) {
      const line = stdoutBuffer.slice(0, newline)
      stdoutBuffer = stdoutBuffer.slice(newline + 1)
      handleLine(line)
      if (adapterFailure !== undefined) return
      newline = stdoutBuffer.indexOf('\n')
    }
  })
  child.stderr.on('data', (chunk) => {
    stderrBytes += chunk.length
    if (stderrBytes > maxStderrBytes) {
      failAdapter(new Error(`implementation stderr exceeds ${maxStderrBytes} bytes`))
      return
    }
    stderr += chunk.toString()
  })
  child.once('error', failAdapter)
  child.once('exit', (code, signal) => {
    if (closing && pending.size === 0) return
    if (pending.size > 0) {
      failAdapter(
        new Error(
          `implementation exited before completion: code=${code} signal=${signal}${
            stderr === '' ? '' : ` stderr=${stderr.trim()}`
          }`,
        ),
      )
    }
  })

  let passed = 0
  const cases = compositionSuite === undefined
    ? suite.cases
    : compositionSuite.cases.map((compositionCase) => ({
        ...suite.cases.find((testCase) => testCase.id === compositionCase.id),
        compositionCase,
      }))
  try {
    for (const testCase of cases) {
      if (adapterFailure !== undefined) throw adapterFailure
      compositionHarness?.begin(testCase.compositionCase)
      const request = {
        id: testCase.id,
        procedureId: profile.id,
        procedureVersion: profile.version,
        input: testCase.input,
      }
      const requestLine = `${JSON.stringify(request)}\n`
      if (Buffer.byteLength(requestLine, 'utf8') > maxLineBytes) {
        throw new Error(`${testCase.id}: request exceeds ${maxLineBytes} bytes`)
      }
      const response = await new Promise((resolveResponse, rejectResponse) => {
        const timer = setTimeout(() => {
          pending.delete(testCase.id)
          const error = new Error(`timed out after ${testCase.timeoutMs ?? 10000}ms`)
          rejectResponse(error)
          failAdapter(error)
        }, testCase.timeoutMs ?? 10000)
        pending.set(testCase.id, { resolve: resolveResponse, reject: rejectResponse, timer })
        child.stdin.write(requestLine)
      })
      try {
        if (adapterFailure !== undefined) throw adapterFailure
        compositionHarness?.finish()
        assertExpectation({
          testCase,
          response,
          schemas: validated.schemas,
        })
        passed += 1
        console.log(`PASS ${testCase.id}`)
      } catch (error) {
        throw new Error(`${testCase.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    closing = true
    child.stdin.end()
    let shutdownTimer
    const exit = await Promise.race([
      exitPromise,
      new Promise((resolveExit) => {
        shutdownTimer = setTimeout(() => resolveExit(undefined), shutdownTimeoutMs)
      }),
    ])
    clearTimeout(shutdownTimer)
    if (exit === undefined) {
      terminateAdapter()
      await exitPromise
      if (adapterFailure === undefined) {
        throw new Error(`implementation did not exit within ${shutdownTimeoutMs}ms`)
      }
    } else if (adapterFailure === undefined && (exit.code !== 0 || exit.signal !== null)) {
      throw new Error(
        `implementation shutdown failed: code=${exit.code} signal=${exit.signal}${
          stderr === '' ? '' : ` stderr=${stderr.trim()}`
        }`,
      )
    }
    await compositionHarness?.close()
  }
  if (adapterFailure !== undefined) throw adapterFailure
  if (stdoutBuffer !== '') throw new Error('implementation ended with a partial response line')
  console.log(
    `PASS ${compositionSuite === undefined ? 'result-conformance' : 'composition-conformance'} `
    + `implementation=${manifest.provider.id}@${manifest.provider.version} `
    + `procedure=${profile.id}@${profile.version} cases=${passed}`,
  )
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
