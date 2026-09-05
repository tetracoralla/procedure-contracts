import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  firstRootContainingFile,
  planPilotSources,
  requiredPilotFiles,
  resolvePilotRoot,
} from '../scripts/local-pilot-paths.mjs'

test('local Procedure pilot roots require absolute source overrides', () => {
  const workspace = resolve('/tmp', 'openadam-workspace')
  assert.equal(
    resolvePilotRoot(
      workspace,
      'structured-data-preflight',
      'OPENADAM_STRUCTURED_DATA_PREFLIGHT_SOURCE_ROOT',
      {},
    ),
    resolve(workspace, 'structured-data-preflight'),
  )
  assert.equal(
    resolvePilotRoot(
      workspace,
      'structured-data-preflight',
      'OPENADAM_STRUCTURED_DATA_PREFLIGHT_SOURCE_ROOT',
      { OPENADAM_STRUCTURED_DATA_PREFLIGHT_SOURCE_ROOT: '/tmp/structured-data-preflight' },
    ),
    '/tmp/structured-data-preflight',
  )
  assert.throws(
    () => resolvePilotRoot(
      workspace,
      'structured-data-preflight',
      'OPENADAM_STRUCTURED_DATA_PREFLIGHT_SOURCE_ROOT',
      { OPENADAM_STRUCTURED_DATA_PREFLIGHT_SOURCE_ROOT: 'relative/path' },
    ),
    /must be an absolute path/,
  )
})

test('fallback source selection requires the provider manifest, not only a directory', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'openadam-provider-root-'))
  try {
    const stale = resolve(root, 'stale')
    const current = resolve(root, 'current')
    await mkdir(stale)
    await mkdir(resolve(current, 'capabilities'), { recursive: true })
    await writeFile(resolve(current, 'capabilities/provider.json'), '{}\n')
    assert.equal(
      firstRootContainingFile([stale, current], 'capabilities/provider.json'),
      current,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('composition suite is a required source input when a pilot declares it', () => {
  const implementationRoot = '/tmp/structured-data-preflight'
  assert.deepEqual(requiredPilotFiles({
    implementationRoot,
    implementationFiles: ['pyproject.toml', 'src/structured_data_preflight/adapter.py'],
    manifest: 'procedure/implementation-manifest.json',
    compositionSuite: 'procedure/composition-conformance.json',
    capabilityManifests: ['/tmp/file-vitals/capabilities/provider.json'],
  }), [
    '/tmp/structured-data-preflight/pyproject.toml',
    '/tmp/structured-data-preflight/src/structured_data_preflight/adapter.py',
    '/tmp/structured-data-preflight/procedure/implementation-manifest.json',
    '/tmp/structured-data-preflight/procedure/composition-conformance.json',
    '/tmp/file-vitals/capabilities/provider.json',
  ])
})

test('source planning inventories every pilot and implementation entry point before execution', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'openadam-procedure-inventory-'))
  try {
    const capabilityRoot = resolve(root, 'capability-contracts')
    await mkdir(resolve(capabilityRoot, 'catalog/capabilities'), { recursive: true })
    await writeFile(resolve(capabilityRoot, 'package.json'), '{}\n')
    const completeRoot = resolve(root, 'complete')
    await mkdir(resolve(completeRoot, 'procedure'), { recursive: true })
    await mkdir(resolve(completeRoot, 'src'), { recursive: true })
    for (const path of ['package.json', 'src/adapter.mjs', 'procedure/manifest.json']) {
      await writeFile(resolve(completeRoot, path), '{}\n')
    }
    const missingRoot = resolve(root, 'missing')
    await mkdir(resolve(missingRoot, 'procedure'), { recursive: true })
    await writeFile(resolve(missingRoot, 'procedure/manifest.json'), '{}\n')
    const pilots = [completeRoot, missingRoot].map((implementationRoot, index) => ({
      name: `pilot-${index}`,
      implementationRoot,
      implementationFiles: ['package.json', 'src/adapter.mjs'],
      manifest: 'procedure/manifest.json',
      capabilityManifests: [],
    }))

    const plan = planPilotSources(pilots, capabilityRoot)

    assert.equal(plan.capabilityMissing.length, 0)
    assert.deepEqual(plan.entries.map((entry) => entry.pilot.name), ['pilot-0', 'pilot-1'])
    assert.deepEqual(plan.entries[0].missing, [])
    assert.deepEqual(plan.entries[1].missing.sort(), [
      resolve(missingRoot, 'package.json'),
      resolve(missingRoot, 'src/adapter.mjs'),
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a missing Capability Contracts source is a source absence for every complete pilot', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'openadam-procedure-capability-source-'))
  try {
    const implementationRoot = resolve(root, 'implementation')
    await mkdir(resolve(implementationRoot, 'procedure'), { recursive: true })
    await writeFile(resolve(implementationRoot, 'package.json'), '{}\n')
    await writeFile(resolve(implementationRoot, 'procedure/manifest.json'), '{}\n')
    const plan = planPilotSources([{
      name: 'complete-pilot',
      implementationRoot,
      implementationFiles: ['package.json'],
      manifest: 'procedure/manifest.json',
      capabilityManifests: [],
    }], resolve(root, 'missing-capability-contracts'))

    assert.equal(plan.entries[0].missing.length, 0)
    assert.equal(plan.capabilityMissing.length, 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
