# Review contract

This contract records durable Procedure claim boundaries and minimum coverage;
it is not a fixed reasoning script or completion runway. Before applying the
named checks, reconstruct the current Profile families, Capability references,
implementation manifests, runners, completion semantics, and public claims from
source and real adapters. Perform and report at least one independent discovery
route derived from that model rather than from this file, test names, prior
findings, or the changed-file list. Completing every item below cannot by itself
end the review.

Keep these acceptance lanes separate.

## Development regression

Schema validation, semantic cross-checks, runner negative tests, and package
tests must pass from current source. New Profiles use v0.5, result Suites use
v0.4, composition Suites use v0.2, and Manifests use v0.5. Cataloged v0.3/v0.4
Profile and Suite identities remain readable compatibility inputs; unsupported
older families and new legacy-format catalog entries must be rejected.

A cataloged or consumed Procedure `id@version` cannot be rewritten by a review.
When causal order, conditional activation, completion, stable errors, effects,
or result meaning changes, retain the old identity and publish a new Procedure
version. Internal execution optimization may keep the version only when the
complete declared method and public semantics remain unchanged.

Every optional stage has one closed input-present/input-absent condition.
`dependsOn` cannot point at a stage that may be absent; `afterIfExecuted` may
name only an earlier conditional stage. Completion resolves to exactly one
active stage for every conformance input. A fixed completion stage is required;
branched completion uses complementary conditions, and an optional output stage
uses the same condition as its branch.

Every v0.5 Profile declares aggregate `openWorld`. A closed-world Procedure
must be rejected when any referenced Capability operation is open-world or has
no mechanically established value. Direct hosts must require `openWorld:
false`; absence is not permission to assume a legacy Profile is closed-world.

Legacy v0.3 free-text conditions remain readable for schema, result, and
observed-call compatibility. Composition validation may verify declared stage
identity, causal order, required-stage presence, completion, and failure stop,
but must not interpret prose to claim which optional path was active.

The implementation `profileDigest` binds the complete resolved Profile, not
only input/output schemas. Result suites claim only `result-boundary`.
Composition suites claim `observed-composition` or `conditional-composition`;
the latter includes successful active and inactive paths for every conditional
stage and covers every resulting activation signature in the portable success
corpus.

Checks must reject unknown Capability references, extra success/error envelope
fields, provider binding drift, invalid causal order, and result/schema
mismatches. A checker updated in the same task remains a narrow veto, not proof
that the Procedure is professionally correct.

## Runtime Agent flow

The reference runner launches the real implementation adapter, exercises the
portable suite, validates exact result/error envelopes, enforces limits and
timeouts, and shuts the adapter down cleanly.

Runner acceptance establishes black-box contract behavior only. It does not
establish the claimed internal composition, observed side effects,
professional method, or runtime benefit. Those require independent evidence
scoped to the claim.

## Runtime human flow

If a Procedure is exposed through a human application, verify that product in
its own repository. This standards repository has no human UI and defines no
generic approval flow.

## Business and experience acceptance

The owner of the real task decides whether the Procedure represents the right
professional method and saves meaningful repeated work. Mechanical conformance,
an Agent report, a self-authored record, or a human acknowledgment cannot
substitute for that judgment or for an owning external system's authorization.
