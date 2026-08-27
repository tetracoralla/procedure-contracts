# Procedure closed-world aggregation v0.5

Procedure Profile v0.5 adds required `semantics.openWorld`. It is the
conservative aggregate of every Capability operation that a valid Procedure
input may execute, including optional stages.

- `false` means every referenced operation is mechanically established as
  closed-world;
- `true` means at least one stage may depend on identities or facts outside its
  enumerated Capability domain;
- a missing or legacy Capability value cannot support a closed-world claim.

The field does not authorize network, filesystem, credentials, or side effects.
Those remain separate host/provider policies. Its purpose is to let a host that
admits only closed operations reject a Procedure before launching its adapter.

Adding this caller-visible safety meaning is not an in-place format rewrite.
Existing v0.3/v0.4 Procedure identities remain readable at their original
meaning. Active implementations migrate to new Procedure semantic versions,
bind the v0.5 Profile digest, and rerun result, composition, stage-provider, and
direct-host checks.
