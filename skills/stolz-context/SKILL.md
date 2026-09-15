---
name: stolz-context
description: Validate STOLZ manifests and identity-bound reads. Use for manifest or read-ledger decisions.
---

# Context

Ordinary source browsing needs no manifest. For an optimized read, require a
valid manifest, matching route and immutable source identity before trusting
the result. A mismatch disables the optimization; continue through the normal
verified route without inventing identities.

Load [manifest and read rules](references/manifest-and-reads.md) when validating
a manifest, recording a fragment, or resolving invalidation. Read only the
sources needed for the decision and references whose conditions hold. Reuse
is a separate decision only when a prior result may replace new work.

Done: required context is available with verified provenance, or the normal
route supplies it and the optimization's unavailable reason is recorded.
