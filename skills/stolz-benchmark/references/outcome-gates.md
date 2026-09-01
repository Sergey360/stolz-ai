# Outcome-gate rules

- Baseline and optimized runs must use the same fixture identity and version.
- Verification is a required boolean result for both runs.
- Required outcomes must be equal before any token delta is meaningful.
- Preserve raw evidence paths with every accepted or rejected record.
- An unaccepted record is diagnostic evidence only, never public savings copy.
- Treat `fixture_only` evidence as scoped to its declared collector and fixture;
  do not present authored synthetic token units as measured provider telemetry.
