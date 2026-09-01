# Benchmarking

STOLZ A.I. accepts an efficiency result only after proving that the baseline and optimized routes solve the same versioned task and pass the same required verification.

## Current result

The checked-in `context-selection-v1` fixture compares eager context loading with required-only context loading.

| Route | Synthetic token units | Model wakeups | Tool calls | Outcome | Verification |
| --- | ---: | ---: | ---: | --- | --- |
| eager context | 1,530 | 4 | 8 | `validated-context-plan-v1` | pass |
| required context | 980 | 3 | 4 | `validated-context-plan-v1` | pass |

The optimized route uses 550 fewer authored token units on this fixture. The raw traces, route definitions, pinned SHA-256 identities, and generated report are stored under `benchmarks/`.

## What the result does not mean

The token units are synthetic inputs written for the fixture. They are not captured from Codex, an API response, billing, or provider telemetry. The result demonstrates the mechanism and the benchmark gate; it does not establish a production savings rate.

STOLZ A.I. therefore makes no measured provider-token claim.

## Reproduce the report

```bash
npm ci
npm run benchmark:check
```

To regenerate the JSON and Markdown reports:

```bash
npm run benchmark
```

`npm test` also rebuilds the report in memory, checks its links and hashes, and exercises the negative gates.

## Admission rules

A comparison is withheld when:

- either route misses the required outcome;
- either route fails verification;
- a measurement or evidence path is missing;
- token sources differ;
- a pinned input changes;
- the optimized route does not actually use fewer units.

New benchmarks should add a versioned fixture, two route definitions, raw evidence for both routes, and a checked-in generated report. Real-world claims require a trustworthy collector and the same outcome and verification discipline.
