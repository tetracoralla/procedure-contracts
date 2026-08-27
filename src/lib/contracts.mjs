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
  ['openadam.procedure-profile.v0.4', 'schemas/procedure-profile.schema.v0.4.json'],
  ['openadam.procedure-profile.v0.5', 'schemas/procedure-profile.schema.v0.5.json'],
  [
    'openadam.procedure-implementation-manifest.v0.4',
    'schemas/procedure-implementation-manifest.schema.v0.4.json',
  ],
  [
    'openadam.procedure-implementation-manifest.v0.5',
    'schemas/procedure-implementation-manifest.schema.v0.5.json',
  ],
  [
    'openadam.procedure-conformance-suite.v0.3',
    'schemas/procedure-conformance-suite.schema.v0.3.json',
  ],
  [
    'openadam.procedure-conformance-suite.v0.4',
    'schemas/procedure-conformance-suite.schema.v0.4.json',
  ],
  [
    'openadam.procedure-composition-suite.v0.1',
    'schemas/procedure-composition-suite.schema.v0.1.json',
  ],
  [
    'openadam.procedure-composition-suite.v0.2',
    'schemas/procedure-composition-suite.schema.v0.2.json',
  ],
])

export async function loadJson(path) {
  return parseJson(await readFile(path, 'utf8'), path)
}

export function parseJson(source, label = 'JSON') {
  assertNoDuplicateObjectKeys(source, label)
  const value = JSON.parse(source)
  assertJsonDataModel(value, label)
  return value
}

function assertJsonDataModel(value, label) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return
  if (typeof value === 'string') {
    assertUnicodeScalarString(value)
    return
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new Error(`${label}: sparse arrays are not permitted`)
      assertJsonDataModel(value[index], label)
    }
    return
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      assertUnicodeScalarString(key)
      assertJsonDataModel(item, label)
    }
    return
  }
  throw new Error(`${label}: unsupported JSON value ${typeof value}`)
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
    const start = offset
    while (offset < source.length && !/[\s,\]}]/u.test(source[offset])) offset += 1
    const token = source.slice(start, offset)
    if (/^-?(?:0|[1-9][0-9]*)$/u.test(token)) {
      const integer = BigInt(token)
      if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new Error(`${label}: JSON integer must be within the IEEE-754 safe range or encoded as a string`)
      }
    } else if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(token)) {
      const number = Number(token)
      if (Number.isInteger(number) && !Number.isSafeInteger(number) && Math.abs(number) < 1e21) {
        throw new Error(`${label}: JSON integer-valued number loses IEEE-754 precision and must be encoded as a string`)
      }
    }
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
    if (
      Number.isInteger(value)
      && !Number.isSafeInteger(value)
      && Math.abs(value) < 1e21
    ) throw new Error('JCS requires unsafe integers to be encoded as strings')
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

export function assertUniqueSemanticIdentities(documents, label) {
  assertUnique(documents.map((document) => `${document.id}@${document.version}`), label)
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

export async function procedureProfileDigest(profile, profilePath) {
  const schemas = await resolveProcedureSchemas(profile, profilePath)
  const { $schema: ignoredSchemaLocation, ...profileFields } = profile
  void ignoredSchemaLocation
  return schemaDigest({
    ...profileFields,
    inputSchema: schemas.input,
    outputSchema: schemas.output,
  })
}

function decodePointerToken(token) {
  return token.replace(/~1/gu, '/').replace(/~0/gu, '~')
}

function inputPointerPresent(input, pointer) {
  let current = input
  for (const token of pointer.slice(1).split('/').map(decodePointerToken)) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, token)) {
      return false
    }
    current = current[token]
  }
  return true
}

export function conditionMatches(condition, input) {
  if (condition === null || typeof condition !== 'object' || Array.isArray(condition)) {
    throw new Error('structured Procedure condition is required for mechanical evaluation')
  }
  if (condition.inputPresent !== undefined) {
    return inputPointerPresent(input, condition.inputPresent)
  }
  return !inputPointerPresent(input, condition.inputAbsent)
}

export function activeStageIds(profile, input) {
  return new Set(profile.stages
    .filter((stage) => stage.required || conditionMatches(stage.condition, input))
    .map((stage) => stage.id))
}

