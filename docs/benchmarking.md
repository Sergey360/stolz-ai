# Benchmarking and evidence interpretation

STOLZ benchmarks compare a baseline route with a STOLZ route only after both
produce the required outcome and pass the same verification. A shorter answer,
fewer tool calls, or a successful package check is not a token-saving result.

## Evidence classes are not interchangeable

| Class | Source | Appropriate statement | Statement it cannot support by itself |
| --- | --- | --- | --- |
| `fixture_only` | Authored deterministic values in a versioned fixture | The harness and gates behave reproducibly on that fixture | Runtime behavior, provider tokens, billing, or general savings |
| `runtime_measured` | Sanitized events emitted by an exact runtime contour | The named runtime event or counter was observed for that tuple | Provider billing or provider-native token totals |
| `provider_native` / C3 provider export | Two comparable provider-owned exports retained as sanitized descriptors | A scoped provider comparison may be considered after every gate passes | Another provider, model, runtime, version, scenario, or aggregate claim |

The v0.7 C2 records for Claude Code 2.1.251 and Qwen Code 0.22.3 are
`runtime_measured` evidence. They certify sanitized runtime-telemetry handling
for those exact tuples; they do not contain provider-native token totals. The
C3 admission implementation exists, but all currently retained provider pairs
remain `withheld` because no complete comparable export pair has been admitted.

## Reproducible fixture examples

From a source checkout with development dependencies installed:

```bash
npm run benchmark:check
npm run benchmark:v2:check
```

Benchmark v1 records 1,530 versus 980 authored synthetic token units for one
context-selection fixture. Its 550-unit difference and 35.95% fixture result
validate that fixture and harness only. Benchmark v2 repeats the fixture five
times per route and explicitly records provider and runtime metrics as
unavailable. See the [v1 report](../benchmarks/reports/context-selection-v1.md)
and [v2 report](../benchmarks/v2/reports/context-selection-v2.md).

These commands are source-validation commands. They are not required to use an
installed skill, and their output must not be advertised as observed provider
usage.

## Historical real-result boundary

The v0.4.1 evidence contains three five-pair Codex CLI scenarios. Using the
report convention `baseline - STOLZ`, their token deltas were:

| Scenario | Delta | Interpretation |
| --- | ---: | --- |
| Reads and navigation | +2,867 tokens | Less recorded usage on the STOLZ route in that scoped cohort |
| Build/check invalidation | -2,880 tokens | More recorded usage on the STOLZ route |
| Quiet/wait transition | -1,330 tokens | More recorded usage on the STOLZ route |

The result is mixed, historical, and tied to its exact Codex CLI/model/config
cohorts. It is not evidence that v0.7.1 generally saves tokens. The current
records preserve the individual reports for
[reads/navigation](../reports/benchmark-v3/real/reads-navigation.json),
[build/check](../reports/benchmark-v3/real/build-check-invalidation.json), and
[quiet/wait](../reports/benchmark-v3/real/quiet-wait-transition.json); their
aggregate public claims remain withheld. The immutable publication is the
[v0.4.1 release](https://github.com/Sergey360/stolz-ai/releases/tag/v0.4.1).

The v0.7 release added exact-version C2 records and exercised four installed
local Codex executions with equal output hashes. Those checks demonstrate
compatibility and verification for the recorded cases, not a new general
efficiency result.

The v0.10 release ran paired Codex CLI tasks against the publicly installed
v0.9.0 package across bug fixes, code review, tests, documentation research,
multi-step work, and handoff. The retained reports preserve individual runtime
observations and equal-outcome gates. Provider-native token totals and billing
were unavailable, so provider-token, cost, percentage, aggregate-savings, and
provider-wide claims remain withheld.

## Installed-skill selection diagnostic in v0.12

v0.12 evaluates whether an installed runtime selects the intended STOLZ skill,
loads its required local files, avoids unnecessary permission requests, and
still produces the required outcome. The exact tuple was Codex CLI 0.153.4,
`gpt-5.6-sol`, and `xhigh` reasoning in isolated workspaces with five product
skills and three neutral competitors.

The untouched replacement held-out gate passed with 23/24 strict routes,
24/24 required outcomes, 24/24 permission decisions, and at least 3/4 strict
routes in each of six groups. The [public report](../benchmarks/skill-selection-v012/results.md)
retains all 68 attempts across smoke, development, and held-out runs, including
collector failures, an incomplete oracle, confirmed trigger defects, fixes,
and the final automatic miss.

This evidence is `bounded_live_diagnostic`. It is not a provider-native token
measurement, cost comparison, general accuracy estimate, or certification for
another model, runtime, task distribution, or skill population.

## Bounded installed-product measurement in v0.14

v0.14 measured the byte-identical v0.13.0 release archive in isolated Windows
x64 workspaces with Codex CLI 0.154.0-alpha.6.2. The main contour retained five
pairs for each of reading/navigation, build/check invalidation, and a multi-step
state transition with `gpt-5.6-sol` at `xhigh`. A separate, non-pooled
`gpt-6-astra`/`medium` control retained five multi-step pairs. All 40 attempts
and all 20 equal-outcome/equal-verification pairs were included; there were no
automatic retries or exclusions.

For the exact small synthetic fixtures, every cohort recorded a negative
baseline-minus-STOLZ comparable input-plus-output delta and higher STOLZ wall
time. The deltas were -208,689, -207,733, and -214,706 tokens for the three Sol
cohorts, and -208,111 tokens for the separate Astra control. These results show
overhead in the measured contour; they do not establish a provider-wide result
or predict larger real projects. See the [complete v0.14 summary](../reports/benchmark-v3/real/v014-summary.md).

The available JSONL counters report input, cached-input, output, and reasoning
output. Cached input is a subset of input and reasoning output is a subset of
output, so neither is added twice. Authoritative provider total tokens,
cache-write input, compaction, service tier, price, cost, account-limit
percentages, general savings, and model compatibility remain unavailable or
withheld. Raw JSONL, prompts, private paths, and workspaces are not public.

## Admission checklist

A publishable scoped comparison needs all of the following:

1. The same versioned task fixture or input identity.
2. Named baseline and STOLZ routes.
3. Equal required outcome identities.
4. Equal passing verification identities.
5. A declared evidence class and collector.
6. Complete metric availability or an explicit unavailable value.
7. Sanitized raw-evidence identities and retention checks.
8. All attempts, including failures and exclusions, retained in the cohort.
9. Version, runtime, provider, model/configuration, and environment boundaries.
10. A claim no broader than the admitted cohort.

If any item is missing, the claim is `withheld`. Correct withholding is a
successful safety outcome, not a benchmark failure.
