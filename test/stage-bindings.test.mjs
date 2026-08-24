import assert from 'node:assert/strict'
import test from 'node:test'
import { validateStageProviderBindings } from '../src/lib/stage-bindings.mjs'
import { forwardManifest, forwardProfile } from './fixtures/contracts.mjs'

const capabilityManifest = {
  provider: { id: 'test.text', name: 'Test text provider', version: '0.1.0' },
  implementations: [
    {
      capabilityId: 'text.prepare',
      capabilityVersion: '0.1.0',
      bindings: [{ operationId: 'prepare', transport: 'library', target: 'prepare' }],
    },
    {
      capabilityId: 'text.normalize',
      capabilityVersion: '0.1.0',
      bindings: [{ operationId: 'normalize', transport: 'library', target: 'normalize' }],
    },
  ],
}

test('resolves Procedure stage targets against current Capability provider manifests', () => {
  assert.deepEqual(
    validateStageProviderBindings({
      profile: forwardProfile,
      procedureManifest: forwardManifest,
      capabilityManifests: [capabilityManifest],
    }),
    { stages: 2, providers: 1 },
  )
})

test('rejects a Procedure provider or target that no Capability manifest supports', () => {
  const fakeProvider = structuredClone(forwardManifest)
  fakeProvider.implementations[0].stages[0].provider.id = 'test.fake'
  assert.throws(
    () => validateStageProviderBindings({
      profile: forwardProfile,
      procedureManifest: fakeProvider,
      capabilityManifests: [capabilityManifest],
    }),
    /no Capability manifest for provider test.fake@0.1.0/,
  )

  const wrongTarget = structuredClone(forwardManifest)
  wrongTarget.implementations[0].stages[0].target = 'different'
  assert.throws(
    () => validateStageProviderBindings({
      profile: forwardProfile,
      procedureManifest: wrongTarget,
      capabilityManifests: [capabilityManifest],
    }),
    /transport or target differs/,
  )
})
