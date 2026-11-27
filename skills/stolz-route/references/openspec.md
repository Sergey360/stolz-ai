# Set up OpenSpec for a project

Use the project and coding tool agreed with the user. Resolve an ambiguous
target before writing, especially in a workspace containing several repositories.
Existing project instructions, a local `openspec/` directory, or a linked spec
store may already define the workflow. Use its established root and preserve
active changes. An unresolved store link needs repair before starting a local
spec tree. Resume ongoing project work without checking for CLI updates on
each task.

## Install the latest stable CLI

For an existing installation, run `openspec version --check --json`. A current
result settles the version question. For an available update, use the method
that owns this copy. A standalone installation updates with `openspec install`,
a global npm installation with `npm install -g @fission-ai/openspec@latest`,
and Homebrew with `brew upgrade openspec`. Respect the requested major version,
the project's package manager and any version pin. If latest conflicts with
one of those constraints, settle the target version before upgrading.
With an older CLI lacking the version report, identify
the installation from the executable or package manager. If the release lookup
fails, report the installed version and leave latest-version status open.

For a fresh install, use the official standalone installer for the host. On
Windows PowerShell the command is `irm https://openspec.dev/cli/install.ps1 | iex`.
On macOS or Linux use `curl -fsSL https://openspec.dev/cli/install.sh | sh`.
The standalone binary includes its runtime. When npm is preferred, read the
current Node requirement with `npm view @fission-ai/openspec@latest engines.node`
and use the npm install command above with a compatible Node. After installation
or an upgrade, run `openspec --version` through the project's actual executable
or PATH. [OpenSpec installation](https://openspec.dev/docs/installation)

## Configure the selected project

- **New project setup.** Run `openspec init --scope project --tools codex`
  from the project root for a repository-scoped Codex setup. Substitute the
  selected tool IDs for another host (e.g. `claude` or `qwen`). Use
  `--scope global` only for a requested machine-wide skills setup. OpenSpec
  2.0 used project scope by default and had no scope flag. For a project
  pinned to 2.0, use `openspec init --tools codex`. Current releases default
  to global skills when the scope is omitted. Scope selects where skills
  live. The CLI can also keep per-user settings. For routine setup, rely on
  the documented flag and the CLI's result. Reading the installer source or
  hashing the workspace adds work without answering a project setup question.
- **Existing setup.** When a refresh is requested, use
  `openspec update --dry-run` to see which generated files would change.
  If current, continue. For a pending refresh, preserve edits inside affected
  generated directories before running `openspec update` in the existing scope.
  For a newly requested tool, use init with its tool ID in the same scope.
  Legacy migration can remove edited marker blocks even with just `--tools`.
  Keep custom guidance and specs, and resolve any proposed loss before applying
  it. [OpenSpec project setup](https://openspec.dev/docs/setup)
- **Handoff.** Use the setup output to report the project, scope, configured
  tools and actual invocation. For example, the 2.2 Codex router accepts
  `$openspec`, and `$openspec-propose` starts a change. If implementation was
  requested, continue with its existing change or propose the agreed feature.
  Setup alone needs no dummy proposal, validation of empty specs, or new CI job.
