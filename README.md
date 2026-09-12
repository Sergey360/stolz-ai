<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/stolz-readme-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/stolz-readme-light.png">
  <img src="assets/brand/stolz-readme-light.png" width="820" alt="STOLZ A.I. — a folded book-page S with a red bookmark">
</picture>

**Rational skills for Codex and compatible AI coding agents.**
*No token wasted.*

**English** · [Русский](README.ru.md) · [Nederlands](README.nl.md) · [中文](README.zh.md) · [עברית](README.he.md)

[![CI](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Sergey360/stolz-ai?display_name=tag&color=416B51&style=flat-square)](https://github.com/Sergey360/stolz-ai/releases/latest)
[![Node.js ≥20](https://img.shields.io/badge/Node.js-%E2%89%A520-416B51?logo=nodedotjs&logoColor=white&style=flat-square)](package.json)
[![5 skills](https://img.shields.io/badge/focused_skills-5-BB7A2A?style=flat-square)](skills)
[![MIT](https://img.shields.io/badge/license-MIT-6F5B4E?style=flat-square)](LICENSE)
[![No token wasted](https://img.shields.io/badge/no_token-wasted-AD3F2E?style=flat-square)](docs/architecture.md)

</div>

**STOLZ A.I.** keeps agent work focused: choose the smallest sufficient route,
load context only when needed, reuse verified results, and keep unchanged state
outside the model.

It does not make a model think less. It helps it waste less—without replacing
correctness, verification, or reliability with a cheaper shortcut.

It is a package of five agent skills, profiles, lazy adapters, evidence
records, and one opt-in local Codex state entry point. Installing skills does
not start a daemon, shared cache, durable state store, or automatic polling
controller. Local state exists only after an application explicitly opens it.

## Andrei Ivanovich. Artificial intelligence.

The name refers to Andrei Ivanovich Stolz, the rational and active counterpoint
to Oblomov in Ivan Goncharov's novel. `A.I.` carries both meanings: the
character's initials and artificial intelligence.

## What stays under control

- **Five focused skills.** One concern at a time, not a catch-all prompt.
- **Verified reuse.** Reuse requires matching, fresh identities and prior
  verification.
- **Safe fallbacks.** A missing capability never weakens the required outcome
  or checks.

## One task. One route. Verified.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/route-flow-dark.svg">
  <img src="assets/route-flow.svg" width="360" alt="A task is routed through one focused concern, verified, and delivered as a reliable outcome.">
</picture>

`stolz-route` chooses one focused concern—context, reuse, quiet state, or
benchmarking. Every route keeps the required verification before the outcome.

## The five core skills

### `stolz-route` — choose a route

Use it when an optimization route is needed. It selects the smallest sufficient
route and preserves the safe fallback.

### `stolz-context` — validate context before reading

Use it when a route manifest must be validated before reads. It loads immutable,
route-required context and records identities.

### `stolz-reuse` — reuse verified results only

Use it when a read, command, tool call, or result may repeat. It reuses only
verified, identity-matched results; otherwise it runs and verifies once.

### `stolz-quiet-state` — report meaningful changes

Use it while polling, retrying, following cursors, or handling an asynchronous
handoff. It surfaces material transitions only, keeping unchanged state out of
model narration.

### `stolz-benchmark` — compare equivalent routes

Use it to evaluate a proposed efficiency improvement. It accepts a comparison
only after equivalent outcome and verification gates pass.

## Quick start

Clone a tagged or reviewed revision, then validate it before copying the skill
you need into your agent runtime's skills directory.

```bash
git clone https://github.com/Sergey360/stolz-ai.git
cd stolz-ai
npm ci
npm test

# Example: install the routing skill into a runtime-managed skills directory.
mkdir -p /path/to/agent-skills
cp -R skills/stolz-route /path/to/agent-skills/stolz-route
```

The documented validation surface is deliberately small:

```bash
npm test
npm run build
```

### Optional local Codex state

For one explicit, workspace-local path, an application can connect bounded
context fragments, verified reuse, and quiet state. It has no provider client,
background timer, or automatic model invocation. The caller supplies the
identities, policy, verification, and each snapshot; a miss or unavailable
component selects the normal verified route.

```js
import { openCodexLocalState } from 'stolz-ai/codex-local-state';

const state = openCodexLocalState({
  enabled: true,
  workspace: '/absolute/path/to/workspace',
  max_storage_bytes: 8 * 1024 * 1024,
});
await state.initialize();
```

Read [Installation and compatibility](docs/installation.md#optional-local-codex-state)
before integrating it. The state directory is local to the selected workspace;
it stores private evidence locally and returns compact identities rather than
raw logs or prompts.

For deterministic profile selection, dry-run/install commands, lazy-loading
rules, and removal, read [Installation and compatibility](docs/installation.md).

## Compatibility without overclaiming

The core skills are provider-neutral, but portability is not certification.
The same five skills can be selected for Codex, Claude Code, and Qwen Code;
profile resolution, adapter availability, runtime evidence, and provider
evidence are separate claims.

STOLZ v0.7 contains exact-version C2 sanitized runtime-telemetry evidence for
Claude Code 2.1.251 and Qwen Code 0.22.3. It does not transfer to a newer
runtime version. Codex CLI 0.153.4 was exercised in four installed-local runs
on the v0.7 release contour, but Codex has no v0.7 C2 row. C3 pair admission is
implemented fail-closed; every current provider pair remains withheld because
no complete comparable provider-export pair has been admitted.

Read the [exact capability matrix](docs/architecture.md#exact-capability-matrix)
before describing support. A missing or insufficient capability must select a
safe fallback; it must never lower the required outcome or verification.

## Evidence boundary

STOLZ A.I. documents mechanisms that can reduce waste, not a numerical saving
claim. A published token-saving statement needs reproducible paired
baseline/optimized evidence on the same versioned fixture, equivalent required
outcomes, and passing verification for both routes. A lower-token run with a
weaker outcome or failed verification is rejected—not counted as a saving.

The [benchmarking guide](docs/benchmarking.md) separates `fixture_only`,
`runtime_measured`, and provider-native evidence. It also records the mixed
historical v0.4.1 result: one scoped scenario used fewer recorded tokens on the
STOLZ route, while two used more. None of those reports proves a general v0.7.1
saving. See `skills/stolz-benchmark/` for the admission rules.

## Documentation

- [Installation and compatibility](docs/installation.md)
- [Architecture and exact capability matrix](docs/architecture.md)
- [Benchmarking and evidence interpretation](docs/benchmarking.md)
- [Русский README](README.ru.md)
- [Nederlands README](README.nl.md)
- [中文 README](README.zh.md)
- [עברית README](README.he.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Release notes](CHANGELOG.md)
- [License](LICENSE) and [project notice](NOTICE)

## Contributing

```bash
npm test
npm run build
npm run benchmark:check
```

Read [Contributing](CONTRIBUTING.md) before opening a change. License and legal
notices are in [LICENSE](LICENSE) and [NOTICE](NOTICE).

<p align="center">
  <sub>Created by <a href="https://github.com/Sergey360">Sergey360</a> · movement without the unnecessary</sub>
</p>
