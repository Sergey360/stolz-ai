# Installation and Compatibility

This guide installs STOLZ A.I. from a reviewed source checkout. It is
English-first because the skill entrypoints and package metadata are English.
For a Russian overview, see [README.ru.md](README.ru.md).

STOLZ A.I. is a library of skill directories, not a hosted service and not a
global agent instruction. Install only the skill needed for the current task.

## Prerequisites

- Git, Node.js 22 or a compatible current Node.js runtime, and npm for the
  repository validation commands.
- An AI coding-agent runtime with a directory for local skills or an
  equivalent mechanism for exposing a skill directory.
- Write access to that runtime-managed skills directory.

No provider credential is stored in this repository or required for its local
test/build commands.

## Verify a source checkout

Use a tag or commit selected by your release process. Before installing, run
the same checks used by the repository's validation pipeline:

```bash
git clone <repository-url> stolz-ai
cd stolz-ai
npm install
npm test
npm run build
```

These commands validate the schemas, adapter behavior, skills, public
documentation, and static build. `npm install` currently makes no dependency
changes because this package has no runtime dependencies.

## Select a profile and install deterministically

The profile resolver chooses the smallest compatible declared profile; it
never discovers an adapter or integration globally. All profiles install the
same five core skills. Their difference is which optional integrations may be
resolved later after an exact trigger:

| Need | Selected profile | Command |
| --- | --- | --- |
| Core skills only | `minimal` | `node tools/profile-cli.mjs install --runtime codex --destination /absolute/path --dry-run` |
| Benchmark raw-evidence capture | `evaluation` | `node tools/profile-cli.mjs install --runtime codex --integration benchmark-capture --destination /absolute/path --dry-run` |
| Approved repository maintenance | `maintainer` | `node tools/profile-cli.mjs install --runtime codex --integration filesystem --integration gitlab --destination /absolute/path --dry-run` |

The commands print a deterministic JSON resolution and install plan. With
`--dry-run`, no destination directory or files are created. Remove only
`--dry-run` after reviewing the JSON to perform that exact selected-only
install. Use an absolute destination outside this checkout; a real install
copies the five `skills/` directories and writes `install-manifest.json`.

A minimal Codex install contains no GitLab integration, no benchmark-capture
integration, and no adapter implementation files. `codex-local` remains a lazy
manifest declaration. It resolves at most once only after the selected route
requires one of its declared capabilities. Optional integrations resolve only
when both the selected profile declares them and their exact activation trigger
is recorded. No trigger means no load.

The GitLab integration is metadata for **private authorized access** only. It
does not configure credentials, a hostname, a project, a network action, or
anonymous/public repository access.

## Install one skill manually

Set `AGENT_SKILLS_DIR` to the local skills directory configured by your agent
runtime, then copy the selected directory intact so its routed references stay
available:

```bash
export AGENT_SKILLS_DIR=/path/to/agent-skills
mkdir -p "$AGENT_SKILLS_DIR"
cp -R skills/stolz-route "$AGENT_SKILLS_DIR/stolz-route"
```

Replace `stolz-route` with one of the skill names below when the concern is
already known. Do not copy only `SKILL.md`; its `references/` directory is part
of the installable package.

| Concern | Install | Trigger |
| --- | --- | --- |
| Route selection | `stolz-route` | Start here when deciding between context, reuse, state, or benchmark work. |
| Context discipline | `stolz-context` | A route manifest or a need to select context before reading. |
| Verified reuse | `stolz-reuse` | A read, command, tool call, or result may be repeated. |
| Quiet state | `stolz-quiet-state` | Polling, retry, cursor, or async-state reporting. |
| Outcome-gated benchmarking | `stolz-benchmark` | Comparing equivalent baseline and optimized routes. |

Check that the installed entrypoint and its reference material are present:

