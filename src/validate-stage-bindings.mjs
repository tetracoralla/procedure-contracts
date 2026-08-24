#!/usr/bin/env node

import { resolve } from 'node:path'
import { loadJson, validateContractSet } from './lib/contracts.mjs'
import { validateStageProviderBindings } from './lib/stage-bindings.mjs'

function parseArgs(argv) {
  const values = new Map()
  const capabilityManifests = []
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(
        'Usage: validate-stage-bindings.mjs --profile FILE --suite FILE --manifest FILE '
        + '--capability-manifest FILE [--capability-manifest FILE ...]',
      )
    }
    if (flag === '--capability-manifest') capabilityManifests.push(value)
    else values.set(flag.slice(2), value)
  }
  for (const required of ['profile', 'suite', 'manifest']) {
    if (!values.has(required)) throw new Error(`Missing --${required}`)
  }
  if (capabilityManifests.length === 0) throw new Error('Missing --capability-manifest')
  return { values, capabilityManifests }
}

async function main() {
  const { values, capabilityManifests: paths } = parseArgs(process.argv.slice(2))
  const profilePath = resolve(values.get('profile'))
  const profile = await loadJson(profilePath)
  const suite = await loadJson(resolve(values.get('suite')))
  const procedureManifest = await loadJson(resolve(values.get('manifest')))
  await validateContractSet({ profile, profilePath, manifest: procedureManifest, suite })
  const capabilityManifests = await Promise.all(paths.map((path) => loadJson(resolve(path))))
  const result = validateStageProviderBindings({
    profile,
    procedureManifest,
    capabilityManifests,
  })
  console.log(`PASS stage-provider-bindings stages=${result.stages} providers=${result.providers}`)
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
