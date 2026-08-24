#!/usr/bin/env node

import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadJson, validateContractSet } from './lib/contracts.mjs'

const root = resolve(process.cwd(), 'catalog')

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
  const suites = await Promise.all(suiteFiles.map(loadJson))
  for (const profileFile of profileFiles) {
    const profile = await loadJson(profileFile)
    const suite = suites.find(
      (candidate) =>
        candidate.procedureId === profile.id && candidate.procedureVersion === profile.version,
    )
    if (suite === undefined) throw new Error(`${profile.id}@${profile.version}: missing suite`)
    await validateContractSet({ profile, profilePath: profileFile, suite })
    console.log(`PASS ${profile.id}@${profile.version}`)
  }
  const profileIdentities = new Set(
    await Promise.all(
      profileFiles.map(async (path) => {
        const profile = await loadJson(path)
        return `${profile.id}@${profile.version}`
      }),
    ),
  )
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

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
