# Procedure Contracts

Procedure Contracts is a provider-neutral standard for declaring,
implementing, and verifying reusable professional procedures.

A Capability Profile says what one ability means. A Procedure Profile says
how several versioned Capability requirements must be sequenced to complete a
task. An implementation may be a local function, CLI, MCP tool, HTTP service,
Agent, Open Workflow document, or native application action.

This repository deliberately does not define a workflow language, approval
framework, reviewer assignment model, or marketplace. It defines the portable
contract around an implementation:

```text
intent
  -> procedure profile
  -> capability requirements
  -> implementation binding
  -> existing runtime
  -> result or error
  -> conformance
```

This repository is one part of the
[Agent-Host Execution Architecture](https://github.com/tetracoralla/agent-host-execution-architecture).
[Capability Semantic ABI](https://github.com/tetracoralla/capability-contracts)
defines the reusable stage semantics. [Direct Execution Runtime](https://github.com/tetracoralla/direct-execution-runtime)
can execute an already-selected, already-validated Procedure binding without
spending an Agent turn to relay structured input.

## Forward contract documents

New Procedures use:

- `openadam.procedure-profile.v0.3`;
- `openadam.procedure-implementation-manifest.v0.4`;
- `openadam.procedure-conformance-suite.v0.3`;
- `openadam.procedure-jsonl.v0.2`.

The forward format contains only Capability stages. Success is exactly
`{id, ok: true, result}` and failure is exactly `{id, ok: false, error}`. It has
no portable receipt, human-checkpoint, reviewer, role, quorum, approval, or
publication field. A business that needs one of those mechanisms must define
that concrete current mechanism and have its owning system establish current
authorization separately; this ABI does not reserve future fields for it.

The earlier unpublished Profile, Suite, Manifest, Receipt, checkpoint, and
JSONL formats were removed instead of becoming a compatibility burden. A
self-authored execution record is not authority for a broader correctness,
effect, or acceptance claim.

See [Procedure forward format v0.3](docs/migrations/procedure-forward-format-v0.3.md).

`src/validate-capability-refs.mjs` resolves every Procedure stage against an
explicit Capability catalog and rejects unknown Capability versions or
operations. This is catalog integrity, not a runtime dependency. The default
path expects a sibling `capability-contracts` checkout for maintainer work; an
alternate catalog may be supplied with `--capability-catalog`.

## Local checks

```sh
npm ci
npm run check
```

Run a real implementation suite with:

```sh
node src/run-conformance.mjs \
  --profile /path/to/profile.json \
  --suite /path/to/conformance.json \
  --manifest /path/to/implementation-manifest.json \
  --implementation-root /path/to/implementation
```

This command checks the portable result/error contract. When an implementation
supports harness-injected Capability bindings, add:

```sh
  --composition-suite /path/to/composition-conformance.json
```

Composition mode observes the Capability calls for the selected cases and
rejects missing, reordered, identity-drifted, or data-flow-drifted calls. It
does not force an Agent or host to select the Procedure in the first place.
Selection remains a routing decision outside this ABI.

To check that declared Procedure stage targets exist in current Capability
Provider Manifests, run `src/validate-stage-bindings.mjs` with one or more
`--capability-manifest` arguments. This is distinct from both result conformance
and observed composition. It is a deterministic pre-execution binding check,
not an observation that a package is installed, credentials are usable, or a
live endpoint is healthy.

## Status

The ABI is experimental. Three active micro-procedures currently exercise the
workspace:

- `org.openadam.structured-data.preflight@0.1.0`;
- `org.openadam.brand-asset.prepare@0.1.0`;
- `org.openadam.package-dependency.change-preflight@0.1.0`.

All three use the forward family. Structured Data Preflight is the first
harness-observed composition canary: portable cases establish result/error
behavior; composition cases additionally establish the observed provider calls,
their order, tested data flow, and failure propagation. Its declared stage
bindings resolve against current File Vitals and BatchTicket
Provider Manifests. Brand Asset Prep and Dependency Preflight stage bindings
also resolve against their current provider manifests. These checks do not
force adoption or establish installed availability, observed composition, or
professional correctness.

Run all current implementations and their portable suites with:

```sh
npm run check:local-pilots
```

That command is a maintainer-only workspace integration. It expects specific
sibling implementation repositories, some of which are not independently
public. It is not required for an ordinary contribution and does not establish
installed-host availability, Agent routing, or professional correctness.

## Explicitly frozen direction

The current standard does not define a 3D scene library or runtime. Scene
graphs, meshes, materials, cameras, lighting, animation, renderer APIs,
Three.js, R3F, Scene Lab, `scene.create`, and `recipe.apply` are outside the
current scope. The existing Projective pilot is a two-dimensional image
projection Capability, not a 3D foundation.

## License

Licensed under the Apache License, Version 2.0. See `LICENSE`, `NOTICE`, and
`THIRD_PARTY_NOTICES.md`.
