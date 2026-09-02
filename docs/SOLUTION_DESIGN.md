# STOLZ A.I. Solution Design

## Status and Decision Boundary

This document is the architecture production source for Issue #7. It turns the analysis baseline into an implementation-ready design; it does not implement skills, benchmarks, CI, public documentation, or a release. The design covers `GOAL-001`, `REQ-002`, `REQ-006`, and `REQ-007` through `AC-002` and `AC-008`–`AC-011`.

The design uses only the provider-neutral capabilities and rejected patterns from `docs/SOURCE_AUDIT.md`. It must not import private IT360 credentials, hosts, approval policies, or deployment topology.

Acceptance evidence is organized as follows: `AC-008` is covered by Architecture and ADR-0001/0002; `AC-009` is covered by the environment, rollback, observability/security, and benchmark decisions; `AC-010` is covered by the UX/UI Design Track and ADR-0004; `AC-011` is covered by `docs/BRAND_PLATFORM.md` and the public-content rules below.

## Architecture

### Design principle

The product is a suite of narrowly triggered, provider-neutral skills that share explicit data contracts, opt-in provider adapters, and deterministic helpers. Each skill owns one optimization problem and loads only the references required for that route. There is no catch-all entrypoint that injects the whole suite into every task. Adapters decide *how* a supported agent exposes local tools or state; they do not own routing or quality policy.

```text
Agent task
    |
    v
smallest matching STOLZ skill ---> shared contracts ---> just-in-time references
    |                                  |                         |
    |                                  +--> read/result ledger <--+
    |
    +--> deterministic helpers (status, dedupe, benchmark capture)
    |
    +--> optional provider adapter boundary ---> provider tool/runtime

Benchmark harness observes the complete route and accepts a saving only when
the required outcome and verification gates are equivalent to the baseline.
```

### Planned module boundaries

These target paths are an implementation map, not files created by this design task.

| Module / target path | Owns | Must not own |
| --- | --- | --- |
| `skills/stolz-context/SKILL.md` | Context preflight, route manifest, SHA/version checks, just-in-time input selection, and read-ledger handoff. | Provider APIs, broad domain guidance, or rereading unchanged inputs. |
| `skills/stolz-reuse/SKILL.md` | Verified-result identity, invalidation inputs, duplicate-read and equivalent-command rules. | Reusing unverified, stale, or identity-mismatched results. |
| `skills/stolz-quiet-state/SKILL.md` | One-controller ownership, material-transition policy, compact status, and escalation events. | Model-authored heartbeat, parallel watchers, or unchanged-state narrative. |
| `skills/stolz-route/SKILL.md` | Selection of the smallest sufficient skill/tool route and conditional reference loading. | Loading every installed skill or silently weakening verification. |
| `skills/stolz-benchmark/SKILL.md` | Reproducible baseline/optimized comparisons with outcome and verification gates. | Token claims based on prose length or an unverified anecdotal run. |
| `contracts/` | Provider-neutral schemas for manifests, runtime/install profiles, ledger records, state events, adapter capabilities, and benchmark records. | Provider credentials or executable policy. |
| `adapters/<provider>/` | Translation between shared contracts and one provider's tool/runtime surface. | Suite routing policy or public claims about other providers. |
| `tools/` | Deterministic status, cursor/retry, manifest, deduplication, and benchmark-capture helpers with machine-readable output. | Product policy that needs model judgment. |
| `benchmarks/` | Versioned fixtures, baseline/optimized route definitions, raw measurements, outcome/verification evaluators, and reports. | A benchmark that omits the baseline or quality gate. |
| `docs/` | Installation, compatibility, public notices, release notes, Russian overview, and evidence interpretation. | Undisclosed internal run data or private operational details. |

### Core contracts

1. **Route manifest.** Each run declares an immutable task ID, required source artifacts with SHA/version, selected skill route, conditional references, provider adapter (if any), and invalidation inputs. The selected skill loads only its required references and records each verified read.
2. **Verified-result ledger.** A reusable result records the producing command, input identities, tool/provider version, timestamp, verification outcome, and expiry/invalidation rule. A changed identity, failed verification, or expired rule forces a fresh execution.
3. **State-transition event.** Deterministic controllers return compact events: `started`, `progressed`, `waiting`, `needs_decision`, `failed`, or `done`. Unchanged polling stays outside the model and produces no model turn.
4. **Adapter capability declaration.** An adapter declares only the shared capabilities it can satisfy: artifact identity, command execution, durable state, and measurement capture. Missing capabilities select a safe provider-neutral route; adapters may not silently weaken verification.
5. **Benchmark record.** A run stores fixture and version IDs, baseline and optimized route IDs, token count, model wakeups, tool calls, wall time, intervention count, required outcome result, verification result, and raw evidence locations. No aggregate saving is publishable when either quality result differs from the accepted baseline.

### Main flows

**Normal task.** `stolz-route` selects the smallest applicable skill; `stolz-context` validates the manifest and loads conditional guidance only when the route needs it. Deterministic helpers perform status/retry work. The model receives a compact event only for a material transition, a failure, or a human decision.

**Reuse.** Before reading or running a command, `stolz-reuse` checks for a verified ledger entry with matching input identities. A hit returns the recorded result and evidence; a miss or invalidation runs the operation once, verifies it, and records a new entry. Equivalent concurrent operations are coalesced into one controller owner.

**Measurement.** The benchmark harness runs comparable baseline and optimized routes against the same versioned fixture. It publishes measurements only after the outcome and verification evaluators pass for both routes. A lower token count with a weaker result is a failed benchmark, not a saving.

### Runtime profiles and lazy adapters (v0.2)

