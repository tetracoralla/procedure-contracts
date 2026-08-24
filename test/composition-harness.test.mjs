import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompositionHarness } from '../src/lib/composition-harness.mjs'
import {
  compositionSuite,
  forwardManifest,
  forwardProfile,
} from './fixtures/contracts.mjs'

test('composition harness keeps mismatch details out of HTTP responses', async () => {
  const harness = await createCompositionHarness({
    profile: forwardProfile,
    implementation: forwardManifest.implementations[0],
  })
  try {
    harness.begin(compositionSuite.cases[0])
    const bindings = JSON.parse(harness.environment).bindings
    const response = await fetch(bindings[0].target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unexpectedSecretField: 'do-not-reflect' }),
    })
    const body = await response.json()

    assert.equal(response.status, 409)
    assert.deepEqual(body, {
      ok: false,
      error: {
        code: 'CONFORMANCE_CALL_MISMATCH',
        message: 'Capability call did not match the active conformance case.',
      },
    })
    assert.doesNotMatch(JSON.stringify(body), /unexpectedSecretField|do-not-reflect/)
    assert.throws(() => harness.finish(), /Invalid Capability harness request fields/)
  } finally {
    await harness.close()
  }
})
