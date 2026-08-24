import { schemaDigest } from '../../src/lib/contracts.mjs'

export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['value'],
  properties: { value: { type: 'string', minLength: 1 } },
}

export const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['normalized'],
  properties: { normalized: { type: 'string', minLength: 1 } },
}

export const forwardProfile = {
  schemaVersion: 'openadam.procedure-profile.v0.3',
  id: 'test.compose',
  version: '0.1.0',
  title: 'Compose a prepared value',
  summary: 'A forward Procedure fixture with two observable Capability stages.',
  lifecycle: 'experimental',
  semantics: {
    resultVariability: 'deterministic',
    contextSources: [],
    stateAccess: 'none',
    idempotency: 'idempotent',
  },
  inputSchema,
  outputSchema,
  stages: [
    {
      kind: 'capability',
      id: 'prepare',
      title: 'Prepare',
      purpose: 'Append the marker needed by the second stage.',
      required: true,
      dependsOn: [],
      capability: { id: 'text.prepare', version: '0.1.0', operationId: 'prepare' },
    },
    {
      kind: 'capability',
      id: 'normalize',
      title: 'Normalize',
      purpose: 'Normalize the prepared value.',
      required: true,
      dependsOn: ['prepare'],
      capability: { id: 'text.normalize', version: '0.1.0', operationId: 'normalize' },
    },
  ],
  completion: {
    description: 'The normalized result came from the normalize stage.',
    outputStage: 'normalize',
  },
  errors: [
    { code: 'PROVIDER_FAILED', description: 'A bound Capability failed.', retryable: true },
  ],
}

export const forwardManifest = {
  schemaVersion: 'openadam.procedure-implementation-manifest.v0.4',
  provider: { id: 'test.composition', name: 'Test composition', version: '0.1.0' },
  implementations: [
    {
      procedureId: forwardProfile.id,
      procedureVersion: forwardProfile.version,
      adapter: {
        protocol: 'openadam.procedure-jsonl.v0.2',
        command: process.execPath,
        args: ['test/fixtures/forward-bypass-adapter.mjs'],
      },
      binding: { kind: 'library', target: 'test composition fixture' },
      contractSchemaDigests: {
        input: schemaDigest(inputSchema),
        output: schemaDigest(outputSchema),
      },
      stages: [
        {
          stageId: 'prepare',
          capabilityId: 'text.prepare',
          capabilityVersion: '0.1.0',
          operationId: 'prepare',
          provider: { id: 'test.text', name: 'Test text provider', version: '0.1.0' },
          transport: 'library',
          target: 'prepare',
        },
        {
          stageId: 'normalize',
          capabilityId: 'text.normalize',
          capabilityVersion: '0.1.0',
          operationId: 'normalize',
          provider: { id: 'test.text', name: 'Test text provider', version: '0.1.0' },
          transport: 'library',
          target: 'normalize',
        },
      ],
    },
  ],
}

export const successCase = {
  id: 'composed-value',
  description: 'Returns the expected normalized value.',
  input: { value: 'hello' },
  expect: { result: 'success', match: 'exact', value: { normalized: 'HELLO!' } },
}

export const errorCase = {
  id: 'reject-value',
  description: 'Returns the declared provider error.',
  input: { value: 'reject' },
  expect: { result: 'error', code: 'PROVIDER_FAILED', messageIncludes: 'rejected' },
}

export const forwardSuite = {
  schemaVersion: 'openadam.procedure-conformance-suite.v0.3',
  procedureId: forwardProfile.id,
  procedureVersion: forwardProfile.version,
  cases: [successCase, errorCase],
}

export const compositionSuite = {
  schemaVersion: 'openadam.procedure-composition-suite.v0.1',
  procedureId: forwardProfile.id,
  procedureVersion: forwardProfile.version,
  cases: [
    {
      id: 'composed-value',
      calls: [
        {
          stageId: 'prepare',
          input: { value: 'hello' },
          respond: { ok: true, result: { prepared: 'hello!' } },
        },
        {
          stageId: 'normalize',
          input: { value: 'hello!' },
          respond: { ok: true, result: { normalized: 'HELLO!' } },
        },
      ],
    },
  ],
}
