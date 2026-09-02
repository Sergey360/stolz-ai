# Benchmark v2: Evidence and Telemetry Provenance

## Status, purpose, and boundary

This is the production-source design for Issue #69. It implements the design
contour of `CP-64-03` and `CP-64-04` from
[`ARCHITECTURE_EVOLUTION_V0.2.md`](ARCHITECTURE_EVOLUTION_V0.2.md) and
[ADR-0003](adr/0003-outcome-gated-benchmarks.md); it does not implement a v2
collector, generate a v2 report, or alter the immutable v0.1.0 release.

The existing `context-selection-v1` fixture remains `fixture_only`. Its token
units are authored synthetic inputs, not Codex or other provider telemetry.
Benchmark v2 therefore records what was actually observed and withholds any
claim whose evidence cannot support it.

## Evaluation contour

A v2 suite contains one pinned fixture/task, one baseline route, one optimized
route, and one or more repetitions for each route. Every route repetition
emits an immutable evidence record. The report stores the identities of the
fixture, routes, evidence records, collector, runtime, model configuration, and
the sanitization result before it evaluates a claim.

```text
pinned fixture + route A + repetitions --> immutable evidence A --+
                                                               +--> compatible, outcome, verification,
pinned fixture + route B + repetitions --> immutable evidence B --+    regression, and publication gates --> report
```

The report must name the exact provider, model/configuration, agent runtime,
adapter, collector, and optional integrations used. An absent identity is
`not_available`; it is never guessed from a brand name, a billing dashboard, or
an aggregate account total.

## Evidence classes and permitted claims

| Class | Required durable evidence | Permitted result | Never permits |
| --- | --- | --- | --- |
| `fixture_only` | Fixture version and SHA, route/evidence identities, declared synthetic or authored unit source. | Harness behavior and a result scoped to that exact fixture. | Provider/model token efficiency, billing, or general runtime claims. |
| `runtime_telemetry` | Runtime version/configuration, collector version, raw event export identity, capture time, and sanitization result. | Scoped runtime-observed calls, tool calls, elapsed time, context bytes, or runtime-reported units. | Provider-native token usage unless the provider emitted that metric. |
| `provider_native` | Provider/model/configuration identity, provider response or export identity, capture method/time, and raw usage field identity. | The recorded metric for that exact provider/model/configuration and capture method. | A different provider/model/configuration, or an aggregate account claim. |

`unavailable` and `not_comparable` are valid states. They must remain visible in
the evidence and report, not be coerced to zero or a derived estimate. A
derived metric may be reported only with its formula and pinned input
identities, and remains derived rather than provider-native.

## Compatibility, quality, and publication gates

A comparison is eligible only when both routes have all of the following:

1. the same pinned fixture/task, required outcome, and verification procedure;
2. compatible material environment identities: runtime, adapter, provider,
   model/configuration, collector, and declared integrations;
3. successful outcome and verification for every included repetition;
4. durable SHA-256 evidence links for every metric included in the claim;
5. a passed sanitization record with no secrets, user-task content, or private
   operational data published; and
6. explicit regression budgets and a pass for each metric that the report
   treats as a gate.

A provider-token comparison additionally requires `provider_native` token
evidence for every included repetition on both routes, with the same provider,
model/configuration, and capture method. A runtime-only metric can support a
runtime claim, but cannot be relabelled provider-native.

The gates are independent and reported separately as `outcome`,
`verification`, `comparability`, `regression`, `sanitization`, and
`publication_eligibility`. A failed, missing, or incompatible gate produces a
withheld claim even if the optimized route has a lower numeric value.

## Repetitions, statistics, and regression budgets

Each record declares the planned and completed repetition count, a stable
execution ordering/seed policy, and the per-repetition intervention count. It
reports at least count, minimum, maximum, median, mean, standard deviation, and
coefficient of variation for each summarized numeric metric; no statistic is
invented for an unavailable metric.

The following are v2 design defaults, pending a later implementation-owner
approval rather than a claim about an existing run:

- Fewer than five successful repetitions are labelled `exploratory` and cannot
  support a published savings claim.
- Outcome and verification have a zero-tolerance regression budget: every
  included repetition must pass.
- Every other gated metric declares its own unit, direction, threshold, and
  baseline reference in the fixture before execution. An omitted budget means
  the metric is descriptive only; it cannot silently become evidence of a
  saving.

## Sanitization and retention

Raw evidence is retained through a durable repository-relative path or
immutable URI plus SHA-256. Public reports contain only the redacted export and
its sanitization manifest. Capture code must remove credentials, authorization
headers, private hostnames, user task content, and other sensitive payloads
before an evidence artifact is published. If redaction would make a reported
metric unverifiable, the public report must withhold that metric and keep the
reason as `unavailable`.

## Implementation handoff

`contracts/benchmark-evidence.schema.json` defines the immutable per-run
evidence envelope. `contracts/benchmark-record.schema.json` preserves the v1
record and adds the v2 aggregate record. A later collector and contract test
must reject missing identities, unavailable-as-zero metrics, incompatible
environments, weak outcomes, failed verification, failed sanitization, absent
regression budgets, and non-provider-native token claims. The runtime-specific
entry criteria are in [`RUNTIME_CAPABILITY_MATRIX.md`](RUNTIME_CAPABILITY_MATRIX.md).

Known gaps:

- `followup_gap` — no v2 collector, fixtures, reports, or executable v2
  contract test are introduced by this design issue.
- `accepted_gap` — provider telemetry may be unavailable; v2 preserves and
  publishes that boundary instead of manufacturing a number.
