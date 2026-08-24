# Public integration status

Procedure Contracts publishes provider-neutral Procedure Profiles and
conformance tooling. It does not copy implementation or Capability-provider
source into this repository.

| Procedure Profile | Current implementation | Capability providers | Current claim boundary |
| --- | --- | --- | --- |
| `org.openadam.structured-data.preflight@0.1.0` | development pilot | File Vitals and BatchTicket have independent public source | Result and harness-observed composition canary |
| `org.openadam.brand-asset.prepare@0.1.0` | development pilot | development-only providers | Result and stage-binding conformance |
| `org.openadam.package-dependency.change-preflight@0.1.0` | development pilot | development-only provider | Result and stage-binding conformance |

Public Capability-provider source currently referenced by the first pilot:

- [File Vitals](https://github.com/tetracoralla/file-vitals)
- [BatchTicket](https://github.com/tetracoralla/BatchTicket)

The implementation pilots are not distributed by this repository. A local
conformance run is not an observation that an implementation is installed in a
particular host, that current permissions or credentials are usable, or that an
Agent will select the Procedure. The three Profiles remain experimental and
provider-seeded; no independent same-Procedure substitution claim is made.
