# Contributing to Procedure Contracts

Procedure Contracts owns provider-neutral Procedure Profiles, implementation
manifests, conformance suites, and the bounded reference runner. It does not own
a workflow DSL, Agent router, approval framework, or provider business logic.

## Set up and verify

Use Node.js 22 or newer, then run the standalone public checks:

```sh
npm ci
npm run check
```

Maintainers with the sibling Capability catalog and all implementation pilots
may additionally run `npm run check:local-pilots`. That integration is not a
prerequisite for an ordinary contribution.

New contracts use Procedure Profile v0.5, result Conformance Suite v0.4,
optional Composition Suite v0.2, Implementation Manifest v0.5, and the exact
JSONL v0.2 result/error envelopes. Add executable negative coverage for every
repaired contract edge. Do not restore the unpublished receipt or
human-checkpoint formats.

Do not include credentials, private fixtures, generated reports, or local
paths. Contributions are licensed under Apache-2.0 unless clearly stated
otherwise.
