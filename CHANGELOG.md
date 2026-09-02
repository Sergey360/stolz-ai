# Changelog

All notable changes to STOLZ A.I. are recorded here. Releases follow the
repository's immutable-tag policy; unpublished work is not a release.

## [0.4.1] - 2026-09-02

### Fixed

- Added `benchmark:v3 --verify-report <path> --check` so the installable
  package can verify its sanitized benchmark-v3 reports without loading the
  intentionally excluded private pilot corpus or adding runtime dependencies.
- Added extracted-package regression coverage for that exact command.

Private `v0.4.0` failed product smoke because the packaged CLI eagerly loaded
the excluded pilot runner. Its tag, pipeline, package, and Release remain
immutable private failure evidence; it was never published on public GitHub.
Version `0.4.1` is the separately versioned correction.

## [0.4.0] - 2026-09-02

### Added

- Added Evidence Loop benchmark v3 with closed schemas, fail-closed admission,
  isolated scenario manifests, deterministic oracles, and sanitized reports.
- Added provider-neutral runtime measurement adapters for Codex, Claude Code,
  and Qwen Code while keeping provider-native usage and runtime telemetry as
  separate evidence tracks.
- Added a real authenticated Codex CLI cohort: 30 minimized attempts and 15
  admitted equal-outcome, equal-verification pairs across reads/navigation,
  build/check invalidation, and quiet/wait transition scenarios.

### Evidence boundary

The signed `baseline - STOLZ` token deltas are `+2,867` for reads/navigation,
`-2,880` for build/check invalidation, and `-1,330` for quiet/wait transition;
the combined delta is `-1,343`. This mixed result does not support an
aggregate token-saving claim. Provider price, tier, and cost remain unknown,
and no public percentage or provider-wide efficiency claim is made.

The installable product still contains exactly five skills, has no runtime
dependencies, and preserves the v0.3.4 compatibility and privacy boundaries.
The private GitLab release, smoke, hypercare, and rollback gates precede any
publication of the same immutable release on public GitHub.

The private `v0.4.0` release subsequently failed extracted-package
benchmark-v3 CLI smoke and is retained as non-public failure evidence. Use
`v0.4.1` or later.

## [0.3.4] - public GitHub distribution

