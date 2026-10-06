# Architecture and exact capability matrix

STOLZ A.I. v0.18.0 exposes five optimization skills, optional `stolz-guard`,
`stolz-evidence` and `stolz-browser`, a
profile resolver and installer, runtime profiles and lazy adapters, sanitized
evidence records, and the explicit `codex-local-state` entry point. It uses
one runtime dependency (`ajv`) only to validate the versioned local contracts.

Version 0.16.0 adds `stolz-guard` as a sixth, optional skill. The
five managed optimization skills and their profile schemas remain unchanged.
Guard's manual installation is outside the managed profile lifecycle and its
existing certification evidence.

## Product layers

Version `0.17.0` adds optional `stolz-evidence` as a
seventh skill. It records actual source scope, support for claims, application
and unmet dependencies. Existing fragment and reuse identities remain the
authoritative identity records; semantic coverage is a compact Markdown index,
not a second read ledger or proof of understanding. The `evidence` route needs
no adapter. A separate explicit project-rule merge can add a short fallback
instruction without selecting the skill. Managed profiles, local-state API
and historical runtime certification remain unchanged.

Version `0.18.0` adds optional `stolz-browser` for controlled tab ownership,
reuse, lifecycle operations and recovery decisions. Its short root loads tab
lifecycle rules before those operations and Desktop-specific detail only on
a relevant host. The complete skill directory is independently installable;
it needs no sibling adapter or personal recovery skill. The initial scope is
Codex Desktop workflow guidance. No native browser controller, cross-runtime
browser certification, crash-prevention evidence or savings claim is added.

1. **Skills.** `stolz-route`, `stolz-context`, `stolz-reuse`,
   `stolz-quiet-state`, and `stolz-benchmark` define focused agent behavior.
   Each can be installed and used independently.
   The optional `stolz-guard` reviews prompts and concrete untrusted
   instructions for injection, disclosure, authority and persistent-context
   abuse, retaining the user's objective and existing authorization.
2. **Profiles and lazy adapters.** A profile selects the five skills and names
   an adapter boundary for Codex, Claude Code, or Qwen Code. Resolution is
   explicit and selected-only; it does not discover providers or load every
   integration.
3. **Evidence.** Fixtures and retained records describe exactly what was
   checked. Runtime evidence and provider evidence stay structurally separate.
4. **Explicit local state.** `stolz-ai/codex-local-state` composes the durable
   verified-result store, context ledger, and quiet-state controller only after
   a caller supplies `enabled: true`, a workspace, and a bounded local storage
   budget. It stores data below that chosen workspace and never starts a
   background controller.

The last boundary is intentional. `stolz-reuse` and `stolz-quiet-state` remain
operational instructions for an agent and its available tools. The optional
entry point is a caller-driven local bridge, not a sixth skill, bundled daemon,
shared cache, or automatic polling service.

## Explicit local Codex state API v1

External-operation handoff loads the quiet-state
[continuation reference](../skills/stolz-quiet-state/references/handoff-and-continuation.md)
only when needed. The host owns the original-task record and durable wake
delivery. The optional [Codex Desktop fallback](../adapters/codex/async-wait.md)
uses scheduled model runs and therefore has context overhead even when silent.
Existing external controllers remain the preferred owner; the local-state API
does not add scheduling, automatic resumption or transactional side effects.

`openCodexLocalState({ enabled: true, workspace, max_storage_bytes })` is the
only stable public state entry point. The returned handle accepts one bounded
context range, a fully declared Verified Reuse identity/policy/verification,
and one quiet-state snapshot at a time. It returns compact projections and
named fallback reasons; it never returns a raw artifact as a model projection.

The handle uses atomic durable helpers, file locks, integrity checks, expiry,
and recovery. Unchanged quiet snapshots have zero model invocations and remain
quiet across restart. Input or policy change, expiry, invalidation, corruption,
or storage exhaustion is a miss or unavailable result with
`normal_verified_route` as the fallback. The public contract is versioned at
`1.0.0`; helper paths and on-disk records are private implementation details.

The package documents the stable API only; its internal implementations,
helper paths, and on-disk records are not compatibility promises.

## Optional browser workflow

`concern: 'browser'` selects instructions without importing a runtime adapter.
`planSkillContext({ concern: 'browser', needsReference: true })` adds only the
tab lifecycle reference. The caller may explicitly supply
`browserHost: 'codex-desktop'` to add the conditional Desktop reference.
The root stays the only read when `needsReference` is false. This host label
selects documentation; it does not discover browser tools or certify access.

