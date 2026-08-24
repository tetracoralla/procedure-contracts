import { createInterface } from 'node:readline'

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const _line of lines) {
  const request = JSON.parse(_line)
  process.stdout.write(`{"id":"${request.id}","id":"${request.id}","ok":false,"error":{"code":"PROVIDER_FAILED","message":"duplicate"}}\n`)
}
