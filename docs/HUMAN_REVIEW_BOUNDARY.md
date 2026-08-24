# Human-review boundary

Status: retired pre-release experiment.

The earlier Procedure design attempted to place a generic `human-checkpoint`
stage and an attestation-bearing receipt in the portable waist. That was too
prescriptive: payment, inventory, specialist review, regulatory approval, and a
single owner judgment are different business mechanisms. A shared optional
field would not make them equivalent or trustworthy.

New Procedure Profiles therefore use v0.3 and contain only Capability stages.
They do not define reviewer roles, counts, order, identity, quorum, approval
states, attestations, or pause/resume behavior. When a concrete current business
process needs portable operations, those operations may become Capabilities and
their repeated sequence may become a separate Procedure. Otherwise the owning
host keeps the mechanism.

The associated schemas and readers were removed before publication. A future
business-specific mechanism must begin from current consumers and authority,
not from these retired fields. Implementation-authored metadata cannot establish
that a person made a wise decision, that an external system authorized an
action, or that the enclosing Procedure is professionally correct.
