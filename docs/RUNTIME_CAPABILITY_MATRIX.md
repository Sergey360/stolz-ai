# Runtime Capability Matrix for Benchmark v2

## Compatibility versus certification

This table distinguishes layers that must not be conflated. The provider-neutral
core is portable policy, not a support promise for every provider, model, or
runtime. `codex-local` is the only implemented and certified v0.2.0 adapter;
its certification covers the tested local Codex runtime boundary, not
provider-native token telemetry. Claude Code is not supported or certified.

| Layer | v0.2.0 status | Meaning |
| --- | --- | --- |
| Provider | Not inferred by profiles | A provider identity is not guessed from a runtime. |
| Model | Not inferred by profiles | A model identity and its telemetry require admitted evidence. |
| Runtime | Codex profile tested; other runtime fallback | A runtime may use provider-neutral fallback without certification. |
| Adapter | `codex-local` certified only | Tested for declared local capabilities and lazy resolution. |
| Core skill | Five provider-neutral skills | Preserve outcome and verification gates independently of adapters. |
| Optional integration | Profile- and trigger-scoped | Filesystem, GitLab, and benchmark capture remain unloaded until selected and triggered. |

GitLab integration refers only to private authorized access. It does not imply
that this GitLab repository is anonymously accessible or publicly hosted.

## Scope and status vocabulary

This matrix is an evidence-admission policy for Issue #69, not a claim that a
runtime has been instrumented in this repository. A row is `supported` only
when its cited vendor material describes the capability and a v2 run retains
the required raw evidence. `experimental` means the documented interface can
be evaluated but no STOLZ-owned collector/evidence fixture is accepted yet.
`unavailable` means no scoped, durable evidence is currently admitted. The
status applies to the named metric class, not to the product as a whole.

| Runtime / access contour | Provider-native token evidence | Runtime event evidence | Benchmark-v2 admission status | Evidence basis and required capture |
| --- | --- | --- | --- | --- |
| Codex through an OpenAI API response | `experimental` | `experimental` | `experimental` | OpenAI's API reference documents response usage fields, but a v2 run must retain the exact response/export, model/configuration, capture method, and redacted SHA identity before token usage becomes `provider_native`. A Codex-host-only run without such an export is `unavailable` for provider tokens. This does not change `codex-local` adapter certification. |
| Claude Code | `unavailable` | `experimental` | `experimental` | Claude Code documents JSON and stream-JSON output modes. A collector may record its own versioned events as `runtime_telemetry`; no provider-native token claim is admitted without a provider response/export that meets the v2 evidence schema. |
| Qwen / Alibaba access through a documented API | `experimental` | `unavailable` | `experimental` | The provider/API integration, model/configuration, and raw usage response must be pinned by a future collector. Until a fixture supplies that response, no provider-native token metric is admitted. Runtime metrics require a separately declared runtime collector. |
| Z.ai access through a documented API | `experimental` | `unavailable` | `experimental` | The provider/API integration, model/configuration, and raw usage response must be pinned by a future collector. Until a fixture supplies that response, no provider-native token metric is admitted. Runtime metrics require a separately declared runtime collector. |

The Codex API evidence basis is the official OpenAI API reference, which
describes completion usage fields and the API's token-counting endpoint. The
Claude Code evidence basis is its official CLI reference, which documents
machine-readable `json` and `stream-json` output modes. Qwen/Alibaba and Z.ai
are deliberately not promoted beyond `experimental` because this repository
does not yet retain a reviewed provider-native export or a STOLZ collector for
them.

## Collection rules by status

- `supported`: retain the versioned collector, raw export/event identity,
  provider/model/runtime configuration, timestamp, sanitization manifest, and
  a passing v2 contract test. Recheck the status when any material component
  changes.
- `experimental`: run only against a versioned fixture; label reports
  exploratory and do not publish a cross-provider or provider-wide saving.
- `unavailable`: record the reason and attempted capture boundary. Do not use
  zero, an estimate, a billing aggregate, or another runtime's result as a
  substitute.

## Within-runtime comparison rule

Benchmark v2 compares routes within the same runtime contour by default. A
cross-runtime comparison is `not_comparable` unless the fixture, task, outcome,
verification, provider/model/configuration, collector, capture method, and
relevant environment identities are explicitly compatible. Different agent
runtimes may still be evaluated, but their results are separately scoped and
must not be ranked as provider efficiency without matching `provider_native`
evidence.

## Source references

- [OpenAI API completion reference](https://developers.openai.com/api/reference/cli/resources/completions)
- [OpenAI input-token-count reference](https://developers.openai.com/api/reference/cli/resources/responses/subresources/input_tokens)
- [Claude Code CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- `docs/BENCHMARK_V2_DESIGN.md`
- `docs/ARCHITECTURE_EVOLUTION_V0.2.md`

Known gaps:

- `followup_gap` — add reviewed, versioned Qwen/Alibaba and Z.ai primary
  references plus collectors before moving either row to `supported`.
- `followup_gap` — add a Codex and Claude Code capture fixture with redacted
  raw evidence before moving their metric classes to `supported`.
