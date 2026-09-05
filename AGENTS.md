# Procedure Contracts repository guidance

For a requested review, read `docs/REVIEW_CONTRACT.md` within the requested
scope and follow the relevant source and dependencies. It records known risks,
not an exhaustive search plan. Report concrete cross-repository implications
when found. Review is read-only unless fixes are also requested; this entrypoint
does not dispatch another reviewer.

This repository owns the provider-neutral Procedure standard: Procedure
Profiles, implementation manifests, conformance suites, and the reference
validator/runner. New contracts use Procedure Profile v0.5, result Suite v0.4,
optional composition Suite v0.2, Manifest v0.5, and Procedure JSONL v0.2, and return only a
bounded result or error. The unpublished receipt and human-checkpoint formats
were removed; do not recreate compatibility readers for them.

Use the global `build-procedure-contracts` skill as the owning method. Use
`build-capability-contracts` only for referenced Capability semantics and
`build-agent-native-utilities` only for a concrete implementation product.

It does not own capability provider business logic, workflow runtime syntax,
Agent planning, approval policy, reviewer roles, a hosted registry,
marketplace, or a universal intermediate representation. Do not add optional
future fields without a current source-of-record consumer. Bind existing
runtimes such as Open Workflow Specification instead of introducing a second
orchestration language.

Keep conformance executable against real implementation adapters. A fixture
may test the runner, but it is not evidence that a production Procedure works.
Do not commit, publish, deploy, or install without explicit owner
authorization.

The owner has frozen the 3D direction. Do not add 3D scene, primitive, recipe,
renderer, Three.js/R3F, Scene Lab, `scene.create`, or `recipe.apply` Procedure
contracts without a new explicit owner decision. The current visual procedures
compose two-dimensional raster and projective Capabilities only.
