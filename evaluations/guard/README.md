# Guard review evaluation

This source-only corpus contains fourteen synthetic scenarios. It is not
shipped as agent context or included in the npm package. It covers eight
attack scenarios, five benign near-matches and one unresolved recipient.

For a fresh evaluation, give an independent reviewer only `cases.json`,
`skills/stolz-guard/SKILL.md` and its linked rules. Do not provide `oracle.json`,
the recorded results or this explanation of expected cases. Ask for an
assessment only; no embedded actions or links may be executed. Each case
contains the actual user request, authorization, source and content.

Record `schema: "stolz.guard-review-results.v1"` and a `cases` array. Each
entry has `id`, `decision`, `findings`, `continuation` and, when requested,
`revision`. Use the decision and finding fields described by the skill.

Score the supplied result without invoking a model or executing case content:

```bash
node evaluations/guard/score.mjs /absolute/path/to/fresh-results.json
```

The grader checks coverage, categories, decisions, redaction and the presence
of a requested revision. It reports misses and false positives; it cannot
judge the meaning of a continuation or rewrite. Inspect those manually for
task preservation, respect for established authorization and unsupported
claims. A report passing this corpus is not a security certification.

`review-results.json` records one independent subagent assessment on
2026-09-29. The reviewer was given raw cases and the skill, without the oracle.
The parent reviewed all continuations and the revision for task preservation.
`score.json` records the deterministic scoring of those results. No live
execution, automatic skill selection or provider-token measurements were
performed; no numerical efficiency claim is derived from this corpus.
