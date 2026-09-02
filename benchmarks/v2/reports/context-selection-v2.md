# Benchmark v2 admission report: context-selection-v2

Source class: `fixture_only`. The fixture result is **eligible**; runtime telemetry is **withheld** and provider token saving: **withheld**.

## Independent admission gates

| Gate | Status |
| --- | --- |
| outcome | pass |
| verification | pass |
| comparability | pass |
| regression | pass |
| sanitization | pass |
| publication_eligibility | pass |

## Repetitions and statistics

Five repetitions completed for each route.

| Route | Metric | Count | Availability | Mean / reason |
| --- | --- | ---: | --- | --- |
| baseline | fixture_token_units | 5 | available | 1520 |
| optimized | fixture_token_units | 5 | available | 975 |
| baseline | provider_input_tokens | 0 | unavailable | fixture-only source has no provider-native observation |
| optimized | provider_input_tokens | 0 | unavailable | fixture-only source has no provider-native observation |
| baseline | runtime_elapsed_ms | 0 | unavailable | fixture-only source has no runtime observation |
| optimized | runtime_elapsed_ms | 0 | unavailable | fixture-only source has no runtime observation |

## Provenance and integrity

The JSON companion binds every admitted raw-evidence SHA-256 to fixture, task, route, runtime, collector, capture, outcome-evaluator, and verification identities. Provider, model, and adapter are explicitly unavailable; this report makes no provider-native savings claim.

## Regression budget

`fixture_token_units` must not increase (threshold 0): pass.

