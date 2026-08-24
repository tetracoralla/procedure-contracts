import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  compositionSuite,
  forwardManifest,
  forwardProfile,
  forwardSuite,
} from './fixtures/contracts.mjs'
import {
  canonicalJson,
  loadJson,
  validateCompositionSuite,
  validateContractSet,
  validateDocument,
} from '../src/lib/contracts.mjs'

function copy(value) {
  return structuredClone(value)
}

test('validates the single forward Procedure contract family', async () => {
  const result = await validateContractSet({
    profile: forwardProfile,
    manifest: forwardManifest,
    suite: forwardSuite,
  })
  assert.equal(result.implementation.procedureId, forwardProfile.id)
})

test('rejects unpublished legacy document families instead of retaining readers', async () => {
  for (const schemaVersion of [
    'openadam.procedure-profile.v0.1',
    'openadam.procedure-profile.v0.2',
    'openadam.procedure-receipt.v0.3',
  ]) {
    await assert.rejects(
      validateDocument({ schemaVersion }, schemaVersion),
      /unsupported or missing schemaVersion/,
    )
  }
})

test('forward Profiles reject generic checkpoints, approval fields, and receipt-shaped stages', async () => {
  const checkpoint = copy(forwardProfile)
  checkpoint.stages[0] = {
    kind: 'human-checkpoint',
    id: 'approve',
    title: 'Approve',
    purpose: 'Generic approval',
    required: true,
    dependsOn: [],
    checkpoint: { criteria: ['Looks good'] },
  }
  await assert.rejects(
    validateDocument(checkpoint, 'forward Profile'),
    /must have required property 'capability'|kind must be equal to constant/,
  )

  const approval = copy(forwardProfile)
  approval.approvalPolicy = { reviewerRole: 'owner' }
  await assert.rejects(
    validateDocument(approval, 'forward Profile'),
    /must NOT have additional properties/,
  )

  const receiptFields = copy(forwardSuite)
  receiptFields.cases[0].expect.stages = [{ stageId: 'prepare', status: 'success' }]
  await assert.rejects(
    validateDocument(receiptFields, 'forward suite'),
    /must NOT have additional properties/,
  )
})

test('canonical JSON follows RFC 8785 and rejects non-I-JSON values', () => {
  assert.equal(
    canonicalJson({ numbers: [1.0, 1e30, 0.002], label: '<' }),
    '{"label":"<","numbers":[1,1e+30,0.002]}',
  )
  assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY), /non-finite/)
  assert.throws(() => canonicalJson('\ud800'), /lone Unicode surrogate/)
})

test('JSON loading rejects duplicate object keys', async () => {
  await assert.rejects(
    loadJson(fileURLToPath(new URL('./fixtures/duplicate-keys.json', import.meta.url))),
    /duplicate JSON object key value/,
  )
})

test('SemVer accepts build metadata and rejects empty prerelease identifiers', async () => {
  const validProfile = copy(forwardProfile)
  validProfile.version = '0.1.0-rc.1+build.7'
  const validSuite = copy(forwardSuite)
  validSuite.procedureVersion = validProfile.version
  await validateContractSet({ profile: validProfile, suite: validSuite })

  const invalid = copy(forwardProfile)
  invalid.version = '1.0.0-..'
  await assert.rejects(
    validateContractSet({ profile: invalid, suite: forwardSuite }),
    /must match pattern/,
  )
})

test('rejects dependency order and implementation Capability drift', async () => {
  const invalidGraph = copy(forwardProfile)
  invalidGraph.stages[0].dependsOn = ['normalize']
  await assert.rejects(
    validateContractSet({ profile: invalidGraph, suite: forwardSuite }),
    /must name an earlier declared stage/,
  )

  const invalidBinding = copy(forwardManifest)
  invalidBinding.implementations[0].stages[0].capabilityVersion = '0.2.0'
  await assert.rejects(
    validateContractSet({
      profile: forwardProfile,
      manifest: invalidBinding,
      suite: forwardSuite,
    }),
    /binding differs from profile/,
  )
})

test('rejects undeclared errors and exact expected values outside the output schema', async () => {
  const undeclared = copy(forwardSuite)
  undeclared.cases[1].expect.code = 'UNKNOWN_ERROR'
  await assert.rejects(
    validateContractSet({ profile: forwardProfile, suite: undeclared }),
    /undeclared error code/,
  )

  const invalidOutput = copy(forwardSuite)
  invalidOutput.cases[0].expect.value = {}
  await assert.rejects(
    validateContractSet({ profile: forwardProfile, suite: invalidOutput }),
    /exact result/,
  )
})

test('validates observed composition order and complete success paths', async () => {
  await validateCompositionSuite({
    profile: forwardProfile,
    suite: forwardSuite,
    compositionSuite,
  })

  const reversed = copy(compositionSuite)
  reversed.cases[0].calls.reverse()
  await assert.rejects(
    validateCompositionSuite({
      profile: forwardProfile,
      suite: forwardSuite,
      compositionSuite: reversed,
    }),
    /reaches normalize before dependency prepare/,
  )

  const incomplete = copy(compositionSuite)
  incomplete.cases[0].calls.pop()
  await assert.rejects(
    validateCompositionSuite({
      profile: forwardProfile,
      suite: forwardSuite,
      compositionSuite: incomplete,
    }),
    /successful composition omits required stage normalize/,
  )
})

test('composition cannot continue after a Capability error', async () => {
  const invalid = copy(compositionSuite)
  invalid.cases[0].calls[0].respond = {
    ok: false,
    error: { code: 'PROVIDER_FAILED', message: 'failed' },
  }
  await assert.rejects(
    validateCompositionSuite({
      profile: forwardProfile,
      suite: forwardSuite,
      compositionSuite: invalid,
    }),
    /occurs after a Capability error/,
  )
})
