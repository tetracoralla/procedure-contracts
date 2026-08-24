import { createInterface } from 'node:readline'

const harness = JSON.parse(process.env.OPENADAM_PROCEDURE_CONFORMANCE_BINDINGS ?? '{}')
const bindings = new Map((harness.bindings ?? []).map((binding) => [binding.stageId, binding]))

async function invoke(request, stageId, input) {
  const binding = bindings.get(stageId)
  if (binding === undefined) throw new Error(`missing conformance binding for ${stageId}`)
  const response = await fetch(binding.target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: `${request.id}:${stageId}`,
      invocationId: request.id,
      capabilityId: binding.capabilityId,
      capabilityVersion: binding.capabilityVersion,
      operationId: binding.operationId,
      input,
    }),
  })
  const value = await response.json()
  if (!value.ok) throw new Error(value.error?.message ?? `${stageId} failed`)
  return value.result
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  const request = JSON.parse(line)
  const prepared = await invoke(request, 'prepare', request.input)
  const result = await invoke(request, 'normalize', { value: prepared.prepared })
  process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result })}\n`)
}
