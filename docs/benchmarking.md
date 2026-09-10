# Benchmarking

STOLZ A.I. reports an efficiency result only when baseline and optimized routes
solve the same versioned task, produce equivalent outcomes, and pass the same
required verification.

## Evidence classes

| Class | Source | What it can establish |
| --- | --- | --- |
| `fixture_only` | Authored deterministic fixture | Harness and route behavior on that fixture only. |
| `runtime_measured` | Sanitized measurement from an exact runtime and adapter | Scenario-scoped runtime behavior for that exact tuple. |
| provider-native | Sanitized primary provider export | Provider claims only after paired C3 admission. |

Missing evidence is unavailable, not zero. These classes must not be combined
as if they measured the same thing.

## Fixture result

The checked-in `context-selection-v1` fixture compares eager context loading
with required-only context loading.

| Route | Authored token units | Model wakeups | Tool calls | Outcome | Verification |
| --- | ---: | ---: | ---: | --- | --- |
| eager context | 1,530 | 4 | 8 | `validated-context-plan-v1` | pass |
| required context | 980 | 3 | 4 | `validated-context-plan-v1` | pass |

The optimized route uses 550 fewer authored units on this fixture. Those units
are not Codex usage, API billing, or provider telemetry, so the percentage
cannot be generalized to real tasks.

## Historical runtime-measured evidence

The v0.4.1 Codex cohort produced mixed signed token deltas (`baseline - STOLZ`):

| Scenario | Signed delta | Interpretation |
| --- | ---: | --- |
| reads/navigation | +2,867 | STOLZ used fewer measured tokens. |
| build/check invalidation | -2,880 | STOLZ used more measured tokens. |
| quiet/wait transition | -1,330 | STOLZ used more measured tokens. |

Because the scenarios are mixed and bounded, they do not establish a general
v0.7.1 savings rate, provider-wide advantage, percentage claim, or cost claim.

## v0.7 runtime and provider evidence

Claude Code C2 evidence is limited to 2.1.251 with adapter 1.0.0. Qwen Code C2
evidence is limited to 0.22.3 with adapter 1.0.0. Codex CLI 0.153.4 has verified
installed-local executions but no v0.7 C2 evidence row.

C3 admission requires two distinct sanitized provider exports for the same
scenario with equal outcome and required-verification identities. Unsafe data,
missing exports, version drift, unequal outcomes, or incomparable evidence
withhold the claim. All current provider pairs remain withheld.

## Reproduce public checks

```bash
npm ci --ignore-scripts
npm test
npm run benchmark:check
npm run benchmark:v2:check
npm run benchmark:v3 -- --verify-report reports/benchmark-v3/real/reads-navigation.json --check
```

The first two benchmark commands validate fixture-scoped reports. The final
command validates one sanitized runtime-measured report. None of them performs
a live provider call.

## Admission rules

A comparison is withheld when either route misses the required outcome, either
route fails verification, identities differ, evidence is missing, privacy
checks fail, token sources are incomparable, or the proposed claim exceeds the
evidence class. A smaller run with weaker verification is a regression, not a
saving.
