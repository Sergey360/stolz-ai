import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  getImmutablePredecessorProblems,
  getPublicSurfaceProblems,
  npmInvocation,
  PREDECESSOR_COMMITS,
  PUBLIC_DOCUMENTS,
  PUBLIC_READMES,
  PUBLIC_SKILLS,
} from '../scripts/check-public-surface.mjs';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readText = (path) => readFile(resolve(ROOT, path), 'utf8');

const CURRENT_VERSION = '0.9.0';
const PRE_REWORK_SHA = '91f79a04219b77b30b98a3e8fb71087f1dbed52f';
const V051_PACKAGE_SHA256 = '4fc55d8e2dfa74caa7f9041f972634b746733c44fd7ae46ee3e7859ff629c7f3';

test('v0.6.0 package, lockfile, changelog, release notes, and exact-SHA CI tuple fail closed', async () => {
  const [pkgText, lockText, changelog, readiness, notes, traceability, rollback, ci] =
    await Promise.all([
      readText('package.json'),
      readText('package-lock.json'),
      readText('CHANGELOG.md'),
      readText('docs/CONTEXT_STATE_RELEASE_READINESS_V0.6.md'),
      readText('docs/RELEASE_NOTES_V0.6.md'),
      readText('docs/CONTEXT_STATE_RELEASE_TRACEABILITY_V0.6.md'),
      readText('docs/CONTEXT_STATE_BACKUP_ROLLBACK_V0.6.md'),
      readText('.gitlab-ci.yml'),
    ]);
  const pkg = JSON.parse(pkgText);
  const lock = JSON.parse(lockText);

  assert.equal(pkg.version, CURRENT_VERSION);
  assert.equal(lock.version, CURRENT_VERSION);
  assert.equal(lock.packages[''].version, CURRENT_VERSION);
  assert.deepEqual(pkg.dependencies, { ajv: '8.20.0' });
  assert.deepEqual(lock.packages[''].dependencies, { ajv: '8.20.0' });
  assert.equal(Object.hasOwn(pkg, 'devDependencies'), false);
  assert.equal(Object.hasOwn(lock.packages[''], 'devDependencies'), false);
  for (const hook of ['prepare', 'prepublish', 'prepublishOnly', 'publish', 'postinstall']) {
    assert.equal(pkg.scripts[hook], undefined, `${hook} must not create a release side effect`);
  }

  const v060Start = changelog.indexOf('## [0.6.0] - release candidate');
  const v051Start = changelog.indexOf('## [0.5.1] - release candidate');
  assert.ok(v060Start >= 0 && v051Start > v060Start, '0.6.0 must precede immutable v0.5.1 history');
  const v060Entry = changelog.slice(v060Start, v051Start);
  assert.match(v060Entry, new RegExp(PRE_REWORK_SHA));
  assert.match(v060Entry, /S5 must be repeated[\s\S]*installed-local Codex[\s\S]*independent S6[\s\S]*S7[\s\S]*v0\.6\.0[\s\S]*S8/i);
  assert.match(v060Entry, /No tag, package, GitLab Release, deployment, or public publication is created/i);
  assert.match(v060Entry, new RegExp(V051_PACKAGE_SHA256));

  assert.match(ci, /\nverify-v0\.9\.0:\n/);
  assert.doesNotMatch(ci, /\nverify-v0\.4:\n/);
  assert.match(ci, /STOLZ_CANDIDATE_SHA="\$CI_COMMIT_SHA" node --test test\/context-state-release-v0\.6-candidate\.test\.mjs/);
  assert.match(ci, /test "\$CI_COMMIT_TAG" = "v\$\(node -p "require\('\.\/package\.json'\)\.version"\)"/);
  assert.match(ci, /CANDIDATE_VERSION=0\.9\.0/);
  assert.match(ci, /PREDECESSOR_VERSION=0\.8\.0/);
  assert.match(ci, /S5_STATUS=verified_in_ci/);
  assert.match(ci, /EXPECTED_PACKED_FILES=166/);
  assert.match(ci, /test "\$PACKED_FILES" -eq "\$EXPECTED_PACKED_FILES"/);

  for (const document of [readiness, notes, traceability, rollback]) {
    assert.match(document, /v0\.6\.0/i);
  }
  for (const id of [
    'GOAL-001', 'REQ-002', 'REQ-010', 'REQ-011', 'AC-002',
    'AC-254-07', 'AC-254-08', 'AC-254-09', 'AC-254-10', 'AC-254-12',
    ...Array.from({ length: 6 }, (_, index) => `AC-309-0${index + 1}`),
  ]) assert.match(`${readiness}\n${traceability}`, new RegExp(id));

  if (process.env.STOLZ_CANDIDATE_SHA) {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
    assert.equal(process.env.STOLZ_CANDIDATE_SHA, stdout.trim(), 'CI candidate SHA must identify its checkout exactly');
  }
});

