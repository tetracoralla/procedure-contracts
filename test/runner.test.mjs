import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import {
  compositionSuite,
  forwardManifest,
  forwardProfile,
  forwardSuite,
  successCase,
} from './fixtures/contracts.mjs'

const execFileAsync = promisify(execFile)
const repoRoot = resolve(import.meta.dirname, '..')

async function runWithSuite(
  testSuite = forwardSuite,
  testManifest = forwardManifest,
  testCompositionSuite,
) {
  const temporary = await mkdtemp(resolve(tmpdir(), 'procedure-contracts-'))
  try {
    const profilePath = resolve(temporary, 'profile.json')
    const suitePath = resolve(temporary, 'suite.json')
    const manifestPath = resolve(temporary, 'manifest.json')
    const compositionSuitePath = resolve(temporary, 'composition-suite.json')
    await Promise.all([
      writeFile(profilePath, JSON.stringify(forwardProfile)),
      writeFile(suitePath, JSON.stringify(testSuite)),
      writeFile(manifestPath, JSON.stringify(testManifest)),
      ...(testCompositionSuite === undefined
        ? []
        : [writeFile(compositionSuitePath, JSON.stringify(testCompositionSuite))]),
    ])
    return await execFileAsync(
      process.execPath,
      [
        'src/run-conformance.mjs',
        '--profile', profilePath,
        '--suite', suitePath,
        '--manifest', manifestPath,
        '--implementation-root', repoRoot,
        ...(testCompositionSuite === undefined
          ? []
          : ['--composition-suite', compositionSuitePath]),
      ],
      { cwd: repoRoot, timeout: 10000 },
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

test('runs exact result and error cases through a real JSONL adapter', async () => {
  const result = await runWithSuite()
  assert.match(result.stdout, /PASS composed-value/)
  assert.match(result.stdout, /PASS reject-value/)
  assert.match(result.stdout, /cases=2/)
})

test('observes required Capability calls and their data flow in composition mode', async () => {
  const manifest = structuredClone(forwardManifest)
  manifest.implementations[0].adapter.args = ['test/fixtures/forward-composed-adapter.mjs']
  const result = await runWithSuite(
    { ...forwardSuite, cases: [successCase] },
    manifest,
    compositionSuite,
  )
  assert.match(result.stdout, /PASS composed-value/)
  assert.match(result.stdout, /composition-conformance/)
})

test('composition mode rejects a result-compatible implementation that bypasses stages', async () => {
  await assert.rejects(
    runWithSuite(
      { ...forwardSuite, cases: [successCase] },
      forwardManifest,
      compositionSuite,
    ),
    (error) => {
      assert.match(error.stderr, /missing observed Capability calls: prepare, normalize/)
      return true
    },
  )
})

test('rejects an implementation response with duplicate JSON fields', async () => {
  const invalid = structuredClone(forwardManifest)
  invalid.implementations[0].adapter.args = ['test/fixtures/duplicate-key-implementation.mjs']
  await assert.rejects(runWithSuite(forwardSuite, invalid), (error) => {
    assert.match(error.stderr, /duplicate JSON object key id/)
    return true
  })
})

test('rejects receipt fields in the forward response envelope', async () => {
  const invalid = structuredClone(forwardManifest)
  invalid.implementations[0].adapter.args = ['test/fixtures/forward-extra-record-adapter.mjs']
  await assert.rejects(
    runWithSuite({ ...forwardSuite, cases: [successCase] }, invalid),
    (error) => {
      assert.match(error.stderr, /invalid implementation response fields: id, ok, receipt, result/)
      return true
    },
  )
})

test('terminates a hanging implementation at the case timeout', async () => {
  const hanging = structuredClone(successCase)
  hanging.id = 'hang'
  hanging.input.value = 'hang'
  hanging.expect.value.normalized = 'HANG!'
  hanging.timeoutMs = 25
  await assert.rejects(
    runWithSuite({ ...forwardSuite, cases: [hanging] }),
    (error) => {
      assert.match(error.stderr, /timed out after 25ms/)
      return true
    },
  )
})
