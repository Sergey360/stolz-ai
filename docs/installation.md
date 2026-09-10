# Installation and compatibility

STOLZ A.I. v0.9.0 is a package of five focused skill directories. Installing
it makes the skills available to an agent runtime; it does not start a service,
instrument a provider, or install the private context-state and verified-reuse
implementations used to develop the project. Those boundaries are described in
[Architecture and exact capability matrix](architecture.md).

## Requirements

The v0.9 release is verified with Node.js 22.22.2 and npm 10.9.7 on Windows
and Linux. Claude Code 2.1.251 and Qwen Code 0.22.3 retain their exact
profile evidence boundaries; other runtime versions are usable only through
the documented fallback until rechecked.
The CI image is also pinned to Node.js 22.22.2. Git is needed when installing
from a source checkout. A runtime-specific skills directory must already be
configured or selected by the user; the installer does not discover it.

No provider credential is required by `resolve`, `install --dry-run`, the
repository tests, or the static build. STOLZ does not configure a provider,
model, account, hook, MCP server, or GitLab credential.

## Verify the release artifact

Download `stolz-ai-0.9.0.tgz` and its `.sha256` file from the release, then
verify the checksum with the tool available on your operating system. Extract
the archive before running the included profile CLI:

```bash
tar -xzf stolz-ai-0.9.0.tgz
cd package
node -p "require('./package.json').version"
```

The final command must print `0.9.0`. The release inventory and checksum prove
the bytes that were published; they do not prove runtime compatibility or
token savings.

## Resolve a profile before installing

Every supported profile installs the same five skills. The runtime choice only
selects the declared profile and lazy adapter boundary.

```bash
node tools/profile-cli.mjs resolve --runtime codex
node tools/profile-cli.mjs resolve --runtime claude-code
node tools/profile-cli.mjs resolve --runtime qwen-code
```

Use an absolute destination that your runtime is configured to read. Review a
dry run first:

```bash
node tools/profile-cli.mjs install --runtime codex --destination /absolute/path/to/skills --dry-run
node tools/profile-cli.mjs install --runtime claude-code --destination /absolute/project/.claude/skills --dry-run
node tools/profile-cli.mjs install --runtime qwen-code --destination /absolute/project/.qwen/skills --dry-run
```

`--dry-run` prints a deterministic installation plan and creates no directory
or file. Remove only that flag to copy the five skill directories and write
`install-manifest.json` to the selected destination:

```bash
node tools/profile-cli.mjs install --runtime claude-code --destination /absolute/project/.claude/skills
```

The profile declarations for Claude Code and Qwen Code use project destinations
`.claude/skills/` and `.qwen/skills/`. Codex installations must use the skills
directory configured by the Codex environment; v0.9.0 does not guess a global
path.

## What installation proves

Keep these statements separate:

| Observation | What it proves | What it does not prove |
| --- | --- | --- |
| Five skill directories were copied | The selected package files are present | The runtime discovered or executed them |
| A profile resolved | A checked-in profile matches the requested runtime ID | The installed runtime has the certified version |
| A lazy adapter is declared | The selected profile may resolve that adapter after its trigger | The adapter is loaded globally or a provider is configured |
| C2 evidence is certified | Sanitized runtime telemetry passed for one exact runtime/adapter tuple | Provider billing, provider-native tokens, another version, or C3 |
| C3 admission is available | Comparable provider-export pairs can be checked fail-closed | Any current provider pair is certified |

