import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const publicReadmes = [
  'README.md',
  'README.ru.md',
  'README.nl.md',
  'README.zh.md',
  'README.he.md',
];
const publicDocs = [
  'docs/installation.md',
  'docs/architecture.md',
  'docs/benchmarking.md',
];

test('v0.7.1 package, lockfile, and CI release gate stay in lockstep', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const lock = JSON.parse(await read('package-lock.json'));
  const ci = await read('.gitlab-ci.yml');
  assert.equal(pkg.version, '0.9.0');
  assert.equal(lock.version, '0.9.0');
  assert.equal(lock.packages[''].version, '0.9.0');
  assert.match(ci, /verify-v0\.9\.0:/);
  assert.match(ci, /CANDIDATE_VERSION=0\.9\.0/);
  assert.match(ci, /PREDECESSOR_VERSION=0\.8\.0/);
  assert.match(ci, /EXPECTED_PACKED_FILES=166/);
});

test('public compatibility text names exact evidence without the stale C2/C3 claim', async () => {
  const documents = await Promise.all([...publicReadmes, ...publicDocs].map(read));
  const combined = documents.join('\n');
  assert.doesNotMatch(combined, /C0\/C1 supported; C2\/C3 withheld\/unavailable/i);
  for (const phrase of [
    'Claude Code 2.1.251',
    'Qwen Code 0.22.3',
    'Codex CLI 0.153.4',
  ]) assert.ok(combined.includes(phrase), phrase);
  assert.match(combined, /C2[\s\S]{0,160}(certified|evidence)/i);
  assert.match(combined, /C3[\s\S]{0,240}withheld/i);
});

test('installation documents every supported resolver command and excluded command boundary', async () => {
  const installation = await read('docs/installation.md');
  for (const runtime of ['codex', 'claude-code', 'qwen-code']) {
    assert.ok(installation.includes(`resolve --runtime ${runtime}`), runtime);
    assert.ok(installation.includes(`install --runtime ${runtime}`), runtime);
  }
  for (const command of ['status', 'doctor', 'update', 'uninstall']) {
    assert.match(installation, new RegExp(`\\b${command}\\b`));
  }
  assert.match(installation, /does not start a service/i);
});

test('architecture keeps capability levels separate and includes both required examples', async () => {
  const architecture = await read('docs/architecture.md');
  for (const level of ['C0', 'C1', 'C2', 'C3']) {
    assert.match(architecture, new RegExp(`\\| ${level} \\|`));
  }
  assert.match(architecture, /## Example: select only the required context/);
  assert.match(architecture, /## Example: refuse unsafe reuse/);
  assert.match(architecture, /input_identity_changed/);
  assert.match(architecture, /internal implementations/i);
});

test('benchmarking preserves the mixed historical result and evidence taxonomy', async () => {
  const benchmarking = await read('docs/benchmarking.md');
  for (const evidenceClass of ['fixture_only', 'runtime_measured', 'provider_native']) {
    assert.ok(benchmarking.includes(evidenceClass), evidenceClass);
  }
  for (const value of ['+2,867', '-2,880', '-1,330']) {
    assert.ok(benchmarking.includes(value), value);
  }
  assert.match(benchmarking, /mixed, historical/i);
  assert.match(benchmarking, /not evidence that v0\.7\.1 generally saves tokens/i);
});
