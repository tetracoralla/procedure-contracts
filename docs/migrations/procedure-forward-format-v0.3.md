# Procedure forward format v0.3

## Decision

New Procedure contracts use Profile v0.3, Implementation Manifest v0.4,
Conformance Suite v0.3, and Procedure JSONL v0.2.

This family removes generic human-checkpoint stages and portable execution
receipts from the semantic waist. A Procedure is an ordered composition of
versioned Capability requirements. Its public runtime response is exactly a
result or an error.

## Why the format is smaller

The earlier checkpoint model generalized unlike business mechanisms into one
optional schema. The earlier receipt model also tempted implementations to
present their own run records as proof of composition, effects, correctness, or
acceptance. Neither claim follows from self-authored metadata.

The forward format therefore standardizes only facts that all current Procedure
implementations need:

- semantic identity and contracts;
- Capability stages, dependencies, conditions, and completion;
- provider bindings and bounded adapter launch;
- portable success and failure examples;
- exact result/error response envelopes.

Routing remains outside this family. A caller may decline to select a Procedure
or choose a different applicable route. After a named Procedure invocation is
accepted, however, its declared required stages are part of the implementation's
claim. The optional `openadam.procedure-composition-suite.v0.1` test document
lets the conformance harness inject Capability endpoints and observe those
calls without adding traces or receipts to the portable runtime result.

## Pre-release replacement

The earlier document families were never published as a supported ecosystem
contract, so this repository does not retain compatibility readers for them.
Current implementations must use the forward family and must not copy the old
checkpoint, outcome, receipt, attestation, or approval fields.

Migrating an existing Procedure is a format-only change only when stage meaning,
inputs, outputs, completion, errors, and provider behavior remain unchanged.
Otherwise review it as a semantic change and update the Procedure version.

## Authority boundary

A portable result-conformance pass establishes its declared output semantics for
the tested input. A composition-conformance pass additionally establishes the
observed stage calls and data flow in those injected cases. Claims about real
provider bindings, side effects, professional correctness, business
authorization, adoption, or efficiency still require separate current evidence.
Tool output, a generated report, a self-authored record, or a green suite cannot
promote itself into those broader claims.

The repository's stage-binding validator may resolve Procedure manifest stages
against current Capability Provider Manifests. That closes declaration drift;
it becomes live binding evidence only when the referenced Capability provider's
own transport probe also passes.
