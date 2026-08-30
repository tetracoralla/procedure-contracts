function capabilityKey(value) {
  return `${value.id}@${value.version}`
}

function assertUnique(values, label) {
  const seen = new Set()
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label}: duplicate identity ${value}`)
    seen.add(value)
  }
}

export function validateCapabilityReferences({ capabilities, procedures }) {
  assertUnique(capabilities.map(capabilityKey), 'Capability catalog')
  assertUnique(procedures.map(capabilityKey), 'Procedure catalog')

  const capabilityIndex = new Map(
    capabilities.map((capability) => [
      capabilityKey(capability),
      new Map(capability.operations.map((operation) => [operation.id, operation])),
    ]),
  )
  const usedCapabilities = new Set()
  let stageReferences = 0

  for (const procedure of procedures) {
    const referencedOperations = []
    for (const stage of procedure.stages) {
      const reference = capabilityKey(stage.capability)
      const operations = capabilityIndex.get(reference)
      if (operations === undefined) {
        throw new Error(
          `${capabilityKey(procedure)} stage ${stage.id}: unknown Capability ${reference}`,
        )
      }
      const operation = operations.get(stage.capability.operationId)
      if (operation === undefined) {
        throw new Error(
          `${capabilityKey(procedure)} stage ${stage.id}: unknown operation `
          + `${reference}/${stage.capability.operationId}`,
        )
      }
      usedCapabilities.add(reference)
      stageReferences += 1
      referencedOperations.push({ stage, operation })
    }
    assertSemanticCompatibility(procedure, referencedOperations)
  }

  return {
    procedures: procedures.length,
    stageReferences,
    capabilitiesUsed: usedCapabilities.size,
  }
}

const stateAccessRank = new Map([
  ['none', 0],
  ['read', 1],
  ['write', 2],
  ['destructive', 3],
])

const resultVariabilityValues = new Set(['deterministic', 'stochastic'])
const contextSourceValues = new Set(['referenced-resource', 'runtime', 'ambient'])
const idempotencyValues = new Set(['idempotent', 'non-idempotent', 'unverified'])

function assertNormalizedSemantics(semantics, label, requireOpenWorld) {
  if (!resultVariabilityValues.has(semantics.resultVariability)) {
    throw new Error(`${label}: invalid or missing resultVariability`)
  }
  if (
    !Array.isArray(semantics.contextSources)
    || new Set(semantics.contextSources).size !== semantics.contextSources.length
    || semantics.contextSources.some((source) => !contextSourceValues.has(source))
  ) {
    throw new Error(`${label}: invalid or missing contextSources`)
  }
  if (!stateAccessRank.has(semantics.stateAccess)) {
    throw new Error(`${label}: invalid or missing stateAccess`)
  }
  if (!idempotencyValues.has(semantics.idempotency)) {
    throw new Error(`${label}: invalid or missing idempotency`)
  }
  if (requireOpenWorld && typeof semantics.openWorld !== 'boolean') {
    throw new Error(`${label}: invalid or missing openWorld`)
  }
  if (semantics.openWorld !== undefined && typeof semantics.openWorld !== 'boolean') {
    throw new Error(`${label}: invalid openWorld`)
  }
}

function normalizedCapabilitySemantics(operation) {
  const semantics = operation.semantics
  if (semantics.resultVariability !== undefined) {
    assertNormalizedSemantics(semantics, `Capability operation ${operation.id} semantics`, true)
    return semantics
  }
  const normalized = {
    resultVariability: semantics.determinism === 'probabilistic'
      ? 'stochastic'
      : 'deterministic',
    contextSources: semantics.context === 'runtime' ? ['runtime'] : [],
    stateAccess: semantics.sideEffects,
    idempotency: semantics.idempotent ? 'idempotent' : 'non-idempotent',
    openWorld: true,
  }
  assertNormalizedSemantics(normalized, `Capability operation ${operation.id} semantics`, true)
  return normalized
}

function normalizedProcedureSemantics(procedure) {
  const requireOpenWorld = procedure.schemaVersion === 'openadam.procedure-profile.v0.5'
  assertNormalizedSemantics(
    procedure.semantics,
    `${capabilityKey(procedure)} Procedure semantics`,
    requireOpenWorld,
  )
  return procedure.semantics
}

function assertSemanticCompatibility(procedure, references) {
  if (procedure.semantics === undefined) {
    throw new Error(`${capabilityKey(procedure)}: Procedure semantics are required`)
  }
  const procedureSemantics = normalizedProcedureSemantics(procedure)
  for (const { stage, operation } of references) {
    if (operation.semantics === undefined) {
      throw new Error(`${capabilityKey(procedure)} stage ${stage.id}: Capability semantics are missing`)
    }
    const capabilitySemantics = normalizedCapabilitySemantics(operation)
    if (
      stateAccessRank.get(procedureSemantics.stateAccess)
      < stateAccessRank.get(capabilitySemantics.stateAccess)
    ) {
      throw new Error(
        `${capabilityKey(procedure)} stage ${stage.id}: Procedure stateAccess `
        + `${procedureSemantics.stateAccess} understates Capability stateAccess `
        + capabilitySemantics.stateAccess,
      )
    }
    if (
      procedureSemantics.resultVariability === 'deterministic'
      && capabilitySemantics.resultVariability === 'stochastic'
    ) {
      throw new Error(
        `${capabilityKey(procedure)} stage ${stage.id}: deterministic Procedure `
        + 'cannot include a stochastic Capability operation',
      )
    }
    const missingContext = capabilitySemantics.contextSources.filter(
      (source) => !procedureSemantics.contextSources.includes(source),
    )
    if (missingContext.length > 0) {
      throw new Error(
        `${capabilityKey(procedure)} stage ${stage.id}: Procedure omits context sources `
        + missingContext.join(', '),
      )
    }
    if (
      procedureSemantics.idempotency === 'idempotent'
      && capabilitySemantics.idempotency !== 'idempotent'
    ) {
      throw new Error(
        `${capabilityKey(procedure)} stage ${stage.id}: an idempotent Procedure `
        + 'requires idempotent Capability operations',
      )
    }
    if (
      procedureSemantics.openWorld === false
      && capabilitySemantics.openWorld !== false
    ) {
      throw new Error(
        `${capabilityKey(procedure)} stage ${stage.id}: closed-world Procedure `
        + 'cannot include an open-world or unspecified Capability operation',
      )
    }
  }
}
