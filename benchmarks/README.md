# Reproducible benchmarks

STOLZ A.I. benchmark suites pin a versioned fixture, paired baseline and
optimized route definitions, and raw evidence by SHA-256. The harness sums the
raw event trace, applies the required outcome and verification gates, and emits
machine-readable JSON plus a human-readable report.

From a clean checkout, regenerate and then verify the checked-in report:

```bash
npm run benchmark
npm run benchmark:check
```

The command processes `benchmarks/suites/context-selection-v1.json` and writes
`benchmarks/reports/context-selection-v1.json` plus its Markdown companion.
`npm test` independently rebuilds the report in memory, compares both checked-in
formats, proves the negative gates, and rejects changed pinned evidence.

## Evidence layout

- `fixtures/` records the fixture identity, required outcome, measurement
  source, scope, and limitations.
- `routes/` pairs the baseline and optimized route definitions with pinned raw
  evidence.
- `raw/` retains per-event token units, model wakeups, tool calls, wall time,
  interventions, outcome, and verification checks.
- `reports/` contains the outcome-gated comparison and direct evidence links.
- `suites/` pins the fixture and route graph used to reproduce a report.

The included `context-selection-v1` result is accepted only at
`fixture_only` scope. Its values are authored synthetic inputs, not provider
telemetry, and must not be generalized to Codex or another provider. A provider
claim requires a separately versioned fixture and authoritative collector.

## Benchmark v2 evidence boundary

Benchmark v2 is specified in
[`docs/BENCHMARK_V2_DESIGN.md`](../docs/BENCHMARK_V2_DESIGN.md). It keeps three
separate claim scopes: `fixture_only` for authored fixture values,
`runtime_measured` (`runtime_telemetry` in the evidence schema) for observations emitted by a named runtime collector, and
`provider_native` only when the provider's own versioned response or export is
retained. The current v1 fixture is not upgraded merely because a report is
regenerated.

Each v2 route repetition must retain a pinned fixture/route identity, runtime,
adapter, provider, model/configuration, collector, intervention count, durable
evidence links, and a sanitization manifest. Reports summarize repetitions with
count, range, median, mean, standard deviation, and coefficient of variation.
The runtime admission policy is in
[`docs/RUNTIME_CAPABILITY_MATRIX.md`](../docs/RUNTIME_CAPABILITY_MATRIX.md).

## Gate behavior

The harness withholds a saving when any measurement is absent, the token sources
differ, either route fails verification, either route misses the fixture's
required outcome, or any pinned SHA changes. A valid comparison with no token
reduction is also retained as evidence without a saving claim.

For v2, outcome, verification, comparability, regression-budget, sanitization,
and publication gates are independent. A report with unavailable telemetry,
incompatible runtime/model/configuration, a failed repetition, missing durable
evidence, or an exceeded declared budget must withhold its claim. A lower number
alone is never a saving.

## Benchmark v2 admission reports

`benchmarks/v2/reports/context-selection-v2.json` is the machine-readable
admission report for the checked-in fixture. Its Markdown companion presents
the same result for review. Both bind the report to the aggregate record, every
admitted raw-evidence SHA-256, source class, fixture/task/route/environment
identities, outcome evaluator, verification procedure, repetition statistics,
regression budget, and all six admission gates.

The current report has a passing fixture-harness admission result, but its
source class is `fixture_only`. It therefore withholds runtime-measured
telemetry and provider-token savings claims even though the fixture-token budget
passes. A `runtime_measured` result is still not `provider_native` evidence.
`test/benchmark-v2-gates.test.mjs` rebuilds the source record, rejects a change
to any admitted identity, raw-evidence SHA, gate, or budget, and compares both
checked-in report formats deterministically.