export function completionStageId(profile, input) {
  if (profile.completion.outputStage !== undefined) return profile.completion.outputStage
  const matching = profile.completion.branches.filter((branch) => conditionMatches(branch.when, input))
  if (matching.length !== 1) {
    throw new Error(`completion conditions match ${matching.length} branches instead of exactly one`)
  }
  return matching[0].outputStage
}

function assertStageGraph(profile) {
  assertUnique(profile.stages.map((stage) => stage.id), 'profile stages')
  const prior = new Map()
  for (const stage of profile.stages) {
    assertUnique(stage.dependsOn, `${stage.id} dependencies`)
    const conditionalPredecessors = stage.afterIfExecuted ?? []
    assertUnique(conditionalPredecessors, `${stage.id} afterIfExecuted`)
    const overlap = stage.dependsOn.filter((dependency) => conditionalPredecessors.includes(dependency))
    if (overlap.length > 0) {
      throw new Error(`${stage.id}: dependencies cannot also appear in afterIfExecuted: ${overlap.join(', ')}`)
    }
    for (const dependency of stage.dependsOn) {
      const dependencyStage = prior.get(dependency)
      if (dependencyStage === undefined) {
        throw new Error(`${stage.id}: dependency ${dependency} must name an earlier declared stage`)
      }
      if (
        ['openadam.procedure-profile.v0.4', 'openadam.procedure-profile.v0.5'].includes(profile.schemaVersion)
        && dependencyStage.required !== true
      ) {
        throw new Error(
          `${stage.id}: dependency ${dependency} may be absent; use afterIfExecuted for conditional predecessors`,
        )
      }
    }
    for (const predecessor of conditionalPredecessors) {
      const predecessorStage = prior.get(predecessor)
      if (predecessorStage === undefined) {
        throw new Error(`${stage.id}: afterIfExecuted ${predecessor} must name an earlier declared stage`)
      }
      if (predecessorStage.required || predecessorStage.condition === undefined) {
        throw new Error(`${stage.id}: afterIfExecuted ${predecessor} must name a conditional stage`)
      }
    }
    prior.set(stage.id, stage)
  }
  const stageById = new Map(profile.stages.map((stage) => [stage.id, stage]))
  if (profile.completion.outputStage !== undefined) {
    const outputStage = stageById.get(profile.completion.outputStage)
    if (outputStage === undefined) throw new Error('completion outputStage does not exist')
    if (!outputStage.required) throw new Error('fixed completion outputStage must be required')
    return
  }
  const [first, second] = profile.completion.branches
  const firstPointer = first.when.inputPresent ?? first.when.inputAbsent
  const secondPointer = second.when.inputPresent ?? second.when.inputAbsent
  const complementary = firstPointer === secondPointer
    && Object.hasOwn(first.when, 'inputPresent') !== Object.hasOwn(second.when, 'inputPresent')
  if (!complementary) {
    throw new Error('completion branches must be complementary present/absent conditions for one input pointer')
  }
  for (const branch of profile.completion.branches) {
    const outputStage = stageById.get(branch.outputStage)
    if (outputStage === undefined) throw new Error(`completion outputStage ${branch.outputStage} does not exist`)
    if (!outputStage.required && canonicalJson(outputStage.condition) !== canonicalJson(branch.when)) {
      throw new Error(`completion branch for ${branch.outputStage} differs from the stage condition`)
    }
  }
}