Execution requires the host's current documented tools. Ordinary web search
does not select this workflow. Suitable task-owned or explicitly selected
tabs may be reused; borrowed tabs require closure authority. Fresh observations
reconcile handles after interruption and ambiguous close results. Workflow
selection across runtimes is not execution certification across runtimes.

The public-package guard checks credential-like values, personal local paths,
Desktop thread identifiers and native crash-artifact identifiers. Its output
names affected files and classes without echoing the matched values. These
checks are bounded detectors, not a guarantee that every possible private
detail will be recognized.

## Optional instruction-security review

`concern: 'guard'` in `selectRoutedSkill` and `planSkillContext` selects guard.
The root is the only instruction read until `needsReference: true` requests
the review rules. Guard needs no adapter capability; the lazy resolver returns
a provider-neutral review route without importing an adapter. Callers still
identify the concern; this is not an incoming-text classifier.

Guard distinguishes source identity from content authority. A verified hash,
cached result or tool message cannot grant permission for a new side effect.
Reports use redacted evidence and a concrete continuation. The host must
enforce tool permissions and isolation; a review has no detection guarantee
or certification for unseen inputs, models or runtimes. Source-only synthetic
evaluation material is kept outside the npm package.

## Reproducible project setup in v0.13

The profile CLI owns a versioned JSON envelope, a reviewed team lock, and the
managed installation lifecycle. The lock binds the package, selected profile,
five skills, lazy adapter, optional integrations, and declared runtime tuple.
It deliberately excludes credentials, local paths, and model identity.

`status` and `doctor` inspect without mutation. `update` snapshots the previous
owned files before changing them. A version-2 transaction journal makes an
interrupted update distinguishable from an ordinary local edit; `recover`
verifies both the backup and the remaining owned bytes before restoring them.
After a completed update, `rollback` restores the previous owned manifest and
files. Foreign files are never added to STOLZ ownership.

| Contract | Owner | Compatibility boundary | Conformance check |
| --- | --- | --- | --- |
| Profile-CLI success JSON | `tools/profile-cli.mjs` | `format_version: "1.0"`; failures remain non-zero | `test/profile-cli-lifecycle.test.mjs` |
| Team profile lock | `tools/profile-lifecycle.mjs` | Lock version `1.0`; unknown version and drift are denied | `test/profile-lock.test.mjs` |
| Installation and recovery | `tools/profile-lifecycle.mjs` | Manifest version `4.0`; transaction version `2.0`; ownership is explicit | `test/profile-lifecycle-manifest.test.mjs` |
| Public archive path | npm package inventory and `examples/verify-public-package.mjs` | Runs without private-repository files | `test/public-package-path.test.mjs` |
| Local Codex state | `tools/codex-local-state.mjs` | Explicit API `1.0.0`; caller-selected local workspace only | `test/codex-local-state.test.mjs` |

These are testable minor-release mechanisms, not a v1.0 stability declaration.
The v1.0 gate still depends on real sequential pilot updates and sufficient
relevant observation.

## Evidence levels

| Level | Meaning in v0.7.1 | Current boundary |
| --- | --- | --- |
| C0 | A versioned runtime fixture documents settings, skill destinations, and optional surfaces | Fixture evidence only |
| C1 | The declared CLI/profile/adapter behavior passed its conformance checks | Exact declared tuple only |
| C2 | Sanitized runtime telemetry for the exact runtime and adapter tuple passed admission | Certified for the two exact rows below |
| C3 | Two distinct sanitized provider-export descriptors for one scenario have equal outcome and verification identities | Admission mechanism exists; all current provider pairs are withheld |

C2 never implies C3. A provider overlay is declarative connection or plan
metadata; it does not prove a provider call, model identity, billing, or
provider-native token count.

## Exact capability matrix