This distribution-only patch selects
[`Sergey360/stolz-ai`](https://github.com/Sergey360/stolz-ai) as the public
repository, updates package metadata and installation links, adds read-only
GitHub Actions validation, and records the public-release procedure. It does
not change skills, adapters, profiles, schemas, provider overlays, benchmarks,
or certification evidence.

The capability boundary remains: **C0/C1 supported; C2/C3
withheld/unavailable.** GitHub publication does not add provider calls,
provider-native telemetry, billing evidence, or a numerical token-saving
claim. The private IT360 GitLab remains the development and release-control
source; its visibility and historical tags/releases are unchanged.

## [0.3.3] - extracted-package smoke recovery (candidate)

This separately gated private GitLab patch corrects the package allow-list
defect recorded in incident #188 and approved in scope gate #189. It adds only
the four retained, non-secret Claude/Qwen provenance JSON files referenced by
the packaged profiles and the six declarative provider-overlay JSON records.
It also runs profile resolution, profile installation, selected-overlay
resolution, and all three adapter conformance checks from a freshly extracted
npm archive. No provider call, credential lookup, capability change, runtime
version change, benchmark claim, visibility change, or GitHub action is part
of this patch.

The mandatory boundary remains: **C0/C1 supported; C2/C3
withheld/unavailable.** Publication and production remain **NO-GO** until the
exact-SHA feature/dev/main checks and separate protected-main and production
manual gates pass, followed by authenticated product smoke, anonymous-denial,
hypercare, and ops evidence.

## [0.3.2] - published private archive; product smoke failed

This private GitLab patch preserved the complete 0.3 runtime and
provider capability surface while making package identity reproducible across
Windows and Linux checkouts. Its mandatory boundary remains: **C0/C1
supported; C2/C3 withheld/unavailable.**

The protected `v0.3.0` and `v0.3.1` tags are immutable failed-unpublished
audit evidence. Pipeline 6296 failed before any 0.3.0 publication. Pipeline
6314 reached its manual evidence gate for 0.3.1, where exact-tag Linux
verification exposed the CRLF/LF package-identity mismatch recorded in #182;
the manual job was not played and no 0.3.1 package or Release was created.

### Changed

- Bumped package metadata to 0.3.2 under the operator-approved scope gate
  #183; no runtime, adapter, profile, provider, benchmark, or support claim
  changed.
- Added a repository-wide LF checkout contract with explicit binary
  exclusions and a package-contract test that requires every packed text path
  to resolve to `eol: lf`.
- Required canonical pre-tag Linux evidence from committed Git objects before
  protected-main and production gates can approve this successor.

Protected tag `v0.3.2`, tag pipeline 6326, the private Generic Package, and the
private GitLab Release were created at main commit
`58b20b089cc83b84e69efbbc3248e34c2eade332`. Download, checksum, 98-file
inventory, conformance, and anonymous-denial checks passed, but the extracted
archive could not admit the retained Claude/Qwen profiles because their
referenced provenance files and overlays were absent. Production acceptance
therefore failed closed. The tag, package, checksum, Release, and pipeline are
immutable smoke-failed evidence and are not changed or deleted; v0.3.3 is the
separately versioned correction. GitLab remains private and GitHub remains
excluded.

## [0.3.1] - protected tag; publication aborted

This private GitLab patch candidate carries the same multi-runtime capability
surface as 0.3.0 and makes the manual tag `release-evidence` job
self-contained with an exact lockfile install before tests. Its mandatory
capability boundary remains: **C0/C1 supported; C2/C3 withheld/unavailable.**

The protected `v0.3.0` tag is preserved at commit
`c205d2f392e19ff0ba6e6dd4c4a322b082419d59` with failed tag pipeline 6296 as
immutable audit evidence. No 0.3.0 Generic Package or GitLab Release was
published. Never move, delete, or recreate that tag; the correction is this
separately versioned 0.3.1 candidate.

The protected `v0.3.1` tag later reached pipeline 6314, whose automatic
validate/build jobs passed. Before its manual evidence job ran, canonical
Linux packing exposed the platform-dependent candidate byte identity recorded
in incident #182. The manual job was not played and no Generic Package or
GitLab Release was published. The tag and pipeline remain immutable evidence;
the correction is the separately versioned 0.3.2 candidate.

Publication and production remain **NO-GO** until the exact `dev` and `main`
pipelines, protected-main promotion gate, and separate production gate pass.
GitLab remains private, GitHub remains excluded, and no provider call or
credential inspection is part of this patch.

### Changed

- Bumped package metadata from 0.3.0 to 0.3.1 for the immutable successor
  release path.
- Added `npm ci --ignore-scripts` inside the manual `release-evidence` job so
  it does not depend on runner workspace reuse or a previous job's
  `node_modules` directory.
- Retained the exact Claude Code 2.1.251 and Qwen Code 0.22.3 C0/C1
  certification, provider overlays, benchmarks, five-skill install inventory,
  dev-only AJV 8.20.0 pin, and all fail-closed admission boundaries unchanged.

## [0.3.0] - protected tag; publication aborted

The protected `v0.3.0` tag was created at exact main commit
`c205d2f392e19ff0ba6e6dd4c4a322b082419d59`, but tag pipeline 6296 failed in
the manual evidence job before publication because that job did not install
its lockfile dependencies. The tag and failed pipeline are immutable audit
evidence. No GitLab Release, Generic Package, provider call, production smoke,
or hypercare was created for 0.3.0. Its capability boundary was and remains:
**C0/C1 supported; C2/C3 withheld/unavailable.**

### Added

- Reproducible C0 fixtures and exact C1 CLI certification for Claude Code
  2.1.251 and Qwen Code 0.22.3, with selected-only lazy adapters and isolated
  minimal, evaluation, and maintainer profile installs.
- Six closed provider-overlay records for Anthropic, Alibaba Cloud Model
  Studio, and Z.ai. They retain declarative protocol and external
  secret-reference metadata only; they are not runtime, provider-call, or
  live-provider evidence.
- Closed C2 runtime-telemetry and C3 provider-export admission contracts with
  exact terminal `withheld`/`unavailable` records, 300 Draft 2020-12 terminal
  mutations, and 13 semantic live-C3 regression cases that fail closed.

### Security and dependency maintenance

- Updated the exact, development-only AJV pin from 8.17.1 to 8.20.0 to close
  the reviewed advisory. `$data` remains disabled, runtime dependencies remain
  empty, and no lifecycle or publish script was added.
- Retained recursive secret rejection, privacy-safe evidence allowlists,
  distinct runtime/provider evidence classes, and outcome/verification gates.

### Compatibility and evidence boundary

- The same five provider-neutral skills remain installed for Codex, Claude
  Code, and Qwen Code; only the selected runtime adapter is declared lazy.
- Benchmark v1 remains `fixture_only`. Benchmark v2 retains ten deterministic
  fixture records and all admission gates; no provider-token-saving,
  provider-wide, or live-provider certification claim is made.
- Protected private GitLab `v0.1.0` and `v0.2.0` tags/packages and their
  benchmark evidence remain immutable. The project stays private with
  `public_jobs=false`, anonymous access denied, and GitHub publication or
  mirroring excluded from this package.

## [0.2.0] - release candidate (unpublished)

This is a private GitLab release candidate, not a published release. No
`v0.2.0` tag, GitLab Release, package publication, `main` promotion,
deployment, production smoke, or hypercare is created or claimed by this
entry. Publication remains subject to the manual gates in
[`docs/RELEASE_READINESS_V0.2.md`](docs/RELEASE_READINESS_V0.2.md).

### Added

- Versioned minimal, evaluation, and maintainer runtime profiles that keep the
  five provider-neutral core skills separate from provider, model, runtime,
  adapter, and optional-integration selections.
- A lazy, trigger-scoped `codex-local` adapter and conformance kit. It is the
  only certified v0.2 adapter; the portable core remains usable through its
  safe provider-neutral fallback.
- Trigger-scoped filesystem, GitLab, and benchmark-capture integration
  descriptors that fail closed when absent, denied, malformed, or unavailable.
- Benchmark v2 fixture evidence, provenance identities, five-repetition
  statistics, sanitization and admission gates. The checked-in result is
  `fixture_only`; provider-token saving remains withheld without matching
  primary provider telemetry.

### Compatibility and migration

- Existing users can install from a clean checkout with `npm ci`; the package
  remains dependency-free and introduces no lifecycle script or publish hook.
- Claude Code is not supported or certified. Qwen/Alibaba Cloud and Z.ai
  provider/runtime evidence remains experimental or unavailable, rather than
  being inferred from the provider-neutral core.
- The immutable private GitLab `v0.1.0` tag, package, checksum, and benchmark
  v1 evidence remain unchanged. GitHub publication is excluded from this
  change package.

### Release readiness

- The candidate records a prospective `stolz-ai-0.2.0.tgz` file inventory,
  deterministic checksum procedure, private-access verification, controlled
  rollback path, and manual production-promotion gates in
  [`docs/RELEASE_READINESS_V0.2.md`](docs/RELEASE_READINESS_V0.2.md).

## [0.1.0] - 2026-08-28

### Added

- English-first README, installation and compatibility guidance, and Russian
  overview.
- MIT license, project notice, contribution guidance, security policy, and a
  release-note template.
- Deterministic validation of public documents, local links, package metadata,
  and packed package contents.
- A SHA-pinned, outcome-gated benchmark harness with versioned fixtures,
  paired routes, raw evidence, negative-gate tests, and a reproducible
  fixture-scoped report.

### Release delivery

- Access-controlled internal GitLab Release, immutable tag, packaged archive,
  SHA-256 checksum, tag-pipeline evidence, and Kiwi qualification for the
  first release. The GitLab project remains private by policy.
- A documented recovery rule: never move or overwrite a published tag;
  correct defects with a linked patch release.

### Evidence boundary

- The accepted example report is limited to its deterministic fixture token
  source. It is not provider billing telemetry or a provider-wide numerical
  claim.
- The public GitHub mirror is an operator-accepted manual follow-up and is not
  part of the internal `v0.1.0` delivery evidence.

## Release format

Use [docs/RELEASE_NOTES_TEMPLATE.md](docs/RELEASE_NOTES_TEMPLATE.md) for later
releases. The `v0.1.0` record is
[docs/RELEASE_NOTES_v0.1.0.md](docs/RELEASE_NOTES_v0.1.0.md).
