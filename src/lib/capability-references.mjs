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

function normalizedCapabilitySemantics(operation) {
  const semantics = operation.semantics
  if (semantics.resultVariability !== undefined) return semantics
  return {
    resultVariability: semantics.determinism === 'probabilistic'
      ? 'stochastic'
      : 'deterministic',
    contextSources: semantics.context === 'runtime' ? ['runtime'] : [],
    stateAccess: semantics.sideEffects,
    idempotency: semantics.idempotent ? 'idempotent' : 'non-idempotent',
    openWorld: true,
  }
}

function normalizedProcedureSemantics(procedure) {
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
