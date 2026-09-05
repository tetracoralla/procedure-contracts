import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const refs = resolve(root, 'src/validate-capability-refs.mjs')

test('reference CLI honors source-root override and explicit catalog takes precedence', async (t) => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'procedure-reference-cli-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const capabilities = resolve(temporary, 'capabilities')
  const procedures = resolve(temporary, 'procedures')
  await mkdir(capabilities)
  await mkdir(procedures)
  const semantics = { resultVariability: 'deterministic', contextSources: [],
    stateAccess: 'none', idempotency: 'idempotent', openWorld: false }
  await writeFile(resolve(capabilities, 'example.json'), JSON.stringify({
    id: 'example.inspect', version: '0.1.0', operations: [{ id: 'inspect', semantics }],
  }))
  await writeFile(resolve(procedures, 'example.json'), JSON.stringify({
    schemaVersion: 'openadam.procedure-profile.v0.5', id: 'example.preflight', version: '0.1.0', semantics,
    stages: [{ id: 'inspect', kind: 'capability', capability: {
      id: 'example.inspect', version: '0.1.0', operationId: 'inspect',
    } }],
  }))
  const env = { ...process.env, OPENADAM_CAPABILITY_CONTRACTS_SOURCE_ROOT: '/missing-capability-test-root' }
  const args = [refs, '--procedure-catalog', procedures]
  const missing = spawnSync(process.execPath, args, { env, encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /missing-capability-test-root/)
  const explicit = spawnSync(process.execPath, [...args, '--capability-catalog', capabilities],
    { env, encoding: 'utf8' })
  assert.equal(explicit.status, 0, explicit.stderr)
  env.OPENADAM_CAPABILITY_CONTRACTS_SOURCE_ROOT = 'relative-path'
  const relative = spawnSync(process.execPath, args, { env, encoding: 'utf8' })
  assert.equal(relative.status, 1)
  assert.match(relative.stderr, /must be an absolute path/)
})

for (const npmExit of [0, 7]) {
  test(`pilot status remains on stdout when prerequisites exit ${npmExit}`, async (t) => {
    const temporary = await mkdtemp(resolve(tmpdir(), 'procedure-pilot-cli-'))
    t.after(() => rm(temporary, { recursive: true, force: true }))
    const npm = resolve(temporary, 'npm')
    await writeFile(npm, `#!/bin/sh\nexit ${npmExit}\n`)
    await chmod(npm, 0o755)
    const env = { ...process.env, PATH: temporary }
    for (const name of ['CAPABILITY_CONTRACTS', 'FILE_VITALS', 'BATCHTICKET', 'ASSET_PREP',
      'WORLDBEND', 'STRUCTURED_DATA_PREFLIGHT', 'BRAND_ASSET_PREP', 'DEPENDENCY_PREFLIGHT']) {
      env[`OPENADAM_${name}_SOURCE_ROOT`] = resolve(temporary, `missing-${name}`)
    }
    const result = spawnSync(process.execPath, [resolve(root, 'scripts/check-local-pilots.mjs')], {
      cwd: root, env, encoding: 'utf8', timeout: 5000,
    })
    assert.equal(result.status, npmExit === 0 ? 2 : 1, result.stderr)
    const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
    assert.equal(report.status, npmExit === 0 ? 'incomplete' : 'failed')
    assert.equal(report.notRun.length, 4)
  })
}
