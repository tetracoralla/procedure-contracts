#!/usr/bin/env node

import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertUniqueSemanticIdentities,
  loadJson,
  validateContractSet,
} from './lib/contracts.mjs'

const root = resolve(process.cwd(), 'catalog')
const retainedV03Identities = new Set([
  'org.openadam.brand-asset.prepare@0.1.0',
  'org.openadam.package-dependency.change-preflight@0.1.0',
  'org.openadam.structured-data.preflight@0.1.0',
])
const retainedV04Identities = new Set([
  'org.openadam.brand-asset.prepare@0.2.0',
  'org.openadam.structured-data.preflight@0.2.0',
])

export function assertCatalogProfileFormat(profile) {
  const identity = `${profile.id}@${profile.version}`
  if (
    profile.schemaVersion === 'openadam.procedure-profile.v0.3'
    && !retainedV03Identities.has(identity)
  ) {
    throw new Error(`${identity}: new catalog entries cannot use retained Procedure Profile v0.3`)
  }
  if (
    profile.schemaVersion === 'openadam.procedure-profile.v0.4'
    && !retainedV04Identities.has(identity)
  ) {
    throw new Error(`${identity}: new catalog entries cannot use retained Procedure Profile v0.4`)
  }
}

async function jsonFiles(directory) {
  try {
    return (await readdir(directory))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => resolve(directory, name))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function main() {
  const profileFiles = await jsonFiles(resolve(root, 'procedures'))
  const suiteFiles = await jsonFiles(resolve(root, 'conformance'))
  const profiles = await Promise.all(profileFiles.map(loadJson))
  const suites = await Promise.all(suiteFiles.map(loadJson))
  assertUniqueSemanticIdentities(profiles, 'catalog Procedure identities')
  for (const profile of profiles) assertCatalogProfileFormat(profile)
  assertUniqueSemanticIdentities(
    suites.map((suite) => ({ id: suite.procedureId, version: suite.procedureVersion })),
    'catalog conformance suite identities',
  )
  for (const [index, profileFile] of profileFiles.entries()) {
    const profile = profiles[index]
    const suite = suites.find(
      (candidate) =>
        candidate.procedureId === profile.id && candidate.procedureVersion === profile.version,
    )
    if (suite === undefined) throw new Error(`${profile.id}@${profile.version}: missing suite`)
    await validateContractSet({ profile, profilePath: profileFile, suite })
    console.log(`PASS ${profile.id}@${profile.version}`)
  }
  const profileIdentities = new Set(profiles.map((profile) => `${profile.id}@${profile.version}`))
  const orphanSuites = suites.filter(
    (suite) => !profileIdentities.has(`${suite.procedureId}@${suite.procedureVersion}`),
  )
  if (orphanSuites.length > 0) {
    throw new Error(
      `orphan suites: ${orphanSuites
        .map((suite) => `${suite.procedureId}@${suite.procedureVersion}`)
        .join(', ')}`,
    )
  }
  console.log(`PASS catalog profiles=${profileFiles.length} suites=${suiteFiles.length}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
