# Architecture and exact capability matrix

STOLZ A.I. v0.12.0 exposes a small public surface: five independent skills, a
profile resolver and installer, runtime profiles and lazy adapters, sanitized
evidence records, and the explicit `codex-local-state` entry point. It uses
one runtime dependency (`ajv`) only to validate the versioned local contracts.

## Product layers

1. **Skills.** `stolz-route`, `stolz-context`, `stolz-reuse`,
   `stolz-quiet-state`, and `stolz-benchmark` define focused agent behavior.
   Each can be installed and used independently.
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
