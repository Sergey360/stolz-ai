# Manifest and read rules

- A manifest requires a task ID, selected route, immutable source identities,
  and invalidation identities.
- Record a read only after its identity matches the manifest.
- Conditional references are route-specific; an unselected reference is not a
  reason to preload more context.
- A changed SHA-256 or version is a new input and must be handled by the reuse
  decision before it is relied upon.
