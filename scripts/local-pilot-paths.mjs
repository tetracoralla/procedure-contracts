import { statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

export function resolvePilotRoot(workspaceRoot, relativeDefault, environmentName, environment = process.env) {
  const configured = environment[environmentName]
  if (configured === undefined) return resolve(workspaceRoot, relativeDefault)
  if (!isAbsolute(configured)) {
    throw new Error(`${environmentName} must be an absolute path`)
  }
  return resolve(configured)
}

export function firstRootContainingFile(roots, relativeFile) {
  return roots.find((root) => {
    try {
      return statSync(resolve(root, relativeFile)).isFile()
    } catch {
      return false
    }
  }) ?? roots[0]
}

export function requiredPilotFiles(pilot) {
  return [
    ...(pilot.implementationFiles ?? []).map((path) => resolve(pilot.implementationRoot, path)),
    resolve(pilot.implementationRoot, pilot.manifest),
    ...(pilot.compositionSuite === undefined
      ? []
      : [resolve(pilot.implementationRoot, pilot.compositionSuite)]),
    ...(pilot.capabilityManifests ?? []),
  ]
}

export function planPilotSources(pilots, capabilityContractsRoot) {
  const capabilityCatalog = resolve(capabilityContractsRoot, 'catalog/capabilities')
  const capabilityMissing = [
    resolve(capabilityContractsRoot, 'package.json'),
    capabilityCatalog,
  ].filter((path) => {
    try {
      return path === capabilityCatalog
        ? !statSync(path).isDirectory()
        : !statSync(path).isFile()
    } catch {
      return true
    }
  })
  const entries = pilots.map((pilot) => {
    const missing = requiredPilotFiles(pilot).filter((path) => {
      try {
        return !statSync(path).isFile()
      } catch {
        return true
      }
    })
    try {
      if (!statSync(pilot.implementationRoot).isDirectory()) {
        missing.unshift(pilot.implementationRoot)
      }
    } catch {
      missing.unshift(pilot.implementationRoot)
    }
    return { pilot, missing }
  })
  return {
    capabilityCatalog,
    capabilityMissing,
    entries,
  }
}
