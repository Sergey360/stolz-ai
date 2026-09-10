import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';

import { runPilotManifest } from '../benchmarks/v3/pilot-runner.mjs';
import { buildFixtureOnlyBenchmarkV3Report } from '../tools/benchmark-v3-admission.mjs';
import {
  sealBenchmarkV3Record,
  validateBenchmarkV3Record,
} from '../tools/benchmark-v3-validator.mjs';

const execFileAsync = promisify(execFile);
const G4_CANDIDATE_SHA = '79f2789e801a5135e94747f470e6300022a2b3f2';
const G4_PIPELINE_URL = 'https://lab.it360.ru/myprojects/stolz-ai/-/pipelines/6644';
const AC_194_IDS = Object.freeze(Array.from({ length: 12 }, (_, index) => `AC-194-${String(index + 1).padStart(2, '0')}`));
const RELEVANT_CONTRACT_IDS = Object.freeze([
  'GOAL-001',
  'REQ-001',
  'REQ-002',
  'REQ-004',
  'REQ-006',
  'REQ-009',
  'AC-002',
  'AC-006',
  'AC-008',
  'AC-009',
  ...AC_194_IDS,
]);
const APPROVED_SOURCES = Object.freeze([
  'docs/sdlc_contract.json',
  'docs/EVIDENCE_LOOP_ANALYSIS_V0.4.md',
  'docs/EVIDENCE_LOOP_ANALYSIS_V0.4.ru.md',
  'docs/BENCHMARK_V3_REQUIREMENTS.md',
  'docs/adr/0007-evidence-loop-benchmark-v3.md',
  'docs/BENCHMARK_V3_DESIGN.md',
  'docs/IMPLEMENTATION_PLAN_V0.4.md',
  'docs/SDLC_TASK_GRAPH_V0.4.md',
]);
const MANIFEST_REPORTS = Object.freeze([
  ['benchmarks/v3/pilots/manifests/reads-navigation.json', 'reports/benchmark-v3/reads-navigation.json'],
  ['benchmarks/v3/pilots/manifests/build-check-invalidation.json', 'reports/benchmark-v3/build-check-invalidation.json'],
  ['benchmarks/v3/pilots/manifests/quiet-wait-transition.json', 'reports/benchmark-v3/quiet-wait-transition.json'],
]);
const EXPECTED_SKILLS = Object.freeze([
  'stolz-benchmark',
  'stolz-context',
  'stolz-quiet-state',
  'stolz-reuse',
  'stolz-route',
]);

const parse = async (path) => JSON.parse(await readFile(path, 'utf8'));
const clone = (value) => structuredClone(value);

async function gitDirectory() {
  const dotGit = resolve('.git');
  const metadata = await stat(dotGit);
  if (metadata.isDirectory()) return dotGit;
  const pointer = (await readFile(dotGit, 'utf8')).trim();
  const match = /^gitdir:\s*(.+)$/.exec(pointer);
  assert.ok(match, 'the .git file contains a gitdir pointer');
  return resolve(dirname(dotGit), match[1]);
}

