#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCapabilityReferences } from './lib/capability-references.mjs'
import { parseJson } from './lib/contracts.mjs'
import { resolvePilotRoot } from '../scripts/local-pilot-paths.mjs'

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const maxCatalogFiles = 1024
const maxDocumentBytes = 1024 * 1024

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index]
    const value = argv[index + 1]
    if (!['--capability-catalog', '--procedure-catalog'].includes(option) || !value) {
      throw new Error(
        'Usage: validate-capability-refs.mjs '
        + '[--capability-catalog DIR] [--procedure-catalog DIR]',
      )
    }
    if (values.has(option)) throw new Error(`Duplicate ${option}`)
    values.set(option, value)
  }
  return {
    capabilityCatalog: resolve(
      values.get('--capability-catalog')
      ?? resolve(resolvePilotRoot(
        resolve(moduleRoot, '..'), 'capability-contracts',
        'OPENADAM_CAPABILITY_CONTRACTS_SOURCE_ROOT',
      ), 'catalog/capabilities'),
    ),
    procedureCatalog: resolve(
      values.get('--procedure-catalog') ?? resolve(moduleRoot, 'catalog/procedures'),
    ),
  }
}

async function readCatalog(root, label) {
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name))
  if (entries.length === 0) throw new Error(`${label} catalog is empty`)
  if (entries.length > maxCatalogFiles) {
    throw new Error(`${label} catalog exceeds ${maxCatalogFiles} documents`)
  }
  const documents = []
  for (const entry of entries) {
    const path = resolve(root, entry.name)
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size > maxDocumentBytes) {
      throw new Error(`${label} document ${entry.name} is not a bounded regular file`)
    }
    try {
      documents.push(
        parseJson(await readFile(path, 'utf8'), `${label} document ${entry.name}`),
      )
    } catch (error) {
      throw new Error(`${label} document ${entry.name} is invalid JSON: ${error.message}`)
    }
  }
  return documents
}

try {
  const options = parseArgs(process.argv.slice(2))
  const [capabilities, procedures] = await Promise.all([
    readCatalog(options.capabilityCatalog, 'Capability'),
    readCatalog(options.procedureCatalog, 'Procedure'),
  ])
  const result = validateCapabilityReferences({ capabilities, procedures })
  console.log(
    `PASS Procedure Capability references procedures=${result.procedures} `
    + `stages=${result.stageReferences} capabilities=${result.capabilitiesUsed}`,
  )
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