test('S5 repeat, protected-main tree, v0.6.0 tag, backup, and no-premature-release expectations are explicit', async () => {
  const [readiness, notes, traceability, rollback] = await Promise.all([
    readText('docs/CONTEXT_STATE_RELEASE_READINESS_V0.6.md'),
    readText('docs/RELEASE_NOTES_V0.6.md'),
    readText('docs/CONTEXT_STATE_RELEASE_TRACEABILITY_V0.6.md'),
    readText('docs/CONTEXT_STATE_BACKUP_ROLLBACK_V0.6.md'),
  ]);
  const evidence = `${readiness}\n${notes}\n${traceability}\n${rollback}`;

  assert.match(readiness, /Current decision: NO-GO for promotion or release/i);
  assert.match(readiness, /S7 remains blocked[\s\S]*independent `achieved` S6 verdict/i);
  assert.match(readiness, /git rev-parse <accepted-dev>\^\{tree\}[\s\S]*git rev-parse <protected-main>\^\{tree\}/i);
  assert.match(readiness, /git rev-parse v0\.6\.0\^\{commit\}[\s\S]*equals that protected-main commit/i);
  assert.match(readiness, /annotated protected tag `v0\.6\.0` does not already exist and is created once/i);
  assert.match(readiness, /product smoke is pending S8/i);
  assert.match(traceability, /production_deploy: false/);
  assert.match(traceability, /product_smoke_status:[\s\S]*not_performed/i);
  assert.match(notes, /candidate only[\s\S]*not evidence of a tag,[\s\S]*package upload,[\s\S]*GitLab Release/i);
  assert.match(evidence, /Aggregate, percentage, cost,[\s\S]*provider-wide,[\s\S]*claims remain withheld/i);
  assert.match(rollback, /A plan,[\s\S]*dry-run alone is not restore evidence/i);
  assert.match(rollback, /do not move or recreate the tag/i);
  assert.match(rollback, /fix forward only as a new version/i);
  assert.doesNotMatch(readiness, /Current decision:\s*(?:GO|achieved)/i);
});

