# Manifest and read rules

- A manifest requires a task ID, selected route, immutable source identities,
  and invalidation identities.
- Record a read only after its identity matches the manifest.
- Conditional references are route-specific; an unselected reference is not a
  reason to preload more context.
- Store bounded fragments in the durable ledger and return compact references,
  not whole raw artifacts, as its model-facing projection. Fetch the actual
  bounded source when its content is needed to finish the task.
- A changed SHA-256 or version is a new input. Invalidate affected fragments
  on Git/content, policy, schema, tool, expiry, integrity or manual purge changes.
  Consult reuse policy only if substituting a cached result for a new read.
- `prepareContext` accepts only references allowed by the selected route. An
  allowlist is not a requirement to read every listed document; use the
  conditional plan's references for the current decision.
