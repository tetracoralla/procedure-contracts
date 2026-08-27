import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  compositionSuite,
  forwardManifest,
  forwardProfile,
  forwardSuite,
  successCase,
} from './fixtures/contracts.mjs'
import {
  assertUniqueSemanticIdentities,
  canonicalJson,
  loadJson,
  parseJson,
  procedureProfileDigest,
  validateCompositionSuite,
  validateContractSet,
  validateDocument,
} from '../src/lib/contracts.mjs'
import { assertCatalogProfileFormat } from '../src/validate-catalog.mjs'

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

test('the catalog accepts only named retained v0.3/v0.4 identities and uses v0.5 forward', () => {
  assert.doesNotThrow(() => assertCatalogProfileFormat({
    schemaVersion: 'openadam.procedure-profile.v0.3',
    id: 'org.openadam.brand-asset.prepare',
    version: '0.1.0',
  }))
  assert.doesNotThrow(() => assertCatalogProfileFormat(forwardProfile))
  assert.doesNotThrow(() => assertCatalogProfileFormat({
    schemaVersion: 'openadam.procedure-profile.v0.4',
    id: 'org.openadam.structured-data.preflight',
    version: '0.2.0',
  }))
  assert.throws(
    () => assertCatalogProfileFormat({
      schemaVersion: 'openadam.procedure-profile.v0.3',
      id: 'org.openadam.new-procedure',
      version: '0.1.0',
    }),
    /new catalog entries cannot use retained Procedure Profile v0.3/,
  )
  assert.throws(
    () => assertCatalogProfileFormat({
      schemaVersion: 'openadam.procedure-profile.v0.4',
      id: 'org.openadam.new-procedure',
      version: '0.2.0',
    }),
    /new catalog entries cannot use retained Procedure Profile v0.4/,
  )
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
  assert.throws(() => canonicalJson(9007199254740992), /unsafe integers/)
  assert.throws(() => canonicalJson('\ud800'), /lone Unicode surrogate/)
})