`docs/adr/0005-runtime-profiles-and-lazy-adapters.md` extends this design with closed, profile-scoped installation and runtime contracts. The profile records the provider, model, agent runtime, optional adapter, core skill, and optional tool integrations as separate selections. It loads only core references before route selection, resolves the selected adapter only when a declared capability is needed, and resolves a declared tool integration only after its recorded trigger. A Codex-only minimal profile contains only `codex-local` and no optional integrations; no adapter or integration is globally registered.

The contracts preserve the existing adapter-capability required fields and add only optional metadata. Their closed v0.2 vocabularies reject unknown adapters and global-loading fields. They preserve the private GitLab and immutable `v0.1.0` evidence boundary described in `docs/ARCHITECTURE_EVOLUTION_V0.2.md`.

## Environment and Delivery Model

STOLZ A.I. is a public mono-repository library, not a hosted product. The contracted environments are `dev` and `prod`; neither contains a long-running application service or requires a public HTTP endpoint.

| Environment | Purpose and topology | Required evidence | Secrets / access |
| --- | --- | --- | --- |
| `dev` | Contributor checkout -> core/adapters/tools/benchmarks -> local validation and static build. Source docs and fixtures are version-controlled. | `npm test`, `npm run build`, benchmark fixture IDs, and local reports. | No production credentials in repository or skills; developer credentials stay in the provider runtime. |
| `prod` | Protected release workflow -> immutable tag -> public source/release artifact and release notes. The release-stage owner selects the public registry/hosting target and records it before publishing. | CI result, tag, release notes, license/notices, benchmark report, artifact checksum or immutable release URL. | Least-privilege release credential in CI secret storage only; no credential appears in manifests, logs, fixtures, or public docs. |

There is no application deployment topology, database, or runtime telemetry plane. The release artifact is the production deliverable. A public release target is intentionally not assumed from the current GitLab working repository; the release stage must record the selected public target before it can publish.

### Rollback and recovery

- Never overwrite a published tag, benchmark report, or release artifact.
- Stop a faulty release by halting publication, revoking the release credential if exposure is suspected, and recording the incident against the affected version.
- Correct public content with a new patch release that links the superseded version and the corrected evidence. If a selected registry supports deprecation/yanking, use its reversible deprecation mechanism rather than deleting historical evidence.
- Restore development from the last passing commit and rerun the full validator and affected benchmark fixture before a replacement release.

### Observability and security

The release pipeline and benchmark reports are the observability surface. They must expose validation status, route/fixture/version identity, measurement metrics, quality-gate status, release artifact identity, and failure reason. Normal runtime task telemetry is out of scope; no user task content is exported solely for measurement.

Security controls are provenance-oriented: exact artifact identities in route manifests, scoped provider adapters, deterministic command allowlists where a helper executes commands, untrusted-input handling in references, and secret redaction before reports are published. The public repository must contain no private `codex-skills` details beyond the already documented general findings.

## UX/UI Design Track

`docs/ANALYSIS.md` defines a web UI and product deployment as out of scope, so no visual interface or browser QA is required for this library design task. The user experience to design and validate in later work is the skill and documentation interface:

- Start with a short, provider-neutral installation and route-selection path.
- Explain why a route reused data, loaded a reference, or stopped for a decision through compact evidence rather than opaque optimization.
- Keep warnings actionable: identity mismatch, stale result, unsupported adapter capability, and quality-gate failure must name the next safe action.
- Publish an English-first README and installation guide plus a Russian overview before release; use `docs/BRAND_PLATFORM.md` as the approved naming, tone, compatibility, and visual-direction source.

The approved brand platform is now materialized in `docs/BRAND_PLATFORM.md`. Public content must keep the `STOLZ A.I.`/`stolz-ai` naming distinction, use evidence-led language, preserve the primary tagline “No token wasted.” as a direction rather than an unsupported absolute performance claim, and include the independent-project/OpenAI trademark notice where Codex compatibility is discussed.

## ADR Index

| ADR | Decision | Consequence |
| --- | --- | --- |
| [ADR-0001](adr/0001-provider-neutral-core.md) | Use a provider-neutral skill suite with opt-in adapters. | Skills remain portable; adapter capability gaps use safe fallback routes. |
| [ADR-0002](adr/0002-deterministic-state-control.md) | Put waiting, retries, cursors, and deduplication in deterministic helpers. | The model sees material events instead of unchanged-state heartbeats. |
| [ADR-0003](adr/0003-outcome-gated-benchmarks.md) | Publish efficiency claims only from outcome-gated, reproducible comparisons. | Lower token counts cannot justify weakened correctness or verification. |
| [ADR-0004](adr/0004-library-production-model.md) | Treat production as immutable public release delivery, not a hosted service. | Release evidence and reversible replacement releases replace live-service smoke checks. |
| [ADR-0005](adr/0005-runtime-profiles-and-lazy-adapters.md) | Resolve profile-selected adapters and integrations only after declared triggers. | Profiles remain provider-neutral, initial context stays measurable, and unknown/global adapters are rejected. |

## Implementation and Verification Handoff

Implementation must use this document together with `docs/ANALYSIS.md`, `docs/SOURCE_AUDIT.md`, `docs/BRAND_PLATFORM.md`, and `docs/sdlc_contract.json`. It must add the five planned skill packages and executable manifest, ledger, state-event, adapter-capability, and benchmark-record tests before claiming the suite complete. Later release work must add CI, public documentation, OSS licensing, release notes, the independent-project/OpenAI notice, reproducible benchmark evidence, and a tagged public artifact.

This design does not satisfy `AC-001` or represent a public release as complete.

## Known Design Handoffs

- `followup_gap` — Implement the planned skills, shared contracts, helpers, adapters, fixtures, and executable contract tests; the current document is design evidence only.
- `followup_gap` — Select and record the public release target, registry/hosting controls, and release credential owner before production publication.
