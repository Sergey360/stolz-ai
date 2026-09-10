# Changelog

All notable changes to STOLZ A.I. are recorded here. Releases follow the
repository's immutable-tag policy; unpublished work is not a release.

## [0.9.0] - Unreleased

### Added

- Added the explicit, versioned `stolz-ai/codex-local-state` API for one local
  Codex workspace path. It composes bounded context fragments, verified reuse,
  and quiet state only after `enabled: true` opt-in.
- Added durable restart recovery, atomic local writes, file-lock concurrency,
  bounded storage, named invalidation, and normal verified-route fallback for
  unavailable, expired, corrupt, unsafe, or over-budget state.
- Added a v1 public contract, extracted-package dependencies, and tests for
  the opt-in path without a private repository.

### Boundaries

- The package still has exactly five independent skills. Local state is an
  explicit caller-driven module, not a sixth skill, daemon, shared cache,
  automatic polling service, provider call, or model invocation.
- Local artifacts remain private to the chosen workspace. Public projections
  contain bounded identities and metadata, never prompts, raw logs, secrets,
  or user data. No token, cost, saving, pilot, or provider claim is added.

## [0.8.0] - Unreleased

### Added

- Added a lifecycle manifest with package version, install scope, selected
  runtime layout, and SHA-256 identities for every STOLZ-owned installed file.
- Added `status`, `doctor`, dry-run `update`, atomic `update --apply`,
  `rollback`, explicit v0.7.1 migration, and owned-file `uninstall` commands.
- Added Windows-safe documentation-path cleanup: the stale
  `docs/INSTALLATION.md` duplicate is removed in favour of
  `docs/installation.md`.

### Boundaries

- No command infers ownership of an unlisted file, overwrites a locally changed
  file, performs provider/model calls, or removes unrelated runtime files.
- A v0.7 manifest is migrated only when the caller explicitly identifies it as
  v0.7.1 and every owned skill file matches its expected hash.

## [0.7.1] - 2026-09-10

### Changed

- Reconciled the five public READMEs and three allowlisted public documents
  with the shipped v0.7 surface.
- Added an exact capability matrix that separates skill installation, profile
  resolution, adapter availability, exact-version C2 evidence, and C3
  provider-pair admission.
- Added checked examples for minimal context selection and correct refusal of
  unsafe result reuse.
- Documented the historical mixed v0.4.1 measurements and distinguished
  `fixture_only`, `runtime_measured`, and provider-native evidence.
- Bumped package and CI release evidence to 0.7.1 while preserving the
  147-file public package inventory and all fail-closed privacy gates.

### Compatibility boundary

Claude Code C2 evidence remains limited to version 2.1.251 with adapter 1.0.0;
Qwen Code C2 evidence remains limited to version 0.22.3 with adapter 1.0.0.
Codex CLI 0.153.4 has verified installed-local v0.7 executions but no v0.7 C2
row. Every current C3 provider pair remains withheld. The public package still
contains five skills, two exports, no runtime dependencies, and no executable
private context-state or verified-reuse implementation.

## [0.7.0] - 2026-09-09

### Added

- Added fail-closed v0.7 multi-runtime evidence contracts for exact-version
  Claude Code/Qwen Code C2 telemetry, structurally separate provider overlays,
  paired C3 provider-export admission, deterministic certification lifecycle,
  and sanitized-only retention.

This source-contract entry is not a runtime/provider certification, provider
call, benchmark result, release, package publication, or public claim.

## [0.6.0] - release candidate

### Added

- Added bounded delta-context and durable read-fragment contracts with exact
  Git object, byte-range, content, policy, schema, tool, expiry, and
  invalidation identities.
- Added the durable quiet external-state controller and deterministic
  runtime/profile-first routing with zero-model quiet polls, bounded wake
  rules, complete-overhead economic admission, and fail-closed fallback.
- Added separated provider-native/runtime-measured evidence admission plus the
  six-scenario Context and State corpus, net metrics, public curation, privacy,
  and npm-package gates.