test('strict JSON rejects unsafe integer literals before they can collide', () => {
  assert.throws(
    () => parseJson('{"value":9007199254740993}', 'unsafe integer fixture'),
    /safe range or encoded as a string/,
  )
  assert.throws(
    () => parseJson('{"value":9007199254740993e0}', 'unsafe scientific integer fixture'),
    /loses IEEE-754 precision/,
  )
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

test('current Procedures cannot make a required stage depend on an optional stage', async () => {
  const invalidGraph = copy(forwardProfile)
  invalidGraph.inputSchema.properties.extra = { type: 'boolean' }
  invalidGraph.stages.splice(1, 0, {
    kind: 'capability',
    id: 'optional',
    title: 'Optional',
    purpose: 'Run only when extra input is present.',
    required: false,
    condition: { inputPresent: '/extra' },
    dependsOn: ['prepare'],
    capability: { id: 'text.optional', version: '0.1.0', operationId: 'optional' },
  })
  invalidGraph.stages[2].dependsOn = ['optional']
  await assert.rejects(
    validateContractSet({ profile: invalidGraph, suite: forwardSuite }),
    /dependency optional may be absent; use afterIfExecuted/,
  )
})

test('implementation manifests bind the complete Procedure Profile', async () => {
  const drifted = copy(forwardProfile)
  drifted.stages[0].purpose = 'A different method with unchanged input and output schemas.'
  await assert.rejects(
    validateContractSet({ profile: drifted, manifest: forwardManifest, suite: forwardSuite }),
    /implementation profile digest differs/,
  )
  assert.notEqual(
    await procedureProfileDigest(drifted),
    forwardManifest.implementations[0].profileDigest,
  )
})

test('catalog semantic identities are unique across Procedure documents', () => {
  assert.throws(
    () => assertUniqueSemanticIdentities([forwardProfile, copy(forwardProfile)], 'catalog'),
    /duplicate id test.compose@0.1.0/,
  )
})

test('method corrections use new Procedure versions instead of rewriting old identities', async () => {
  const brandV01 = await loadJson(
    fileURLToPath(new URL('../catalog/procedures/brand-asset-prepare.v0.1.json', import.meta.url)),
  )
  const brandV02 = await loadJson(
    fileURLToPath(new URL('../catalog/procedures/brand-asset-prepare.v0.2.json', import.meta.url)),
  )
  const brandV03 = await loadJson(
    fileURLToPath(new URL('../catalog/procedures/brand-asset-prepare.v0.3.json', import.meta.url)),
  )
  const preflightV01 = await loadJson(
    fileURLToPath(new URL('../catalog/procedures/structured-data-preflight.v0.1.json', import.meta.url)),
  )
  const preflightV02 = await loadJson(
    fileURLToPath(new URL('../catalog/procedures/structured-data-preflight.v0.2.json', import.meta.url)),
  )
  const preflightV03 = await loadJson(
    fileURLToPath(new URL('../catalog/procedures/structured-data-preflight.v0.3.json', import.meta.url)),
  )

  assert.equal(brandV01.schemaVersion, 'openadam.procedure-profile.v0.3')
  assert.equal(brandV01.semantics.stateAccess, 'write')
  assert.equal(brandV02.version, '0.2.0')
  assert.equal(brandV02.semantics.stateAccess, 'destructive')
  assert.equal(brandV02.stages.find(({ id }) => id === 'resize').afterIfExecuted[0], 'render-projective')
  assert.equal(brandV03.semantics.openWorld, false)
  assert.equal(preflightV01.completion.outputStage, 'inspect-data')
  assert.equal(preflightV02.version, '0.2.0')
  assert.equal(preflightV02.completion.branches.length, 2)
  assert.equal(preflightV03.semantics.openWorld, false)
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
    /successful composition omits active stage normalize/,
  )
})

test('retained v0.3 Profiles validate observed composition without interpreting prose conditions', async () => {
  const profile = await loadJson(
    fileURLToPath(new URL('../catalog/procedures/structured-data-preflight.v0.1.json', import.meta.url)),
  )
  const suite = await loadJson(
    fileURLToPath(new URL('../catalog/conformance/structured-data-preflight.v0.1.json', import.meta.url)),
  )
  const composition = {
    schemaVersion: 'openadam.procedure-composition-suite.v0.1',
    procedureId: profile.id,
    procedureVersion: profile.version,
    cases: [
      {
        id: 'constraints-pass',
        calls: [
          { stageId: 'inspect-file', input: {}, respond: { ok: true, result: {} } },
          { stageId: 'inspect-data', input: {}, respond: { ok: true, result: {} } },
          { stageId: 'validate-data', input: {}, respond: { ok: true, result: {} } },
        ],
      },
    ],
  }

  await assert.doesNotReject(validateCompositionSuite({ profile, suite, compositionSuite: composition }))
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

test('conditional stages can be skipped while afterIfExecuted still preserves active order', async () => {
  const conditionalProfile = copy(forwardProfile)
  conditionalProfile.inputSchema.properties.extra = { type: 'boolean' }
  conditionalProfile.stages.splice(1, 0, {
    kind: 'capability',
    id: 'optional',
    title: 'Optional',
    purpose: 'Run only when the explicit extra input is present.',
    required: false,
    condition: { inputPresent: '/extra' },
    dependsOn: ['prepare'],
    capability: { id: 'text.optional', version: '0.1.0', operationId: 'optional' },
  })
  conditionalProfile.stages[2].dependsOn = ['prepare']
  conditionalProfile.stages[2].afterIfExecuted = ['optional']
  const conditionalSuite = {
    ...copy(forwardSuite),
    cases: [
      { ...copy(successCase), id: 'without-extra' },
      { ...copy(successCase), id: 'with-extra', input: { value: 'hello', extra: true } },
    ],
  }
  const conditionalComposition = {
    ...copy(compositionSuite),
    claimLevel: 'conditional-composition',
    cases: [
      { ...copy(compositionSuite.cases[0]), id: 'without-extra' },
      {
        id: 'with-extra',
        calls: [
          copy(compositionSuite.cases[0].calls[0]),
          {
            stageId: 'optional',
            input: { value: 'hello!' },
            respond: { ok: true, result: { prepared: 'hello!' } },
          },
          copy(compositionSuite.cases[0].calls[1]),
        ],
      },
    ],
  }
  await validateContractSet({ profile: conditionalProfile, suite: conditionalSuite })
  await validateCompositionSuite({
    profile: conditionalProfile,
    suite: conditionalSuite,
    compositionSuite: conditionalComposition,
  })

  const oneSidedSuite = copy(conditionalSuite)
  oneSidedSuite.cases = [oneSidedSuite.cases[0]]
  const oneSidedComposition = copy(conditionalComposition)
  oneSidedComposition.cases = [oneSidedComposition.cases[0]]
  await assert.rejects(
    validateCompositionSuite({
      profile: conditionalProfile,
      suite: oneSidedSuite,
      compositionSuite: oneSidedComposition,
    }),
    /requires success coverage for both active and inactive paths of optional/,
  )

  const missingActiveStage = copy(conditionalComposition)
  missingActiveStage.cases[1].calls.splice(1, 1)
  await assert.rejects(
    validateCompositionSuite({
      profile: conditionalProfile,
      suite: conditionalSuite,
      compositionSuite: missingActiveStage,
    }),
    /reaches normalize before active predecessor optional|omits active stage optional/,
  )
})