export async function validateContractSet({ profile, profilePath, manifest, suite }) {
  await validateDocument(profile, 'procedure profile')
  await validateDocument(suite, 'conformance suite')
  if (manifest !== undefined) await validateDocument(manifest, 'implementation manifest')

  if (
    ['openadam.procedure-profile.v0.4', 'openadam.procedure-profile.v0.5'].includes(profile.schemaVersion)
    && suite.schemaVersion !== 'openadam.procedure-conformance-suite.v0.4'
  ) throw new Error('current Procedure Profiles require result conformance suite v0.4')
  if (
    manifest !== undefined
    && ['openadam.procedure-profile.v0.4', 'openadam.procedure-profile.v0.5'].includes(profile.schemaVersion)
    && manifest.schemaVersion !== 'openadam.procedure-implementation-manifest.v0.5'
  ) throw new Error('current Procedure Profiles require implementation manifest v0.5 semantic binding')

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
    if (
      testCase.expect.result === 'success'
      && ['openadam.procedure-profile.v0.4', 'openadam.procedure-profile.v0.5'].includes(profile.schemaVersion)
    ) {
      const active = activeStageIds(profile, testCase.input)
      const outputStage = completionStageId(profile, testCase.input)
      if (!active.has(outputStage)) {
        throw new Error(`${testCase.id}: completion output stage ${outputStage} is inactive`)
      }
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
  if (manifest.schemaVersion === 'openadam.procedure-implementation-manifest.v0.5') {
    const expectedProfileDigest = await procedureProfileDigest(profile, profilePath)
    if (implementation.profileDigest !== expectedProfileDigest) {
      throw new Error('implementation profile digest differs from the Procedure Profile')
    }
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
    ['openadam.procedure-profile.v0.4', 'openadam.procedure-profile.v0.5'].includes(profile.schemaVersion)
    && compositionSuite.schemaVersion !== 'openadam.procedure-composition-suite.v0.2'
  ) throw new Error('current Procedure Profiles require composition suite v0.2')
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
    const hasMechanicalConditions = profile.schemaVersion !== 'openadam.procedure-profile.v0.3'
    const activeStages = hasMechanicalConditions
      ? activeStageIds(profile, portableCase.input)
      : new Set(profile.stages.map((stage) => stage.id))
    const requiredSuccessfulStages = hasMechanicalConditions
      ? activeStages
      : new Set(profile.stages.filter((stage) => stage.required).map((stage) => stage.id))
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
      if (!activeStages.has(stage.id)) {
        throw new Error(`${testCase.id}: call ${index} executes inactive stage ${stage.id}`)
      }
      for (const dependency of stage.dependsOn) {
        if (!completedStages.has(dependency)) {
          throw new Error(`${testCase.id}: call ${index} reaches ${stage.id} before dependency ${dependency}`)
        }
      }
      for (const predecessor of stage.afterIfExecuted ?? []) {
        if (activeStages.has(predecessor) && !completedStages.has(predecessor)) {
          throw new Error(`${testCase.id}: call ${index} reaches ${stage.id} before active predecessor ${predecessor}`)
        }
      }
      completedStages.add(stage.id)
      failed = call.respond.ok === false
    }
    if (portableCase.expect.result === 'success') {
      for (const stageId of requiredSuccessfulStages) {
        if (!completedStages.has(stageId)) {
          throw new Error(`${testCase.id}: successful composition omits active stage ${stageId}`)
        }
      }
      if (failed) throw new Error(`${testCase.id}: successful composition contains a Capability error`)
      const outputStage = completionStageId(profile, portableCase.input)
      if (!completedStages.has(outputStage)) {
        throw new Error(`${testCase.id}: successful composition omits completion stage ${outputStage}`)
      }
    }
  }

  if (compositionSuite.claimLevel === 'conditional-composition') {
    const conditionalStages = profile.stages.filter((stage) => !stage.required)
    if (conditionalStages.length === 0) {
      throw new Error('conditional-composition requires at least one conditional stage')
    }
    const successfulPortableCases = suite.cases.filter(
      (testCase) => testCase.expect.result === 'success',
    )
    for (const stage of conditionalStages) {
      const hasActivePath = successfulPortableCases.some((testCase) =>
        conditionMatches(stage.condition, testCase.input))
      const hasInactivePath = successfulPortableCases.some((testCase) =>
        !conditionMatches(stage.condition, testCase.input))
      if (!hasActivePath || !hasInactivePath) {
        throw new Error(
          `conditional-composition requires success coverage for both active and inactive paths of ${stage.id}`,
        )
      }
    }
    const signature = (input) => conditionalStages
      .filter((stage) => conditionMatches(stage.condition, input))
      .map((stage) => stage.id)
      .join(',')
    const requiredSignatures = new Set(successfulPortableCases
      .map((testCase) => signature(testCase.input)))
    const coveredSignatures = new Set(compositionSuite.cases
      .map((testCase) => portableCases.get(testCase.id))
      .filter((testCase) => testCase?.expect.result === 'success')
      .map((testCase) => signature(testCase.input)))
    const missingSignatures = [...requiredSignatures].filter((item) => !coveredSignatures.has(item))
    if (missingSignatures.length > 0) {
      throw new Error(`conditional-composition does not cover activation signatures: ${missingSignatures.join(' | ')}`)
    }
  }
}