async function currentHeadSha() {
  const directory = await gitDirectory();
  const head = (await readFile(join(directory, 'HEAD'), 'utf8')).trim();
  if (/^[a-f0-9]{40}$/.test(head)) return head;
  const match = /^ref:\s*(.+)$/.exec(head);
  assert.ok(match, 'HEAD is detached at a SHA or points to a ref');
  const ref = match[1];
  try {
    const loose = (await readFile(join(directory, ref), 'utf8')).trim();
    if (/^[a-f0-9]{40}$/.test(loose)) return loose;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const directories = [directory];
  try {
    directories.push(resolve(directory, (await readFile(join(directory, 'commondir'), 'utf8')).trim()));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const candidate of directories) {
    try {
      const packed = await readFile(join(candidate, 'packed-refs'), 'utf8');
      const packedEntry = packed.split(/\r?\n/).find((line) => line.endsWith(` ${ref}`));
      if (packedEntry) return packedEntry.slice(0, 40);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD']);
  const resolved = stdout.trim();
  assert.match(resolved, /^[a-f0-9]{40}$/, `${ref} resolves through Git`);
  return resolved;
}

function npmInvocation(args) {
  if (process.env.npm_execpath) return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  if (process.platform === 'win32') {
    return {
      command: process.execPath,
      args: [join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...args],
    };
  }
  return { command: 'npm', args };
}

async function packAndExtract() {
  const directory = await mkdtemp(join(tmpdir(), 'stolz-v04-independent-'));
  const invocation = npmInvocation(['pack', '--json', '--ignore-scripts', '--pack-destination', directory]);
  const { stdout } = await execFileAsync(invocation.command, invocation.args, { maxBuffer: 10 * 1024 * 1024 });
  const packed = JSON.parse(stdout)[0];
  await execFileAsync('tar', ['-xzf', join(directory, packed.filename), '-C', directory]);
  return { directory, root: join(directory, 'package'), packed };
}

test('verification matrix covers every v0.4 contract ID and approved source', async () => {
  const [contract, requirements, verification, traceability] = await Promise.all([
    parse('docs/sdlc_contract.json'),
    readFile('docs/BENCHMARK_V3_REQUIREMENTS.md', 'utf8'),
    readFile('docs/VERIFICATION_V0.4.md', 'utf8'),
    readFile('docs/SDLC_TRACEABILITY.md', 'utf8'),
  ]);
  const contractAcIds = contract.acceptance_criteria
    .map(({ id }) => id)
    .filter((id) => id.startsWith('AC-194-'));
  assert.deepEqual(contractAcIds, [...AC_194_IDS]);
  for (const id of AC_194_IDS) {
    assert.ok(requirements.includes(`| \`${id}\` |`), `${id} is defined in the approved requirements matrix`);
  }
  for (const id of RELEVANT_CONTRACT_IDS) {
    assert.ok(verification.includes(id), `${id} has direct verification evidence`);
    assert.ok(traceability.includes(id), `${id} is retained in traceability`);
  }
  for (const source of APPROVED_SOURCES) assert.ok(verification.includes(source), `${source} is cited as source authority`);
  assert.match(verification, /provider-native cohort[\s\S]{0,40}not available/i);
  assert.match(verification, /public (?:percentage|provider-savings claim)[\s\S]{0,60}withheld/i);
});

test('candidate and CI evidence bind verification to exact SHA', async () => {
  const [verification, ci, head] = await Promise.all([
    readFile('docs/VERIFICATION_V0.4.md', 'utf8'),
    readFile('.gitlab-ci.yml', 'utf8'),
    currentHeadSha(),
  ]);
  assert.match(head, /^[a-f0-9]{40}$/);
  if (process.env.STOLZ_CANDIDATE_SHA) {
    assert.equal(process.env.STOLZ_CANDIDATE_SHA, head, 'the CI-supplied candidate SHA equals checked-out HEAD');
  }
  assert.ok(verification.includes(G4_CANDIDATE_SHA));
  assert.ok(verification.includes(G4_PIPELINE_URL));
  assert.match(ci, /^verify-v0\.9\.0:$/m);
  assert.match(ci, /STOLZ_CANDIDATE_SHA="\$CI_COMMIT_SHA" node --test test\/benchmark-v3-verification\.test\.mjs/);
  assert.match(ci, /VERIFIED_CANDIDATE_SHA=%s/);
  assert.match(ci, /npm test/);
  assert.match(ci, /npm run build/);
});

test('independent schema, identity, track, and publication mutations fail closed', async () => {
  const fixtureNames = (await readdir('fixtures/benchmark-v3'))
    .filter((name) => name.endsWith('.valid.json'))
    .sort();
  assert.equal(fixtureNames.length, 13);
  let rejected = 0;
  for (const name of fixtureNames) {
    const original = await parse(`fixtures/benchmark-v3/${name}`);
    const mutations = [
      { ...clone(original), canonical_sha256: '0'.repeat(64) },
      sealBenchmarkV3Record({ ...clone(original), verification_probe: true }),
      sealBenchmarkV3Record({ ...clone(original), schema_version: '99.0.0' }),
    ];
    for (const mutation of mutations) {
      const result = await validateBenchmarkV3Record(mutation);
      assert.equal(result.valid, false, `${name} mutation is rejected`);
      assert.ok(result.errors.length > 0, `${name} rejection is explained`);
      rejected += 1;
    }
  }

  for (const [path, track] of [
    ['fixtures/benchmark-v3/attempt.provider-native.valid.json', 'runtime_measured'],
    ['fixtures/benchmark-v3/attempt.runtime-measured.valid.json', 'provider_native'],
  ]) {
    const attempt = await parse(path);
    attempt.track = track;
    const result = await validateBenchmarkV3Record(sealBenchmarkV3Record(attempt));
    assert.equal(result.valid, false, `${path} cannot be relabeled ${track}`);
    rejected += 1;
  }

  const report = await parse('fixtures/benchmark-v3/report.valid.json');
  report.admission.admission = 'admitted_scoped';
  report.admission.admission_reason = 'Independent fail-open verification mutation.';
  report.admission.public_claim = { kind: 'provider_savings', disposition: 'allowed' };
  for (const name of Object.keys(report.admission.gates)) report.admission.gates[name] = { status: 'passed' };
  report.admission = sealBenchmarkV3Record(report.admission);
  report.claim = {
    kind: 'provider_savings_percentage',
    disposition: 'published_scoped',
    value: 10,
    scope_statement: 'Invalid fixture-only publication mutation.',
  };
  for (const metric of report.metrics) {
    metric.availability = 'available';
    metric.value = 1;
    metric.formula = 'invalid-fixture-mutation';
    metric.component_ids = ['fixture-component'];
    delete metric.reason;
  }
  const failOpen = await validateBenchmarkV3Record(sealBenchmarkV3Record(report));
  assert.equal(failOpen.valid, false);
  assert.deepEqual(
    failOpen.errors.map(({ code }) => code).sort(),
    ['provider_claim_without_complete_cohort', 'public_claim_without_complete_cohort'],
  );
  assert.equal(rejected, 41);
});

test('all three pilot families and reports regenerate deterministically with claims withheld', async () => {
  for (const [manifestPath, reportPath] of MANIFEST_REPORTS) {
    const manifest = await parse(manifestPath);
    const [first, second, committed] = await Promise.all([
      runPilotManifest(manifestPath),
      runPilotManifest(manifestPath),
      parse(reportPath),
    ]);
    assert.deepEqual(first, second, `${manifest.scenario_id} is deterministic`);
    assert.deepEqual(first.summary, { planned_pairs: 5, included_fixture_pairs: 5, excluded_pairs: 0 });
    const regenerated = await buildFixtureOnlyBenchmarkV3Report({
      manifest,
      pilotRun: first,
      manifestPath,
      outputPath: reportPath,
    });
    assert.deepEqual(regenerated, committed, `${reportPath} regenerates byte-equivalent semantic JSON`);
    assert.equal(regenerated.admission.admission, 'withheld');
    assert.equal(regenerated.admission.public_claim.disposition, 'withheld');
    assert.equal(regenerated.claim.disposition, 'withheld');
    assert.equal(regenerated.metrics.every(({ availability }) => availability === 'withheld'), true);
  }
});

test('package inventory and extracted package remain leak-free and preserve five-skill smoke', async (context) => {
  const extracted = await packAndExtract();
  context.after(() => rm(extracted.directory, { recursive: true, force: true }));
  const paths = extracted.packed.files.map(({ path }) => path).sort();
  assert.equal(extracted.packed.version, '0.9.0');
  // v0.7 lifecycle and C3 admission are declared production surfaces,
  // alongside the C2 adapters already included in this package boundary.
  assert.equal(extracted.packed.entryCount, 166);
  assert.equal(paths.some((path) => /^(?:test|docs|evidence|node_modules|dist)\//.test(path)), false);
  assert.equal(paths.some((path) => path.startsWith('fixtures/benchmark-v3/')), false);
  assert.equal(paths.some((path) => /(?:^|\/)(?:\.env(?:\.|$)|[^/]+\.(?:pem|key|p12)$)/i.test(path)), false);
  for (const path of [
    'tools/benchmark-v3-admission.mjs',
    'tools/benchmark-v3-cli.mjs',
    'tools/codex-jsonl-collector.mjs',
    'tools/runtime-lifecycle.mjs',
    'tools/c3-provider-pair-admission.mjs',
    'contracts/benchmark-v3/codex-jsonl-usage.schema.json',
    'contracts/benchmark-v3/evidence-provenance-codex.schema.json',
    'contracts/benchmark-v3/report.schema.json',
    ...MANIFEST_REPORTS.map(([, reportPath]) => reportPath),
    'reports/benchmark-v3/real/reads-navigation.json',
    'reports/benchmark-v3/real/build-check-invalidation.json',
    'reports/benchmark-v3/real/quiet-wait-transition.json',
  ]) assert.ok(paths.includes(path), `${path} is in the package inventory`);

  const extractedSkills = (await readdir(join(extracted.root, 'skills'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)
    .sort();
  assert.deepEqual(extractedSkills, [...EXPECTED_SKILLS]);
  for (const [, reportPath] of MANIFEST_REPORTS) {
    const report = await parse(join(extracted.root, reportPath));
    assert.equal((await validateBenchmarkV3Record(report)).valid, true, reportPath);
    assert.equal(report.claim.disposition, 'withheld');
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /(?:authorization|bearer\s+[a-z0-9._-]{16,}|api[_-]?key|password|private[_-]?key)/i);
    assert.doesNotMatch(serialized, /(?:localhost|127\.0\.0\.1|lab\.it360\.ru|\.internal\b)/i);
  }

  const { stdout: benchmarkSmoke } = await execFileAsync(process.execPath, [
    'tools/benchmark-v3-cli.mjs',
    '--verify-report', 'reports/benchmark-v3/real/reads-navigation.json',
    '--check',
  ], {
    cwd: extracted.root,
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(benchmarkSmoke), {
    ok: true,
    mode: 'verify-report',
    scenario_id: 'reads-navigation',
    track: 'provider_native',
    identity_records: 2,
    admission: 'withheld',
    public_claim: 'withheld',
  });

  const { stdout } = await execFileAsync(process.execPath, ['tools/profile-cli.mjs', 'resolve', '--runtime', 'claude-code'], {
    cwd: extracted.root,
    maxBuffer: 10 * 1024 * 1024,
  });
  const resolvedProfile = JSON.parse(stdout);
  assert.equal(resolvedProfile.resolution, 'profile');
  assert.equal(resolvedProfile.certified, true);
  assert.deepEqual(resolvedProfile.core_skills, [
    'stolz-context',
    'stolz-reuse',
    'stolz-quiet-state',
    'stolz-route',
    'stolz-benchmark',
  ]);
});

test('v0.6.0 preserves v0.3.4 runtime, dependency, and provider-claim boundaries', async () => {
  const [pkg, lock, skillEntries, reports] = await Promise.all([
    parse('package.json'),
    parse('package-lock.json'),
    readdir('skills', { withFileTypes: true }),
    Promise.all(MANIFEST_REPORTS.map(([, reportPath]) => parse(reportPath))),
  ]);
  assert.equal(pkg.version, '0.9.0');
  assert.equal(lock.version, '0.9.0');
  assert.deepEqual(pkg.dependencies, { ajv: '8.20.0' });
  assert.equal(pkg.devDependencies, undefined);
  assert.deepEqual(pkg.exports, {
    './profile-resolver': './tools/profile-resolver.mjs',
    './profile-installer': './tools/profile-installer.mjs',
    './codex-local-state': './tools/codex-local-state.mjs',
  });
  assert.deepEqual(
    skillEntries.filter((entry) => entry.isDirectory()).map(({ name }) => name).sort(),
    [...EXPECTED_SKILLS],
  );
  for (const report of reports) {
    assert.equal(report.track, 'provider_native', 'the report evaluates the provider lane without admitting fixture evidence into it');
    assert.equal(report.scope.provider_id, 'not_observed');
    assert.equal(report.admission.gates.track_authority.status, 'withheld');
    assert.equal(report.attempts.included.length, 0);
    assert.equal(report.pairs.included.length, 0);
    assert.equal(report.pricing.availability, 'unknown');
    assert.equal(report.metrics.every(({ availability }) => availability === 'withheld'), true);
    assert.equal(report.claim.disposition, 'withheld');
  }
});
