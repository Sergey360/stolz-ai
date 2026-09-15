# Outcome-gate rules

- Baseline and optimized runs must use the same fixture identity and version.
- Verification is a required boolean result for both runs.
- Required outcomes must be equal before any token delta is meaningful.
- Preserve raw evidence paths with every accepted or rejected record.
- An unaccepted record is diagnostic evidence only, never public savings copy.
- Treat `fixture_only` evidence as scoped to its declared collector and fixture;
  do not present authored synthetic token units as measured provider telemetry.

Use `npm run benchmark:check` for the packaged v1 fixture corpus and
`npm run benchmark:v2:check` for v2. Run the affected corpus after changing its
collector or rules; repeat after fixing a failure, not after unrelated edits.
`tools/routed-skills.mjs` exposes `gateBenchmark` for admission of one record.
Keep new collectors versioned and retain both raw runs plus rejection evidence.
These checks need no production credentials or publication. A public claim
still needs accepted evidence matching its exact scope.
