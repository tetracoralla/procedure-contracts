import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const schemaFiles = new Map([
  ['openadam.procedure-profile.v0.3', 'schemas/procedure-profile.schema.v0.3.json'],
  [
    'openadam.procedure-implementation-manifest.v0.4',
    'schemas/procedure-implementation-manifest.schema.v0.4.json',
  ],
  [
    'openadam.procedure-conformance-suite.v0.3',
    'schemas/procedure-conformance-suite.schema.v0.3.json',
  ],
  [
    'openadam.procedure-composition-suite.v0.1',
    'schemas/procedure-composition-suite.schema.v0.1.json',
  ],
])

export async function loadJson(path) {
  return parseJson(await readFile(path, 'utf8'), path)
}

export function parseJson(source, label = 'JSON') {
  assertNoDuplicateObjectKeys(source, label)
  return JSON.parse(source)
}

function assertNoDuplicateObjectKeys(source, label) {
  let offset = 0
  function skipWhitespace() {
    while (/\s/u.test(source[offset] ?? '')) offset += 1
  }
  function parseString() {
    const start = offset
    offset += 1
    while (offset < source.length) {
      if (source[offset] === '\\') offset += 2
      else if (source[offset] === '"') {
        offset += 1
        return JSON.parse(source.slice(start, offset))
      } else offset += 1
    }
    throw new Error(`${label}: unterminated JSON string`)
  }
  function parseValue() {
    skipWhitespace()
    if (source[offset] === '{') return parseObject()
    if (source[offset] === '[') return parseArray()
    if (source[offset] === '"') {
      parseString()
      return
    }
    while (offset < source.length && !/[\s,\]}]/u.test(source[offset])) offset += 1
  }
  function parseObject() {
    const keys = new Set()
    offset += 1
    skipWhitespace()
    if (source[offset] === '}') {
      offset += 1
      return
    }
    while (offset < source.length) {
      skipWhitespace()
      if (source[offset] !== '"') return
      const key = parseString()
      if (keys.has(key)) throw new Error(`${label}: duplicate JSON object key ${key}`)
      keys.add(key)
      skipWhitespace()
      if (source[offset] !== ':') return
      offset += 1
      parseValue()
      skipWhitespace()
      if (source[offset] === '}') {
        offset += 1
        return
      }
      if (source[offset] !== ',') return
      offset += 1
    }
  }
  function parseArray() {
    offset += 1
    skipWhitespace()
    if (source[offset] === ']') {
      offset += 1
      return
    }
    while (offset < source.length) {
      parseValue()
      skipWhitespace()
      if (source[offset] === ']') {
        offset += 1
        return
      }
      if (source[offset] !== ',') return
      offset += 1
    }
  }
  parseValue()
}

function createAjv(schema) {
  const Constructor = schema?.$schema?.includes('draft-07') ? Ajv : Ajv2020
  const ajv = new Constructor({ allErrors: true, strict: false, validateFormats: true })
  addFormats(ajv)
  return ajv
}

function formatErrors(errors = []) {
  return errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')
}

export async function validateDocument(document, label = 'document') {
  const schemaFile = schemaFiles.get(document?.schemaVersion)
  if (schemaFile === undefined) throw new Error(`${label}: unsupported or missing schemaVersion`)
  validateAgainstSchema(await loadJson(resolve(moduleRoot, schemaFile)), document, label)
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JCS does not permit non-finite numbers')
    return JSON.stringify(value)
  }
  if (typeof value === 'string') {
    assertUnicodeScalarString(value)
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    const items = []
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new Error('JCS does not permit sparse arrays')
      items.push(canonicalJson(value[index]))
    }
    return `[${items.join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        assertUnicodeScalarString(key)
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`
      })
      .join(',')}}`
  }
  throw new Error(`JCS cannot serialize ${typeof value}`)
}

function assertUnicodeScalarString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error('JCS does not permit lone Unicode surrogates')
      }
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('JCS does not permit lone Unicode surrogates')
    }
  }
}

export function schemaDigest(schema) {
  return `sha256:${createHash('sha256').update(canonicalJson(schema)).digest('hex')}`
}

export function deepSubset(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && expected.every((item, index) => deepSubset(actual[index], item))
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false
    return Object.entries(expected).every(
      ([key, value]) => Object.hasOwn(actual, key) && deepSubset(actual[key], value),
    )
  }
  return Object.is(actual, expected)
}

export function validateAgainstSchema(schema, value, label) {
  const validate = createAjv(schema).compile(schema)
  if (!validate(value)) throw new Error(`${label}: ${formatErrors(validate.errors)}`)
}

function assertUnique(values, label) {
  const seen = new Set()
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label}: duplicate id ${value}`)
    seen.add(value)
  }
}

function assertRelativePath(path, label) {
  if (isAbsolute(path)) throw new Error(`${label} must be relative to the implementation root`)
}

async function resolveContractSchema(schema, profileBase, label) {
  const reference = schema?.$ref
  if (
    typeof reference !== 'string'
    || (!reference.startsWith('./') && !reference.startsWith('../'))
  ) return schema
  if (profileBase === undefined) {
    throw new Error(`${label}: relative schema reference requires a profile path`)
  }
  const schemaPath = resolve(profileBase, reference)
  if (schemaPath !== profileBase && !schemaPath.startsWith(`${profileBase}/`)) {
    throw new Error(`${label}: schema reference escapes the profile directory`)
  }
  return loadJson(schemaPath)
}

export async function resolveProcedureSchemas(profile, profilePath) {
  const profileBase = profilePath === undefined ? undefined : dirname(profilePath)
  return {
    input: await resolveContractSchema(profile.inputSchema, profileBase, 'inputSchema'),
    output: await resolveContractSchema(profile.outputSchema, profileBase, 'outputSchema'),
  }
}