```bash
test -f "$AGENT_SKILLS_DIR/stolz-route/SKILL.md"
test -d "$AGENT_SKILLS_DIR/stolz-route/references"
```

To remove a skill, delete only its named directory from the runtime-managed
skills location. Do not remove the source checkout unless it is no longer
needed for audit or update comparison.

## Compatibility and adapter certification

STOLZ A.I. keeps routing and quality policy provider-neutral. An adapter, when
used, declares which capabilities it can satisfy rather than implying support
for every runtime feature.

| Surface | Provider-neutral core | `codex-local` in v0.2.0 | Required fallback behavior |
| --- | --- | --- | --- |
| Artifact identity | Requires an immutable identity | Certified | Stop safely when an immutable identity is unavailable. |
| Explicit argv command execution | Requires literal argv | Certified | Do not parse or deduplicate shell strings. |
| Durable compact state | Works without an adapter | Certified when required | Use a provider-neutral route if persistent state is unavailable. |
| Authoritative token measurement | Does not infer telemetry | Not supported | Use the provider-neutral benchmark route; do not invent token data. |

The included adapter is documented in [adapters/codex/README.md](../adapters/codex/README.md)
and declares its exact capabilities in
[adapters/codex/capabilities.json](../adapters/codex/capabilities.json). Other
providers may add an adapter only if it conforms to
[contracts/adapter-capability.schema.json](../contracts/adapter-capability.schema.json).
An absent, malformed, or insufficient adapter must retain every outcome and
verification gate through the provider-neutral route. This provider-neutral
compatibility does not certify another runtime: `codex-local` is the only
certified adapter in v0.2.0. Claude Code is not supported or certified.
Qwen/Alibaba Cloud and Z.ai telemetry is experimental or unavailable pending
separately admitted raw evidence; see [Runtime Capability
Matrix](RUNTIME_CAPABILITY_MATRIX.md).

**STOLZ A.I. is an independent project and is not affiliated with or endorsed
by OpenAI. Codex is a trademark of OpenAI.**

## Route behavior and safe fallbacks

1. `stolz-route` selects exactly one narrow concern.
2. The selected skill loads only its route-specific reference material.
3. `stolz-context` validates source identity before reads; a malformed
   manifest or route mismatch stops safely.
4. `stolz-reuse` requires verified, matching, unexpired identities. A miss,
   change, expiry, or failed verification requires a fresh run.
5. Equivalent program-plus-argument-vector operations may share one
   controller; distinct or shell-string operations may not be coalesced.
6. `stolz-quiet-state` reports only material transitions. Failure and human
   decision events include a compact reason and next safe action.
7. `stolz-benchmark` rejects a comparison whenever either route fails its
   required outcome or verification gate.

## Interpreting benchmark evidence

Do not interpret shorter text, fewer tool calls, or a single run as proof of a
token saving. An accepted comparison identifies the fixture and versions,
baseline and optimized route IDs, token count, model wakeups, tool calls, wall
time, interventions, outcome result, verification result, and raw evidence
locations.

A token delta becomes publishable only when the baseline and optimized routes
use the same versioned fixture and both have equivalent required outcomes and
passing verification. Until then, STOLZ A.I. makes no numerical token-saving
claim. See [ADR-0003](adr/0003-outcome-gated-benchmarks.md) for the governing
decision.

The repository includes a reproducible, fixture-scoped example. From a clean
checkout, run:

```bash
npm run benchmark
npm run benchmark:check
```

The generated [context-selection report](../benchmarks/reports/context-selection-v1.md)
links its versioned fixture, paired routes, and raw evidence. Its authored
`synthetic-fixture-token-units-v1` values validate the harness and that fixture
only; they are not measurements from Codex or another provider's telemetry.

For v2, use `npm run benchmark:v2:check` to verify the admission report. The
report labels evidence as `fixture_only`, `runtime_measured`, or
`provider_native`; only the final class can support a provider-token claim,
and only when both routes pass every admission gate.
