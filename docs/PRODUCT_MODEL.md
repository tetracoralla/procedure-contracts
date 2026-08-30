# Product model

## Stable object boundaries

`Procedure Profile` is the portable semantic definition. It names the task,
input and output contracts, ordered Capability stages, dependencies, completion
rule, and stable errors.

`Implementation Manifest` declares how one implementation binds each stage to
a Capability provider and exposes a bounded adapter. The manifest may point to
an existing workflow document, CLI, library, native action, MCP tool, or HTTP
endpoint.

`Conformance Suite` contains portable success and failure examples. It does not
encode arbitrary scripts, free-form assertions, approval policy, or a claimed
execution history.

Profile v0.5, result Suite v0.4, optional composition Suite v0.2, and Manifest
v0.5 are the active family. Their JSONL v0.2 response contains only a result or
error. Cataloged v0.3/v0.4 Profiles and Suites remain readable at their existing
semantic versions, but are closed to new entries. Earlier unpublished families
and receipts were removed rather than preserved as platform debt.

Procedure semantics use the same orthogonal summary as current Capabilities:
result variability, external context sources, state access, idempotency, and
whether any successful stage can depend on open-world identities or facts.

## Thin-waist invariants

- Profiles reference Capability identities, never concrete tool names or
  provider-specific request shapes.
- The workspace resolves each Capability version and operation against the
  current catalog without copying Capability schemas into the Procedure.
- Stage order is a DAG and dependencies appear before consumers.
- Optional stages use closed input-presence conditions. `dependsOn` names a
  stage required on the active path; `afterIfExecuted` names an earlier optional
  stage that constrains order only when it executes.
- An implementation binds exactly the declared Capability stages.
- `openWorld: false` is valid only when every referenced Capability operation
  is also closed-world; an optional stage is included in this aggregate because
  it may execute for a valid input.
- Successful composition must observe every required stage in dependency order.
- Portable success and failure envelopes contain no self-authored proof record.
- A result establishes only its declared output semantics. It does not prove
  internal composition, observed side effects, professional correctness,
  external authorization, or wider business acceptance.

## Selection and invocation integrity

The Procedure ABI does not decide whether a caller should use a Procedure.
An Agent, router, host, application, or person may decide that a Profile is not
applicable, stop before invocation, or choose another implementation. Adoption
and routing are outside conformance.

Once an implementation accepts a request for a named Procedure and reports its
portable result, required stages are part of that claim. Ordinary result
conformance validates only the public result/error boundary. Optional
composition conformance injects harness-controlled Capability endpoints and
observes stage identities, order, and data passed between stages. It rejects an
implementation that returns a compatible result while omitting declared calls.
This observation is test evidence, not a portable receipt and not a policy that
forces callers to adopt the Procedure.

Stage-provider binding integrity is a third, separate check. It resolves each
Procedure stage's provider, Capability version, operation, transport, and target
against current Capability Provider Manifests. When that Capability provider
also passes live transport conformance, the declaration-to-binding chain is
closed for the tested target. Result, composition, stage binding, and live
transport evidence remain separately named.

This is the standards-owned pre-execution boundary: catalog references and
declared bindings can be rejected before a Procedure adapter is launched. It
does not establish that a command or package is installed in a particular
host, that credentials or permissions are present, or that a remote endpoint
is healthy. Those are current observations owned by the selected host and
provider. A host may combine them for one routing decision, but they are not a
portable `readiness` Capability until repeated implementations demonstrate a
stable shared semantic result.

Package dependency change preflight is a separate domain operation. It may
help a provider installation or upgrade evaluate package evidence, but it does
not resolve arbitrary Procedure requirements or certify runtime availability.

A Procedure Profile describes a repeated professional sequence and its
completion semantics. It is not a second workflow DSL and does not standardize
provider-specific mappings. An executable workflow remains an implementation
binding with its own version controls.

Completion is either one required output stage or two complementary
present/absent branches that select the truthful terminal stage for the current
input. Manifest v0.5 binds the complete resolved Profile through
`profileDigest`, so conditions, completion, stable errors, and other semantic
changes cannot hide behind unchanged input/output schemas.

Result conformance claims only `result-boundary`. Composition conformance is a
separate lane: `observed-composition` covers the supplied paths, while
`conditional-composition` requires both the active and inactive success path
for every conditional stage and covers every resulting activation signature in
the portable success corpus. Neither is professional or business acceptance.

Document format, Procedure semantic version, implementation/provider version,
and adapter protocol version evolve independently. A cataloged or consumed
Procedure `id@version` is immutable. Changes to the causal graph, conditional
activation, completion, stable errors, effects, or result meaning publish a new
Procedure version; implementation-only optimization is allowed under the same
version only when those caller-visible semantics are conserved.

## Human and organizational decisions

The forward ABI does not define a generic human checkpoint. Different current
businesses may rely on payment state, inventory, an authenticated approver,
multiple specialist reviews, or no human decision at all. Those are not
interchangeable optional fields.

When such a mechanism becomes a repeated portable task, model its observable
operations as ordinary Capabilities and its concrete sequence as a separate
Procedure. Until then, keep it in the owning host or business system. A person
typing “OK”, an Agent claiming success, or a tool-emitted record is not generic
authorization.

## Explicit non-goals

- workflow editor or runtime;
- Agent planner or model router;
- generic approval, reviewer, quorum, or attestation framework;
- provider discovery marketplace;
- universal tool request/response IR;
- telemetry backend;
- business logic copied out of Capability providers;
- a 3D scene graph, renderer, primitive library, recipe catalog, or Scene Lab;
- Three.js/R3F bindings, `scene.create`, or `recipe.apply`.