The exact current rows and their sources are in the
[capability matrix](architecture.md#exact-capability-matrix).

The declared `minimal`, `evaluation`, and `maintainer` profiles remain lazy
and provider-neutral. The optional GitLab declaration is private authorized
access metadata only. Never infer a provider token result or invent token data
from this installation record.

## Minimal manual installation

When the required concern is already known, copy only that skill directory,
including its `references/` directory:

```bash
mkdir -p /absolute/path/to/skills
cp -R skills/stolz-context /absolute/path/to/skills/stolz-context
test -f /absolute/path/to/skills/stolz-context/SKILL.md
test -d /absolute/path/to/skills/stolz-context/references
```

The five installable skills are `stolz-route`, `stolz-context`, `stolz-reuse`,
`stolz-quiet-state`, and `stolz-benchmark`. Copying a `SKILL.md` without its
routed references is incomplete.

## Lifecycle commands in v0.9.0

Every managed installation writes `install-manifest.json`. Version 4 records
the package version, selected runtime and scope (`project` or `user`), and the
SHA-256/byte identity of each copied STOLZ file. Files not in that list are not
owned by STOLZ.

```bash
# Inspect before changing anything. Doctor does not make provider or model calls.
node tools/profile-cli.mjs status --runtime claude-code --destination /absolute/project/.claude/skills
node tools/profile-cli.mjs doctor --runtime claude-code --runtime-version 2.1.251 --destination /absolute/project/.claude/skills

# Show the exact future update/rollback/removal plan, then opt in to apply it.
node tools/profile-cli.mjs update --runtime claude-code --destination /absolute/project/.claude/skills
node tools/profile-cli.mjs update --apply --runtime claude-code --destination /absolute/project/.claude/skills
node tools/profile-cli.mjs rollback --dry-run --destination /absolute/project/.claude/skills
node tools/profile-cli.mjs uninstall --dry-run --destination /absolute/project/.claude/skills
```

`update` stops before writing if an owned file is missing or locally changed.
On apply it snapshots only prior STOLZ-owned files and restores them if a copy
fails. `rollback` also refuses to overwrite a locally changed owned file.
`uninstall --apply` removes only manifest-listed files and its current STOLZ
rollback snapshot; an unrelated skill beside them remains untouched. Repeating
an already-complete uninstall is a no-op.

To adopt an existing v0.7.1 installation, first inspect it, then explicitly
identify its version. Migration fails closed unless every expected skill file
still has the matching hash:

```bash
node tools/profile-cli.mjs migrate --apply --legacy-version 0.7.1 --runtime qwen-code --destination /absolute/project/.qwen/skills
```

## Recheck rules

- Claude Code C2 evidence applies only to Claude Code 2.1.251 with adapter
  `claude-code` 1.0.0.
- Qwen Code C2 evidence applies only to Qwen Code 0.22.3 with adapter
  `qwen-code` 1.0.0.
- A runtime, adapter, schema, or evidence-expiry change makes the old tuple
  stale. It must enter `recheck_required` and receive fresh exact-tuple evidence
  before it can be certified again.
- An unknown runtime or version may still use the five provider-neutral skills
if its host can load them, but v0.9.0 makes no runtime-certification promise
  for that environment.
- A missing or insufficient capability requires the normal verified route. It
  never permits a weaker outcome or skipped check.

See [Benchmarking and evidence interpretation](benchmarking.md) before
describing any measured result.

## Optional local Codex state

Version 0.9.0 adds one explicit Node API for a local Codex workspace. It is
not installed into a skill directory, does not alter profile lifecycle files,
and does not begin polling. Call it only where the application owns the
workspace and can provide complete input identities and verification records.

```js
import { openCodexLocalState } from 'stolz-ai/codex-local-state';

const state = openCodexLocalState({
  enabled: true,
  workspace: '/absolute/path/to/workspace',
  // Default: 8 MiB. A full budget is enforced before local evidence writes.
  max_storage_bytes: 8 * 1024 * 1024,
});

await state.initialize();
```

The default state directory is `.stolz-local-state-v1` in that workspace. Use
`state_directory` only for an explicitly chosen directory within the same
workspace. The API has no network, provider, daemon, timer, or model-call
behavior. `recordContext` accepts one predeclared bounded range;
`lookupReuse` and `recordReuse` require the full deterministic policy and
verification gate; `observeQuietState` accepts one snapshot. A changed input,
expired record, invalidation, damaged state, denied policy, or full budget
returns the normal verified-route fallback.

The directory can contain private local evidence. Do not commit or copy it to
a package, an artifact upload, or another workspace. `recover()` removes
abandoned temporary data and rechecks durable stores; it never turns a corrupt
record into a reuse hit. `overhead()` reports the current local storage use and
configured budget. It reports no token, cost, or saving estimate.
