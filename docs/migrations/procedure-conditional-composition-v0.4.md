# Procedure conditional composition v0.4

This retained family introduced Procedure Profile v0.4, result Conformance Suite v0.4,
optional Composition Suite v0.2, Implementation Manifest v0.5, and Procedure
JSONL v0.2.

New Profiles use v0.5 so they can also carry mechanically checked aggregate
closed-world semantics. Existing v0.4 identities keep their original meaning.

The previous Profile allowed free-text optional-stage conditions. It could also
require a later stage to depend on an optional stage, making the skip path
impossible, and it could name one fixed completion stage even when the truthful
terminal stage depended on input.

v0.4 replaces those ambiguous edges with executable semantics:

- an optional stage has exactly one `inputPresent` or `inputAbsent` JSON Pointer
  condition;
- `dependsOn` names stages required on the active path;
- `afterIfExecuted` names an earlier conditional stage that precedes the current
  stage only when it executes;
- completion is either one required stage or two complementary conditional
  branches;
- result suites declare the narrow `result-boundary` claim;
- composition suites distinguish observed paths from complete conditional-path
  coverage;
- Manifest v0.5 binds the complete resolved Profile with `profileDigest`.

Migration requires reviewing every optional path, not mechanically changing
schema-version strings. Add skip and execute cases, select the correct terminal
stage for each input shape, recompute the Profile digest, update the
implementation manifest, and rerun result, composition, and stage-provider
binding checks. If this changes the method represented by an already cataloged
Procedure, publish a new Procedure semantic version and retain the prior
Profile and Suite; a format migration is not permission to mutate an existing
identity. A provider without a composition harness may retain only a
result-boundary claim; it must not imply observed stage execution.
