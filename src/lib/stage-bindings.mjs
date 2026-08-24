function key(id, version) {
  return `${id}@${version}`
}

export function validateStageProviderBindings({ profile, procedureManifest, capabilityManifests }) {
  const implementation = procedureManifest.implementations.find(
    (candidate) => candidate.procedureId === profile.id && candidate.procedureVersion === profile.version,
  )
  if (implementation === undefined) {
    throw new Error(`Procedure implementation is missing for ${key(profile.id, profile.version)}`)
  }
  const providers = new Map()
  for (const manifest of capabilityManifests) {
    const providerKey = key(manifest.provider?.id, manifest.provider?.version)
    if (providers.has(providerKey)) throw new Error(`duplicate Capability provider ${providerKey}`)
    providers.set(providerKey, manifest)
  }

  const observedProviders = new Set()
  for (const stage of implementation.stages) {
    const providerKey = key(stage.provider.id, stage.provider.version)
    const providerManifest = providers.get(providerKey)
    if (providerManifest === undefined) {
      throw new Error(`${stage.stageId}: no Capability manifest for provider ${providerKey}`)
    }
    observedProviders.add(providerKey)
    const capability = providerManifest.implementations.find(
      (candidate) =>
        candidate.capabilityId === stage.capabilityId
        && candidate.capabilityVersion === stage.capabilityVersion,
    )
    if (capability === undefined) {
      throw new Error(
        `${stage.stageId}: provider ${providerKey} does not declare `
        + key(stage.capabilityId, stage.capabilityVersion),
      )
    }
    if (stage.transport === 'capability-jsonl') {
      if (capability.adapter.protocol !== 'openadam.capability-jsonl.v0.1') {
        throw new Error(`${stage.stageId}: provider ${providerKey} has no Capability JSONL adapter`)
      }
      const adapterBinding = capability.adapterBindings?.find(
        (candidate) => candidate.operationId === stage.operationId,
      )
      if (adapterBinding === undefined) {
        throw new Error(
          `${stage.stageId}: provider ${providerKey} omits adapter operation ${stage.operationId}`,
        )
      }
      if (adapterBinding.target !== stage.target) {
        throw new Error(`${stage.stageId}: Procedure stage target differs from provider adapter manifest`)
      }
    } else {
      const binding = capability.bindings.find(
        (candidate) => candidate.operationId === stage.operationId,
      )
      if (binding === undefined) {
        throw new Error(`${stage.stageId}: provider ${providerKey} omits operation ${stage.operationId}`)
      }
      if (binding.transport !== stage.transport || binding.target !== stage.target) {
        throw new Error(`${stage.stageId}: Procedure stage transport or target differs from provider manifest`)
      }
    }
  }
  return { stages: implementation.stages.length, providers: observedProviders.size }
}
