# STOLZ A.I. v0.14.0 — bounded measurement report

Installed product under test: v0.13.0, archive SHA-256 `05645ff2d899dee7a8c3231c04e069a11f7e6bccb044509f9d39e58f1b34c82c`.

All routes passed the same required outcome and verification. Token counters are the provider-reported fields available in Codex JSONL. Cached input is a subset of input; reasoning output is a subset of output. Do not add either subset again. The comparable delta is baseline `(input + output)` minus STOLZ `(input + output)`; it is not an authoritative provider total or a cost result.

## sol-xhigh-reads-navigation

Tuple: `0.154.0-alpha.6.2` / `gpt-5.6-sol` / `xhigh` / `v22.16.0` / `win32-x64`. Mode: `installed_skills_without_local_state`.

Quality gate: 10/10 attempts and 5/5 pairs included; outcome and verification both passed; 0 attempts and 0 pairs excluded.

| Metric | Baseline | STOLZ | Baseline − STOLZ |
| --- | ---: | ---: | ---: |
| Input tokens | 193974 | 400666 | -206692 |
| Cached input tokens (subset) | 138240 | 291712 | -153472 |
| Output tokens | 1064 | 3061 | -1997 |
| Reasoning output tokens (subset) | 350 | 730 | -380 |
| Comparable input + output | 195038 | 403727 | -208689 |
| Wall time, ms | 129439 | 226453 | -97014 |
| Tool calls | 5 | 15 | -10 |
| Tool output, bytes | 4145 | 10126 | -5981 |
| Public-profile setup, ms | 0 | 12696 | -12696 |

Admission and scoped claim: `withheld` / `withheld`. Manifest: `benchmarks/v3/real/manifests/v014-sol-xhigh-reads-navigation.json`; report: `reports/benchmark-v3/real/v014-sol-xhigh-reads-navigation.json`.

## sol-xhigh-build-check-invalidation

Tuple: `0.154.0-alpha.6.2` / `gpt-5.6-sol` / `xhigh` / `v22.16.0` / `win32-x64`. Mode: `installed_skills_without_local_state`.

Quality gate: 10/10 attempts and 5/5 pairs included; outcome and verification both passed; 0 attempts and 0 pairs excluded.

| Metric | Baseline | STOLZ | Baseline − STOLZ |
| --- | ---: | ---: | ---: |
| Input tokens | 194517 | 400359 | -205842 |
| Cached input tokens (subset) | 150144 | 319104 | -168960 |
| Output tokens | 1664 | 3555 | -1891 |
| Reasoning output tokens (subset) | 785 | 799 | -14 |
| Comparable input + output | 196181 | 403914 | -207733 |
| Wall time, ms | 120462 | 216379 | -95917 |
| Tool calls | 5 | 15 | -10 |
| Tool output, bytes | 4565 | 7785 | -3220 |
| Public-profile setup, ms | 0 | 12149 | -12149 |

Admission and scoped claim: `withheld` / `withheld`. Manifest: `benchmarks/v3/real/manifests/v014-sol-xhigh-build-check-invalidation.json`; report: `reports/benchmark-v3/real/v014-sol-xhigh-build-check-invalidation.json`.

## sol-xhigh-multi-step-state-transition

Tuple: `0.154.0-alpha.6.2` / `gpt-5.6-sol` / `xhigh` / `v22.16.0` / `win32-x64`. Mode: `installed_skills_with_explicit_local_state`.

Quality gate: 10/10 attempts and 5/5 pairs included; outcome and verification both passed; 0 attempts and 0 pairs excluded.

| Metric | Baseline | STOLZ | Baseline − STOLZ |
| --- | ---: | ---: | ---: |
| Input tokens | 193950 | 404709 | -210759 |
| Cached input tokens (subset) | 125184 | 338816 | -213632 |
| Output tokens | 1789 | 5736 | -3947 |
| Reasoning output tokens (subset) | 939 | 3086 | -2147 |
| Comparable input + output | 195739 | 410445 | -214706 |
| Wall time, ms | 136881 | 265623 | -128742 |
| Tool calls | 5 | 15 | -10 |
| Tool output, bytes | 1130 | 12500 | -11370 |
| Public-profile setup, ms | 0 | 11344 | -11344 |

Admission and scoped claim: `withheld` / `withheld`. Manifest: `benchmarks/v3/real/manifests/v014-sol-xhigh-multi-step-state-transition.json`; report: `reports/benchmark-v3/real/v014-sol-xhigh-multi-step-state-transition.json`.

## astra-medium-multi-step-state-transition

Tuple: `0.154.0-alpha.6.2` / `gpt-6-astra` / `medium` / `v22.16.0` / `win32-x64`. Mode: `installed_skills_with_explicit_local_state`.

Quality gate: 10/10 attempts and 5/5 pairs included; outcome and verification both passed; 0 attempts and 0 pairs excluded.

| Metric | Baseline | STOLZ | Baseline − STOLZ |
| --- | ---: | ---: | ---: |
| Input tokens | 193782 | 401338 | -207556 |
| Cached input tokens (subset) | 154240 | 354560 | -200320 |
| Output tokens | 355 | 910 | -555 |
| Reasoning output tokens (subset) | 0 | 0 | 0 |
| Comparable input + output | 194137 | 402248 | -208111 |
| Wall time, ms | 102221 | 188995 | -86774 |
| Tool calls | 5 | 15 | -10 |
| Tool output, bytes | 1130 | 12690 | -11560 |
| Public-profile setup, ms | 0 | 12173 | -12173 |

Admission and scoped claim: `withheld` / `withheld`. Manifest: `benchmarks/v3/real/manifests/v014-astra-medium-multi-step-state-transition.json`; report: `reports/benchmark-v3/real/v014-astra-medium-multi-step-state-transition.json`.

## Interpretation boundary

Every measured cohort had a negative comparable token delta and higher STOLZ wall time for these small controlled tasks. The result is evidence of overhead in these exact fixtures and tuples, not a general accuracy estimate, compatibility certificate, provider-wide conclusion, or proof about larger real projects. Sol and Astra remain separate cohorts and are not pooled.

Authoritative total tokens, cache-write input, compaction, service tier, price, cost, and account-limit percentages were unavailable. General savings and cost claims remain withheld. Raw JSONL, prompts, workspaces, and private paths remain outside the package; minimized public records and their identities are retained here.