function assertStageGraph(profile) {
  assertUnique(profile.stages.map((stage) => stage.id), 'profile stages')
  const prior = new Set()
  for (const stage of profile.stages) {
    assertUnique(stage.dependsOn, `${stage.id} dependencies`)
    for (const dependency of stage.dependsOn) {
      if (!prior.has(dependency)) {
        throw new Error(`${stage.id}: dependency ${dependency} must name an earlier declared stage`)
      }
    }
    prior.add(stage.id)
  }
  const outputStage = profile.stages.find((stage) => stage.id === profile.completion.outputStage)
  if (outputStage === undefined) throw new Error('completion outputStage does not exist')
  if (!outputStage.required) throw new Error('completion outputStage must be required')
}

export async function validateContractSet({ profile, profilePath, manifest, suite }) {
  await validateDocument(profile, 'procedure profile')
  await validateDocument(suite, 'conformance suite')
  if (manifest !== undefined) await validateDocument(manifest, 'implementation manifest')

  if (suite.procedureId !== profile.id || suite.procedureVersion !== profile.version) {
    throw new Error('conformance suite procedure identity does not match profile')
  }
  assertStageGraph(profile)
  assertUnique(profile.errors.map((error) => error.code), 'profile errors')
  assertUnique(suite.cases.map((testCase) => testCase.id), 'conformance cases')

  const schemas = await resolveProcedureSchemas(profile, profilePath)
  const declaredErrors = new Set(profile.errors.map((error) => error.code))
  for (const testCase of suite.cases) {
    validateAgainstSchema(schemas.input, testCase.input, `${testCase.id} input`)
    if (testCase.expect.result === 'error') {
      if (!declaredErrors.has(testCase.expect.code)) {
        throw new Error(`${testCase.id}: undeclared error code ${testCase.expect.code}`)
      }
    } else if (testCase.expect.match === 'exact') {
      validateAgainstSchema(schemas.output, testCase.expect.value, `${testCase.id} exact result`)
    }
  }

  if (manifest === undefined) return { schemas }
  assertUnique(
    manifest.implementations.map(
      (candidate) => `${candidate.procedureId}@${candidate.procedureVersion}`,
    ),
    'manifest implementations',
  )
  const implementation = manifest.implementations.find(
    (candidate) => candidate.procedureId === profile.id
      && candidate.procedureVersion === profile.version,
  )
  if (implementation === undefined) {
    throw new Error(`${manifest.provider.id} does not implement ${profile.id}@${profile.version}`)
  }
  if (implementation.adapter.cwd !== undefined) {
    assertRelativePath(implementation.adapter.cwd, 'implementation adapter cwd')
  }
  if (implementation.contractSchemaDigests.input !== schemaDigest(schemas.input)) {
    throw new Error('implementation input schema digest differs from Procedure Profile')
  }
  if (implementation.contractSchemaDigests.output !== schemaDigest(schemas.output)) {
    throw new Error('implementation output schema digest differs from Procedure Profile')
  }

  assertUnique(implementation.stages.map((stage) => stage.stageId), 'implementation stages')
  const declaredStageIds = profile.stages.map((stage) => stage.id)
  const boundStageIds = implementation.stages.map((stage) => stage.stageId)
  if (canonicalJson(boundStageIds) !== canonicalJson(declaredStageIds)) {
    throw new Error('implementation stages must exactly follow Procedure stage order')
  }
  for (const [index, stage] of profile.stages.entries()) {
    const binding = implementation.stages[index]
    if (
      binding.capabilityId !== stage.capability.id
      || binding.capabilityVersion !== stage.capability.version
      || binding.operationId !== stage.capability.operationId
    ) throw new Error(`${stage.id}: implementation capability binding differs from profile`)
  }
  return { implementation, schemas }
}

export async function validateCompositionSuite({ profile, suite, compositionSuite }) {
  await validateDocument(compositionSuite, 'composition conformance suite')
  if (
    compositionSuite.procedureId !== profile.id
    || compositionSuite.procedureVersion !== profile.version
  ) throw new Error('composition suite procedure identity does not match profile')

  assertUnique(compositionSuite.cases.map((testCase) => testCase.id), 'composition cases')
  const portableCases = new Map(suite.cases.map((testCase) => [testCase.id, testCase]))
  const stages = new Map(profile.stages.map((stage) => [stage.id, stage]))

  for (const testCase of compositionSuite.cases) {
    const portableCase = portableCases.get(testCase.id)
    if (portableCase === undefined) {
      throw new Error(`${testCase.id}: composition case has no matching portable case`)
    }
    const completedStages = new Set()
    let failed = false
    for (const [index, call] of testCase.calls.entries()) {
      if (failed) throw new Error(`${testCase.id}: call ${index} occurs after a Capability error`)
      const stage = stages.get(call.stageId)
      if (stage === undefined) {
        throw new Error(`${testCase.id}: call ${index} names unknown stage ${call.stageId}`)
      }
      if (completedStages.has(stage.id)) {
        throw new Error(`${testCase.id}: call ${index} repeats stage ${stage.id}`)
      }
      for (const dependency of stage.dependsOn) {
        if (!completedStages.has(dependency)) {
          throw new Error(`${testCase.id}: call ${index} reaches ${stage.id} before dependency ${dependency}`)
        }
      }
      completedStages.add(stage.id)
      failed = call.respond.ok === false
    }
    if (portableCase.expect.result === 'success') {
      for (const stage of profile.stages) {
        if (stage.required && !completedStages.has(stage.id)) {
          throw new Error(`${testCase.id}: successful composition omits required stage ${stage.id}`)
        }
      }
      if (failed) throw new Error(`${testCase.id}: successful composition contains a Capability error`)
    }
  }
}
