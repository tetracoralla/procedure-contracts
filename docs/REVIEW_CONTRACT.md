# Review contract

Keep these acceptance lanes separate.

## Development regression

Schema validation, semantic cross-checks, runner negative tests, and package
tests must pass from current source. Forward Profiles/Suites use v0.3 and
Manifests use v0.4. Unsupported legacy document families must be rejected.

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