### Compatibility and release boundary

The public product remains exactly five skills with the same two package
exports and no runtime dependencies. Internal v0.6 schemas and implementation
helpers remain excluded from the npm payload until a separately reviewed
public API is approved. Scenario evidence is bounded verification evidence;
aggregate, percentage, cost, provider-wide, cross-scenario, deployment, and
publication claims remain withheld.

The successful S5 pipeline 7387 belongs only to pre-rework candidate
`91f79a04219b77b30b98a3e8fb71087f1dbed52f`, which still declared `0.5.1`.
After this feature branch is merged to `dev`, S5 must be repeated on the new
exact `dev` SHA, including the installed-local Codex baseline/context-state
scenarios, before independent S6 review. Only an achieved S6 verdict may allow
tree-preserving S7 promotion to protected `main`; only that exact protected
tree may be tagged once as `v0.6.0` for S8 private package and extracted smoke.
No tag, package, GitLab Release, deployment, or public publication is created
by this release-candidate entry.

Published `v0.5.1` remains immutable: the private annotated tag peels to
`408bcb1162af5ec783529a0b1096f7f5caf18504`, and its byte-identical private and
public archive SHA-256 is
`4fc55d8e2dfa74caa7f9041f972634b746733c44fd7ae46ee3e7859ff629c7f3`.
The failed-evidence `v0.5.0` tag remains immutable at
`85cd78650f9760255ab2a540fb4c806a9b5ba317` and remains non-public. Neither
predecessor tag, release, package, checksum, or historical report is rewritten.

## [0.5.1] - release candidate

### Fixed

- Fetch the exact immutable `v0.4.0` and `v0.4.1` predecessor refs inside the
  isolated manual `release-evidence` checkout before `npm test` can invoke the
  public-surface guard.
- Reuse the same fail-closed predecessor-fetch helper in validation and manual
  release evidence, with focused regression coverage for the required order.

### Evidence and release boundary

This patch changes release-evidence orchestration and the package version only;
the v0.5 feature set and its evidence ceiling are unchanged. Savings,
aggregate, percentage, cost, provider-wide, release, deployment, and
publication claims remain withheld. Exact-source CI, a fresh accepted-`dev`
pipeline, an independent patch-candidate review, and a new protected-`main`
promotion are required before any `v0.5.1` release attempt.

The private `v0.5.0` tag remains immutable at protected-`main` commit
`85cd78650f9760255ab2a540fb4c806a9b5ba317`. Tag pipeline 7311 and exact-SHA
recovery pipelines 7312, 7313, and 7314 retained successful prerequisite jobs
but failed only in manual `release-evidence`; no package, GitLab Release, or
public publication was created. The tag must never be moved, deleted, or
recreated.

## [0.5.0] - immutable private tag; release evidence failed

### Added

- Added Verified Reuse contracts and default-deny admission, a durable
  content-addressed ledger and external artifact boundary, fenced
  controller/follower coalescing, bounded projections, and fail-closed
  measurement and claim admission.
- Added exact five-skill public-surface and npm-package enforcement plus
  installed-local-Codex scenario verification with equal outcome and equal
  required-verification hashes.
- Added reviewer-facing v0.5.0 goal-review and release-readiness evidence for
  the independent S6 gate.

### Evidence and release boundary

This entry records the reviewed v0.5 feature payload; it is not successful
release or publication evidence. S6 review and S7 protected-main promotion
completed, after which the immutable private `v0.5.0` tag was created at
`85cd78650f9760255ab2a540fb4c806a9b5ba317`. Its manual release-evidence job
failed before packaging because its isolated checkout lacked the required
predecessor refs. No package, GitLab Release, deployment, or public publication
was created. Savings, aggregate, percentage, cost, provider-wide, release,
deployment, and publication claims remain withheld.

Private `v0.4.0` failure evidence and private/public `v0.4.1` tags, releases,
packages, checksums, and history remain immutable.

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
