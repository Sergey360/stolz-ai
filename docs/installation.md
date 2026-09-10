# Installation

STOLZ A.I. v0.7.1 installs five provider-neutral skill directories. It can
resolve a runtime profile and copy those skills to a destination you select.
It does not start a service, discover credentials, create a shared cache,
persist runtime state, or run an automatic polling controller.

## Requirements

The release was verified with Node.js 22.22.2 and npm 10.9.7. The package has
no runtime dependencies. Git is needed only when installing from a checkout.

Use the immutable `stolz-ai-0.7.1.tgz` asset from the v0.7.1 release when exact
release identity matters. Verify its published SHA-256 before extracting it.

```bash
tar -xzf stolz-ai-0.7.1.tgz
cd package
node -p "require('./package.json').version"
```

The last command must print `0.7.1`.

## Resolve a profile

Runtime selection and provider selection are separate. Resolving a profile
does not call a provider or infer a model.

```bash
node tools/profile-cli.mjs resolve --runtime codex
node tools/profile-cli.mjs resolve --runtime claude-code
node tools/profile-cli.mjs resolve --runtime qwen-code
```

Each supported profile selects the same five skills and one lazy adapter. The
adapter remains inactive until the host uses it.

## Preview an installation

Always choose the destination explicitly. The installer validates the
runtime-specific path but does not discover it for you.

```bash
node tools/profile-cli.mjs install --runtime codex --destination /absolute/path/to/skills --dry-run
node tools/profile-cli.mjs install --runtime claude-code --destination /absolute/project/.claude/skills --dry-run
node tools/profile-cli.mjs install --runtime qwen-code --destination /absolute/project/.qwen/skills --dry-run
```

Remove `--dry-run` only after reviewing the reported profile, adapter,
destination, five skill names, and install manifest.

```bash
node tools/profile-cli.mjs install --runtime claude-code --destination /absolute/project/.claude/skills
```

For Claude Code and Qwen Code, project destinations end in `.claude/skills/`
and `.qwen/skills/`. For Codex, use the skills directory configured by your
Codex environment; v0.7.1 does not guess a user-wide location.

## Manual Codex copy

From a reviewed checkout, a repository-local Codex installation can be made
without the profile installer:

```bash
mkdir -p /absolute/path/to/skills
cp -R skills/stolz-* /absolute/path/to/skills/
test -f /absolute/path/to/skills/stolz-route/SKILL.md
```

The installed set must be exactly:

- `stolz-route`
- `stolz-context`
- `stolz-reuse`
- `stolz-quiet-state`
- `stolz-benchmark`

Keep each skill's `references/` directory with its `SKILL.md`.

## What the installer manages

The public CLI supports only `resolve` and `install`. It does not implement
status, doctor, update, uninstall, rollback, hooks, MCP configuration, daemon
management, shared cache management, or durable state management.

To update, resolve and dry-run the new immutable version, then replace only the
five STOLZ directories at the selected destination. To remove the suite,
delete only those five directories and the STOLZ install manifest after
checking that no unrelated skills share the destination.

## Evidence boundary

- Claude Code C2 evidence applies only to runtime 2.1.251 with adapter 1.0.0.
- Qwen Code C2 evidence applies only to runtime 0.22.3 with adapter 1.0.0.
- Codex CLI 0.153.4 has verified installed-local executions but no v0.7 C2
  evidence row.
- Every current C3 provider pair remains withheld.

Installation proves only that the selected files were resolved and copied. It
does not extend certification to another version, model, provider, or task.
