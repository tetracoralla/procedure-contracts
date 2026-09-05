# Public integration status

Procedure Contracts publishes provider-neutral Procedure Profiles and
conformance tooling. It does not copy implementation or Capability-provider
source into this repository.

| Procedure Profile | Current implementation | Capability providers | Current claim boundary |
| --- | --- | --- | --- |
| `org.openadam.structured-data.preflight@0.3.0` | development pilot | File Vitals and BatchTicket have independent public source | Active result and harness-observed composition canary; `0.1.0` and `0.2.0` retained as superseded catalog identities |
| `org.openadam.brand-asset.prepare@0.3.0` | development pilot | development-only providers | Active result and stage-binding conformance; `0.1.0` and `0.2.0` retained as superseded catalog identities |
| `org.openadam.package-dependency.change-preflight@0.2.0` | private `standards-pilots` reference implementation | private reference provider | Active result and stage-binding conformance only; no independent product claim; `0.1.0` retained as superseded catalog identity |

Public Capability-provider source currently referenced by the first pilot:

- [File Vitals](https://github.com/tetracoralla/file-vitals)
- [BatchTicket](https://github.com/tetracoralla/BatchTicket)

The implementation pilots are not distributed by this repository. Dependency
Preflight lives in the private `standards-pilots` workspace because it is a
contract reference implementation rather than an independent product. A local
conformance run is not an observation that an implementation is installed in a
particular host, that current permissions or credentials are usable, or that an
Agent will select the Procedure. The three Profiles remain experimental and
provider-seeded; no independent same-Procedure substitution claim is made.

The maintainer pilot uses explicit current source roots. When an implementation
or Capability Contracts checkout, Capability-provider manifest, or declared
composition suite is absent, it inventories the missing inputs, reports the
affected Procedure as `not_run`, and exits incomplete rather than reading Agent
Host private state or substituting an installed artifact. Independent pilot
failures are aggregated. This keeps source conformance and installed runtime
activation as separate claims.

The final pilot summary is JSON on stdout for pass, incomplete and failed
runs; child diagnostics may also appear before it. Exit codes are 0, 2 and 1
respectively. Source overrides are passed to the actual implementation checks
and source-conformance processes. `validate:capability-refs` honors
`OPENADAM_CAPABILITY_CONTRACTS_SOURCE_ROOT`; an explicit `--capability-catalog`
takes precedence. An absent sibling path is a missing selected input, not proof
that the provider has no source elsewhere; use an explicit root for relocated
checkouts rather than automatic archive discovery or runtime fallback.
