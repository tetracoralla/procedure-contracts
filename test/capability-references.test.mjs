import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCapabilityReferences } from '../src/lib/capability-references.mjs'

const capability = {
  id: 'org.openadam.example.inspect',
  version: '0.1.0',
  operations: [{
    id: 'inspect',
    semantics: {
      resultVariability: 'deterministic',
      contextSources: ['referenced-resource'],
      stateAccess: 'read',
      idempotency: 'idempotent',
    },
  }],
}

function procedure(reference = {
  id: capability.id,
  version: capability.version,
  operationId: 'inspect',
}) {
  return {
    schemaVersion: 'openadam.procedure-profile.v0.3',
    id: 'org.openadam.example.review',
    version: '0.1.0',
    semantics: {
      resultVariability: 'deterministic',
      contextSources: ['referenced-resource'],
      stateAccess: 'read',
      idempotency: 'idempotent',
    },
    stages: [
      {
        kind: 'capability',
        id: 'inspect',
        capability: reference,
      },
    ],
  }
}

test('resolves every Procedure capability stage against the Capability catalog', () => {
  assert.deepEqual(
    validateCapabilityReferences({ capabilities: [capability], procedures: [procedure()] }),
    { procedures: 1, stageReferences: 1, capabilitiesUsed: 1 },
  )
})

test('rejects a Procedure reference to an unknown Capability version', () => {
  assert.throws(
    () => validateCapabilityReferences({
      capabilities: [capability],
      procedures: [procedure({ ...capability, version: '0.2.0', operationId: 'inspect' })],
    }),
    /unknown Capability org\.openadam\.example\.inspect@0\.2\.0/,
  )
})

test('rejects a Procedure reference to an unknown Capability operation', () => {
  assert.throws(
    () => validateCapabilityReferences({
      capabilities: [capability],
      procedures: [procedure({
        id: capability.id,
        version: capability.version,
        operationId: 'render',
      })],
    }),
    /unknown operation org\.openadam\.example\.inspect@0\.1\.0\/render/,
  )
})

test('rejects a Procedure that understates reachable state access', () => {
  const invalid = procedure()
  invalid.semantics.stateAccess = 'none'
  assert.throws(
    () => validateCapabilityReferences({ capabilities: [capability], procedures: [invalid] }),
    /understates Capability stateAccess read/,
  )
})

test('rejects variability, context, or idempotency claims contradicted by a Capability stage', () => {
  const variable = structuredClone(capability)
  variable.operations[0].semantics.resultVariability = 'stochastic'
  const invalid = procedure()
  assert.throws(
    () => validateCapabilityReferences({ capabilities: [variable], procedures: [invalid] }),
    /cannot include a stochastic Capability/,
  )
  variable.operations[0].semantics.resultVariability = 'deterministic'
  invalid.semantics.contextSources = []
  assert.throws(
    () => validateCapabilityReferences({ capabilities: [variable], procedures: [invalid] }),
    /omits context sources referenced-resource/,
  )
  invalid.semantics.contextSources = ['referenced-resource']
  variable.operations[0].semantics.idempotency = 'unverified'
  assert.throws(
    () => validateCapabilityReferences({ capabilities: [variable], procedures: [invalid] }),
    /requires idempotent Capability operations/,
  )
})