| Environment | Exact version or tested contour | Skills installation | Profile / adapter | Evidence | Limitation and recheck trigger |
| --- | --- | --- | --- | --- | --- |
| Codex CLI | 0.153.4 on Windows with Node.js 22.22.2 and npm 10.9.7 | Manual copy or `profile-cli install --runtime codex` | `codex-minimal` / `codex-local` | Four installed-local executions passed in the [v0.7.0 release evidence](https://github.com/Sergey360/stolz-ai/releases/tag/v0.7.0); the v0.12 `gpt-5.6-sol` / `xhigh` diagnostic passed its final 24-case gate | These are bounded contours, not Codex-wide, future-version, provider-token, cost, or universal routing certifications |
| Claude Code | 2.1.251 | `profile-cli install --runtime claude-code` to a configured skills directory, normally project `.claude/skills/` | [`claude-code-minimal` 3.0.0](../profiles/claude-code-minimal.v3.json) / [`claude-code` 1.0.0](../adapters/claude-code/capabilities.json) | C0/C1 plus exact-version C2 [`certified`](../fixtures/runtime-adapters/claude-code/c2.sanitized-telemetry.json) | Any runtime, adapter, schema, or evidence-expiry change requires fresh evidence; no provider-native or C3 claim |
| Qwen Code | 0.22.3 | `profile-cli install --runtime qwen-code` to a configured skills directory, normally project `.qwen/skills/` | [`qwen-code-minimal` 3.0.0](../profiles/qwen-code-minimal.v3.json) / [`qwen-code` 1.0.0](../adapters/qwen-code/capabilities.json) | C0/C1 plus exact-version C2 [`certified`](../fixtures/runtime-adapters/qwen-code/c2.sanitized-telemetry.json) | Any runtime, adapter, schema, or evidence-expiry change requires fresh evidence; no provider-native or C3 claim |
| Other runtime or version | Not certified | The five skills may be copied only if the host supports compatible skill directories | No matching certified profile/adapter tuple | Provider-neutral policy only | Use the normal verified route; do not inherit a nearby version's evidence |

The package can therefore be installed for three declared runtime IDs, but the
strength of evidence differs by row. Successful copying, profile resolution,
adapter availability, C2 certification, and C3 certification are not synonyms.

## Example: select only the required context

Suppose a task asks whether a configuration change affects the installer.

An ordinary source question can be answered directly from the installer and
relevant profile, without a STOLZ manifest or routing skill. When the task
explicitly requires identity-bound reads, select `stolz-context` directly.
Validate the manifest and immutable identities before using the optimized
read. If the manifest or identity is unavailable, use the normal verified
route. An unavailable optimization does not end the user's task.

This example is context discipline. It is not proof that a private context
ledger or automatic delta reader was installed with the five skills.

## Conditional instruction loading

The host discovers five short descriptions. A known concern loads its one
`SKILL.md`; the root states when deeper rules are needed. `stolz-route` is for
an unclear optimization decision, not a prerequisite for every task. There is
no repository `AGENTS.md` or mandatory repository-map preload.

The internal helper `planSkillContext` in `tools/routed-skills.mjs` makes the
read boundary explicit: `concern: 'none'` opens nothing, a known concern opens
one root, and `needsReference: true` adds only that concern's rules. An unknown
concern opens the router. Its `references` can be passed to `prepareContext`
to exclude unneeded manifest references while retaining required sources.
The existing selectors still return their compatible reference allowlists.
Callers identify the concern; this helper does not classify natural language
or automatically connect a model to tools. It is not another stable package
export or a persistent-state format change.

For prompt authoring, the router offers an optional task-brief reference with
bounded research, scoped local authority, existing authorization and observable
completion. It is not loaded for ordinary route selection. These instructions
remain provider-neutral.

v0.12 adds a bounded live diagnostic of discovery from natural-language
requests. Codex CLI 0.153.4 ran with `gpt-5.6-sol` at `xhigh` reasoning in
isolated workspaces containing the five product skills and three neutral
competitors. The untouched replacement held-out set passed 23/24 strict routes,
24/24 required outcomes, and 24/24 permission decisions. Every one of its six
groups passed at least 3/4 strict routes. All 68 attempts across smoke,
development, and held-out runs remain represented in the
[public report](../benchmarks/skill-selection-v012/results.md).

This establishes only the observed behavior of that small diagnostic and exact
tuple. It does not certify universal routing accuracy, another model or runtime,
provider token usage, cost, or savings.

## Example: refuse unsafe reuse

Assume a previous `npm test` result was verified for commit `A`, but the current
checkout is commit `B`. `stolz-reuse` must report a miss such as
`input_identity_changed`, run `npm test` again, and verify the new result. It
must also refuse reuse when the previous result is expired, unverified, belongs
to another command argument vector, or lacks an immutable identity.

Correct refusal is part of the product. Repeating work is safer than returning
a result for the wrong source.

## Fail-closed behavior

- Missing profile: do not infer the closest runtime.
- Version drift: mark evidence stale and require recheck.
- Missing runtime telemetry: do not rename fixture data as C2.
- Missing comparable provider exports: keep C3 withheld.
- Missing verification identity: reject benchmark admission and verified reuse.
- Failed optional component: preserve the required outcome through the normal
  route.

STOLZ A.I. is an independent open-source project and is not affiliated with or
endorsed by OpenAI, Anthropic, Alibaba Cloud, or Z.ai.
