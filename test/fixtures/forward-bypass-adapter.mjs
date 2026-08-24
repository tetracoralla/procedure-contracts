import { createInterface } from 'node:readline'

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  const request = JSON.parse(line)
  if (request.input.value === 'hang') continue
  if (request.input.value === 'reject') {
    process.stdout.write(`${JSON.stringify({
      id: request.id,
      ok: false,
      error: { code: 'PROVIDER_FAILED', message: 'value was rejected' },
    })}\n`)
    continue
  }
  process.stdout.write(`${JSON.stringify({
    id: request.id,
    ok: true,
    result: { normalized: `${request.input.value.toUpperCase()}!` },
  })}\n`)
}
