# Benchmark report: context-selection-v1

- Fixture: `context-selection@1.0.0`
- Claim scope: This result applies only to the versioned synthetic context-selection trace and its declared token-unit source.
- Gate: `fixture_only` (quality_gates_passed)

| Route | Token units | Model wakeups | Tool calls | Wall time (ms) | Interventions | Outcome | Verification |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `baseline-eager-context-v1` | 1530 | 4 | 8 | 195 | 0 | `validated-context-plan-v1` | pass |
| `optimized-required-context-v1` | 980 | 3 | 4 | 115 | 0 | `validated-context-plan-v1` | pass |

The optimized route used 550 fewer synthetic token units on this fixture (35.95%), using the declared source `synthetic-fixture-token-units-v1`. Both routes produced the required outcome and passed verification.

## Raw evidence

- suite: [`benchmarks/suites/context-selection-v1.json`](../suites/context-selection-v1.json) — `45c7af8581dc70d96bbc632eb15af42ebe4957fe9eaa7137538b1878ecc1cb67`
- fixture: [`benchmarks/fixtures/context-selection/v1.0.0.json`](../fixtures/context-selection/v1.0.0.json) — `43c931ca6a3a43ce2b183601ca247a6d0bca3645904cd2dac3f954be0151bc0c`
- baseline_route: [`benchmarks/routes/context-selection-v1/baseline.json`](../routes/context-selection-v1/baseline.json) — `617330bad239d423153fc9d415c95e6d13fb9716bb7a74eb521417496f52fc5f`
- optimized_route: [`benchmarks/routes/context-selection-v1/optimized.json`](../routes/context-selection-v1/optimized.json) — `ef3f9384977774d09a29243181d56b93fd1275e7d82fac60fa83136cb5fcf675`
- baseline_evidence: [`benchmarks/raw/context-selection-v1/baseline.json`](../raw/context-selection-v1/baseline.json) — `cfee66cf9b246a61839018cd5caea9d6fe30e8409b2d38ffed00d82fee698b0a`
- optimized_evidence: [`benchmarks/raw/context-selection-v1/optimized.json`](../raw/context-selection-v1/optimized.json) — `295e35827abe219a3f6f936a61416fcef17f8747b826d120744ea3e651a52a90`

## Interpretation boundary

- The token-unit counts are authored synthetic fixture inputs, not measurements captured from Codex or another provider's telemetry.
- The result demonstrates the harness and context-selection mechanism; it is not a provider-wide efficiency guarantee.
- A weaker outcome, failed verification, missing metric, or changed pinned SHA withholds the saving claim.
