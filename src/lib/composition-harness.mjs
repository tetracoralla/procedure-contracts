import { createServer } from 'node:http'
import { canonicalJson, deepSubset, parseJson } from './contracts.mjs'

const maxBodyBytes = 1024 * 1024

function failResponse(response, message) {
  response.writeHead(409, { 'content-type': 'application/json' })
  response.end(JSON.stringify({
    ok: false,
    error: { code: 'CONFORMANCE_CALL_MISMATCH', message },
  }))
}

async function readBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > maxBodyBytes) throw new Error(`Capability call exceeds ${maxBodyBytes} bytes`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function createCompositionHarness({ profile, implementation }) {
  const stages = new Map(profile.stages.map((stage) => [stage.id, stage]))
  let current

  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST') throw new Error('Capability harness accepts POST only')
      const match = /^\/stages\/([a-z0-9.-]+)$/u.exec(request.url ?? '')
      if (match === null) throw new Error('Unknown Capability harness target')
      const stageId = match[1]
      const stage = stages.get(stageId)
      if (stage === undefined) throw new Error(`Unknown Procedure stage ${stageId}`)
      if (current === undefined) throw new Error(`No active Procedure case for ${stageId}`)

      const call = parseJson(await readBody(request), 'Capability harness request')
      const keys = Object.keys(call ?? {}).sort()
      const expectedKeys = [
        'capabilityId',
        'capabilityVersion',
        'id',
        'input',
        'invocationId',
        'operationId',
      ]
      if (canonicalJson(keys) !== canonicalJson(expectedKeys)) {
        throw new Error(`Invalid Capability harness request fields: ${keys.join(', ')}`)
      }
      if (call.invocationId !== current.id) {
        throw new Error(`Capability call invocation ${call.invocationId} differs from ${current.id}`)
      }
      const expected = current.calls[current.index]
      if (expected === undefined) throw new Error(`Unexpected extra call to ${stageId}`)
      if (expected.stageId !== stageId) {
        throw new Error(`Expected call to ${expected.stageId}, received ${stageId}`)
      }
      if (
        call.capabilityId !== stage.capability.id
        || call.capabilityVersion !== stage.capability.version
        || call.operationId !== stage.capability.operationId
      ) {
        throw new Error(`${stageId}: Capability identity differs from Procedure Profile`)
      }
      const inputMatches = expected.match === 'subset'
        ? deepSubset(call.input, expected.input)
        : canonicalJson(call.input) === canonicalJson(expected.input)
      if (!inputMatches) throw new Error(`${stageId}: Capability input differs from expectation`)

      current.index += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ id: call.id, ...expected.respond }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (current !== undefined && current.failure === undefined) current.failure = new Error(message)
      failResponse(response, message)
    }
  })

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('Composition harness did not acquire a TCP port')
  }

  const bindingByStage = new Map(implementation.stages.map((binding) => [binding.stageId, binding]))
  const bindings = profile.stages.map((stage) => {
    const binding = bindingByStage.get(stage.id)
    return {
      stageId: stage.id,
      capabilityId: stage.capability.id,
      capabilityVersion: stage.capability.version,
      operationId: stage.capability.operationId,
      provider: binding.provider,
      transport: 'http',
      target: `http://127.0.0.1:${address.port}/stages/${stage.id}`,
    }
  })

  return {
    environment: JSON.stringify({
      schemaVersion: 'openadam.procedure-conformance-bindings.v0.1',
      bindings,
    }),
    begin(testCase) {
      if (current !== undefined) throw new Error('Composition harness already has an active case')
      current = { id: testCase.id, calls: testCase.calls, index: 0, failure: undefined }
    },
    finish() {
      if (current === undefined) throw new Error('Composition harness has no active case')
      const finished = current
      current = undefined
      if (finished.failure !== undefined) throw finished.failure
      if (finished.index !== finished.calls.length) {
        const missing = finished.calls.slice(finished.index).map((call) => call.stageId)
        throw new Error(`missing observed Capability calls: ${missing.join(', ')}`)
      }
    },
    async close() {
      current = undefined
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error === undefined ? resolveClose() : rejectClose(error))
      })
    },
  }
}