test('v0.6.0 preserves exact five-skill, public-curation, npm allowlist, and privacy boundaries', async () => {
  const pkg = JSON.parse(await readText('package.json'));
  assert.deepEqual(PUBLIC_SKILLS, [
    'stolz-benchmark',
    'stolz-context',
    'stolz-quiet-state',
    'stolz-reuse',
    'stolz-route',
  ]);
  assert.deepEqual(PUBLIC_READMES, [
    'README.md',
    'README.ru.md',
    'README.nl.md',
    'README.zh.md',
    'README.he.md',
  ]);
  assert.deepEqual(PUBLIC_DOCUMENTS, [
    'docs/architecture.md',
    'docs/benchmarking.md',
    'docs/installation.md',
  ]);
  assert.deepEqual(pkg.exports, {
    './profile-resolver': './tools/profile-resolver.mjs',
    './profile-installer': './tools/profile-installer.mjs',
    './codex-local-state': './tools/codex-local-state.mjs',
  });
  for (const exclusion of [
    '!tools/context-state-benchmark.mjs',
    '!tools/verified-reuse/run-installed-local-codex-scenarios.mjs',
    '!benchmarks/context-state-v0.6/',
  ]) assert.ok(pkg.files.includes(exclusion), `${exclusion} must remain excluded`);

  assert.deepEqual(await getPublicSurfaceProblems(), []);
  const invocation = npmInvocation(['pack', '--dry-run', '--json', '--ignore-scripts']);
  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
  });
  const packed = JSON.parse(stdout)[0];
  assert.equal(packed.version, CURRENT_VERSION);
  assert.equal(packed.entryCount, 166);
  for (const { path } of packed.files) {
    assert.doesNotMatch(path, /^(?:docs|scripts|test|web|internal|private|artifacts|ledger)\//);
    assert.doesNotMatch(path, /^tools\/verified-reuse\/(?:claim-admission|coalescing|measurement|projection|run-installed-local-codex-scenarios|scenario-record)\.mjs$/);
  }
});

test('all immutable predecessor tags are pinned and missing or moved identities fail closed', async () => {
  assert.deepEqual(PREDECESSOR_COMMITS, {
    'v0.4.0': '0ea25d80fb111f3c0daab9b02fafe1d169798ddd',
    'v0.4.1': '879d08a9a6426da9bbab485b23db90932e2082e2',
    'v0.5.0': '85cd78650f9760255ab2a540fb4c806a9b5ba317',
    'v0.5.1': '408bcb1162af5ec783529a0b1096f7f5caf18504',
  });
  assert.deepEqual(await getImmutablePredecessorProblems(ROOT), []);

  const movedExpectation = {
    ...PREDECESSOR_COMMITS,
    'v0.5.1': '0'.repeat(40),
  };
  assert.match(
    (await getImmutablePredecessorProblems(ROOT, movedExpectation)).join('\n'),
    /v0\.5\.1 predecessor commit changed/,
  );

  const missingRoot = await mkdtemp(resolve(tmpdir(), 'stolz-missing-predecessors-'));
  try {
    const missing = await getImmutablePredecessorProblems(missingRoot);
    assert.equal(missing.length, 4);
    assert.match(missing.join('\n'), /v0\.4\.0 immutable predecessor tag is unavailable/);
    assert.match(missing.join('\n'), /v0\.5\.1 immutable predecessor tag is unavailable/);
  } finally {
    await rm(missingRoot, { recursive: true, force: true });
  }

  const helper = await readText('scripts/fetch-predecessor-tags.sh');
  for (const tag of Object.keys(PREDECESSOR_COMMITS)) {
    assert.ok(helper.includes(`refs/tags/${tag}:refs/tags/${tag}`), `${tag} must be fetched exactly`);
    assert.ok(helper.includes(`refs/tags/${tag}^{commit}`), `${tag} peeled commit must be verified`);
  }
  const executableHelper = helper.split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(executableHelper, /(?:^|\s)--force(?:\s|$)/);

  for (const [tag, expectedCommit] of Object.entries(PREDECESSOR_COMMITS)) {
    const { stdout: commit } = await execFileAsync('git', ['rev-parse', `${tag}^{commit}`], { cwd: ROOT });
    assert.equal(commit.trim(), expectedCommit);
  }
  const [{ stdout: v050Package }, { stdout: v051Package }] = await Promise.all([
    execFileAsync('git', ['show', 'v0.5.0:package.json'], { cwd: ROOT }),
    execFileAsync('git', ['show', 'v0.5.1:package.json'], { cwd: ROOT }),
  ]);
  assert.equal(JSON.parse(v050Package).version, '0.5.0');
  assert.equal(JSON.parse(v051Package).version, '0.5.1');
});
