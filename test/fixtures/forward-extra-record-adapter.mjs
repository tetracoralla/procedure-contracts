#!/usr/bin/env node

import readline from 'node:readline'

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of lines) {
  if (!line.trim()) continue
  const request = JSON.parse(line)
  process.stdout.write(`${JSON.stringify({
    id: request.id,
    ok: true,
    result: {},
    receipt: {},
  })}\n`)
}
