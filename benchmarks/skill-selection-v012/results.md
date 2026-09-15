# STOLZ A.I. v0.12.0 — installed-skill selection evaluation

Environment: Codex CLI `0.153.4`, model `gpt-5.6-sol`, reasoning `xhigh`.

The run used isolated workspaces with the five package skills plus neutral skills for code review, release-note editing, and test triage. Oracles and acceptable routes were kept outside each model workspace. Raw JSONL and stderr remain private; this report publishes every prompt, minimized observation, failure, and evidence hash.

## Runs

| Run | Candidate | Attempts | Completed | Route | Outcome | Permission |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| smoke-initial | `b915331e91a5` | 4 | 0 | 0/4 | 0/4 | 4/4 |
| smoke-recovery | `931aa261e0c2` | 4 | 4 | 1/4 | 3/4 | 4/4 |
| development | `7534a1a9f23f` | 12 | 12 | 11/12 | 12/12 | 12/12 |
| heldout-a | `15864e0e5ba2` | 24 | 24 | 21/24 | 23/24 | 24/24 |
| heldout-b | `c176997850f6` | 24 | 24 | 23/24 | 24/24 | 24/24 |

## Release gate

Replacement held-out result: **passed** — 23/24 strict routes, 24/24 outcomes, 24/24 permission behavior; every group met at least 3/4 strict routes.

This is a small diagnostic set, not a universal accuracy estimate. It does not establish token savings, provider-wide behavior, cost, or certification of another model.

## Retained failures and adjudications

| Run | Cases | Classification | Disposition | Detail |
| --- | --- | --- | --- | --- |
| smoke-initial | `dev-context-explicit-manifest`, `dev-reuse-explicit-hit`, `dev-state-explicit-unchanged`, `dev-measurement-explicit-pair` | collector_invocation_failure | retained_failure | Codex CLI rejected the simultaneous --approve-for-me and --sandbox flags before any model turn. The four raw stderr records are retained; commit 931aa261 removed the incompatible duplicate flag. |
| smoke-recovery | `dev-reuse-explicit-hit`, `dev-state-explicit-unchanged`, `dev-measurement-explicit-pair` | collector_path_detection_failure | retained_failure | The model read the required roots and references through Windows paths containing doubled backslashes, but collector v1.0.0 initially failed to recognize those paths. Raw traces are retained; commit 7534a1a9 fixed normalization. |
| smoke-recovery | `dev-context-explicit-manifest` | development_fixture_incomplete | retained_failure | The minimal fixture omitted manifest fields required by the published context rules, so the model correctly chose the normal route. The development fixture was completed before the full development split. |
| development | `dev-context-first-read` | confirmed_skill_trigger_defect | fixed | An ordinary first read incorrectly selected stolz-context. Commit 15864e0e narrowed discovery to an existing STOLZ context manifest or read-ledger artifact. |
| heldout-a | `hold-context-mismatch` | runtime_shell_read_failure | retained_failure | The model selected stolz-context and returned the correct fallback, but two cmd.exe quoting attempts failed to read the root/reference. The failure remains visible and was not counted as a passing strict route. |
| heldout-a | `hold-context-goal-switch` | oracle_incomplete_identity | retained_failure | The fixed oracle expected reuse although the fixture lacked required input, invalidation, tool, timestamp, and evidence identities. The model followed the skill's fail-closed rule and returned reuse_miss. |
| heldout-a | `hold-reuse-first-read` | confirmed_skill_trigger_defect | fixed_with_replacement_set | A first file read with no prior result incorrectly selected stolz-reuse. Commit c1769978 limited discovery to an existing reusable result or competing execution; the replacement held-out set was frozen first. |
| heldout-a | `hold-measurement-complete-provider` | collector_external_skill_classification_failure | retained_failure | The model correctly selected stolz-benchmark and also followed the host powershell-shell instruction. Collector scoring wrongly treated that external host skill as a disallowed product route; commit 1ad444ba separated external skills. |
| heldout-b | `b-context-ordinary-read` | neutral_skill_selected | accepted_automatic_miss | No STOLZ skill was selected. The neutral release-note-editor skill matched a version-label lookup and the requested outcome was correct. The strict predeclared oracle allowed no skill, so the automatic miss remains unchanged. |

## Attempt records

Every one of the 68 attempt records, including automatic failures, is retained in the adjacent JSON report.
