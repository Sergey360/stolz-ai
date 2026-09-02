# Installation

STOLZ A.I. ships as five standalone skill directories. Codex can load them from a project or user skills directory; no runtime package or provider credential is required.

## Requirements

- Git;
- Node.js 20 or newer for the repository tests and benchmark;
- Codex desktop, CLI, or IDE extension with local skills support.

## Verify the checkout

Keep the STOLZ A.I. checkout next to the project where you want to use it:

```bash
git clone https://github.com/Sergey360/stolz-ai.git ../stolz-ai
npm --prefix ../stolz-ai ci
npm --prefix ../stolz-ai test
```

`npm ci` installs test tooling only. The skills themselves have no runtime dependency and do not ask for provider credentials.

## Install for one repository

Codex scans `.agents/skills` between the current directory and the repository root. Repository scope is the recommended default because the installed skills travel with the project and remain reviewable.

### macOS and Linux

Run from the target project:

```bash
mkdir -p .agents/skills
cp -R ../stolz-ai/skills/stolz-* .agents/skills/
```

### Windows PowerShell

Run from the target project:

```powershell
$source = (Resolve-Path '..\stolz-ai\skills').Path
$destination = Join-Path (Get-Location) '.agents\skills'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Get-ChildItem -LiteralPath $source -Directory -Filter 'stolz-*' |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse }
```

The result should contain five files at paths like `.agents/skills/stolz-route/SKILL.md`.

## Install for the current user

Codex also scans `$HOME/.agents/skills`. Copy the same five `stolz-*` directories there when you want them available in every repository. Prefer repository scope when a team should review or pin the exact skill revision.

## Use a skill

Start with `$stolz-route` when the route is unclear:

```text
$stolz-route choose the smallest sufficient route for this task, then keep all required verification.
```

You can also invoke a focused skill directly, for example `$stolz-context`. Codex may select one implicitly when the request matches the skill description.

## Update or remove

To update, pull a reviewed STOLZ A.I. revision and replace the five installed `stolz-*` directories. To remove the suite, delete only those five directories. Restart Codex if a changed skill does not appear immediately.

STOLZ A.I. is built and documented for Codex. The skill format may be readable by other agents, but this repository makes no compatibility promise for them.
