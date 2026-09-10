import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const publicDocuments = [
  'README.md',
  'README.he.md',
  'README.nl.md',
  'README.ru.md',
  'README.zh.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'docs/installation.md',
  'docs/architecture.md',
  'docs/benchmarking.md',
  'benchmarks/README.md',
];

function localTargets(text) {
  return [
    ...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g),
    ...text.matchAll(/\b(?:src|srcset)="([^"]+)"/g),
  ]
    .map((match) => match[1])
    .filter((target) => !target.startsWith('#') && !/^[a-z]+:\/\//i.test(target));
}

test('public documentation is compact and tells one consistent product story', async () => {
  const manifest = JSON.parse(await readFile('.github/public-surface.json', 'utf8'));
  const docs = (await readdir('docs', { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => `docs/${entry.name}`)
    .sort();
  assert.deepEqual(docs, [...manifest.allowed_docs].sort());
  const [readme, russian] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('README.ru.md', 'utf8'),
  ]);
  assert.match(readme, /STOLZ A\.I\./);
  assert.match(russian, /STOLZ A\.I\./);
  assert.match(readme, /Движений лишних у него не было/);
  assert.match(russian, /Движений лишних у него не было/);
  for (const skill of ['stolz-route', 'stolz-context', 'stolz-reuse', 'stolz-quiet-state', 'stolz-benchmark']) {
    assert.match(readme, new RegExp(`skills/${skill}/SKILL\\.md`));
  }
  assert.match(readme, /(?:\*\*)?not(?:\*\*)? a measurement of Codex usage/i);
  assert.match(russian, /(?:\*\*)?не(?:\*\*)? измерение расхода Codex/i);
});

test('public documents have valid local links and no internal process residue', async () => {
  const forbidden = /lab\.it360\.ru|C:\\Sergey|PRIVATE-TOKEN|glpat-|github_pat_/i;
  for (const document of publicDocuments) {
    const text = await readFile(document, 'utf8');
    assert.doesNotMatch(text, forbidden, `${document} contains internal process language`);
    for (const target of localTargets(text)) {
      const path = target.split('#')[0];
      if (path) await access(resolve(dirname(document), decodeURIComponent(path)));
    }
  }
});

test('public documentation exposes the exact v0.7 evidence boundary', async () => {
  const texts = await Promise.all(publicDocuments.map((document) => readFile(document, 'utf8')));
  const combined = texts.join('\n');
  for (const version of ['2.1.251', '0.22.3', '0.153.4']) {
    assert.match(combined, new RegExp(version.replaceAll('.', '\\.')));
  }
  assert.match(combined, /C3[^\n]*(?:withheld|остаются `withheld`)/i);
  assert.match(combined, /fixture_only/);
  assert.match(combined, /runtime_measured/);
  assert.match(combined, /provider-native/);
  assert.match(combined, /input_identity_changed/);
  assert.doesNotMatch(combined, /general v0\.7\.1 savings|универсальн\w+ экономи\w+ v0\.7\.1/i);
});

test('tracked GitHub tree stays inside the public allowlist', async () => {
  const manifest = JSON.parse(await readFile('.github/public-surface.json', 'utf8'));
  const { stdout } = await execFileAsync('git', ['ls-files', '-z']);
  const paths = [];
  for (const path of stdout.split('\0').filter(Boolean)) {
    try {
      await access(path);
      paths.push(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const allowed = new Set(manifest.allowed_roots);
  const forbidden = new Set(manifest.forbidden_roots);

  for (const path of paths) {
    const root = path.split('/')[0];
    assert.equal(forbidden.has(root), false, `${path} belongs to a private-only root`);
    assert.equal(allowed.has(root), true, `${path} is outside the public allowlist`);
  }

  const trackedDocs = paths.filter((path) => path.startsWith('docs/')).sort();
  assert.deepEqual(trackedDocs, [...manifest.allowed_docs].sort());

  const forbiddenPrefixes = [
    '.gitlab-ci.yml',
    'benchmarks/v3/',
    'benchmarks/context-state-v0.6/',
    'contracts/verified-reuse/',
    'contracts/context-state-v0.6/',
    'contracts/multi-runtime-evidence-v0.7/',
    'fixtures/benchmark-v3/',
    'reports/verified-reuse/',
    'tools/verified-reuse/',
    'tools/context-state.mjs',
    'tools/context-state-benchmark.mjs',
    'tools/context-ledger.mjs',
    'tools/quiet-state-controller.mjs',
    'docs/GOAL_REVIEW_',
    'docs/IMPLEMENTATION_PLAN_',
    'docs/RELEASE_READINESS_',
    'docs/SDLC_',
  ];
  for (const path of paths) {
    assert.equal(forbiddenPrefixes.some((prefix) => path.startsWith(prefix)), false, `${path} is private release-control material`);
  }
});

test('npm package contains approved product files and root localizations, not docs or project tests', async () => {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : 'npm';
  const args = npmExecPath
    ? [npmExecPath, 'pack', '--dry-run', '--json', '--ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const { stdout } = await execFileAsync(command, args);
  const packed = JSON.parse(stdout)[0];
  const paths = packed.files.map((entry) => entry.path);

  assert.equal(packed.name, 'stolz-ai');
  assert.equal(packed.version, '0.7.1');
  assert.equal(packed.entryCount, 147);
  for (const path of [
    'README.md',
    'README.he.md',
    'README.nl.md',
    'README.ru.md',
    'README.zh.md',
    'LICENSE',
    'NOTICE',
    'CONTRIBUTING.md',
    'skills/stolz-route/SKILL.md',
    'skills/stolz-benchmark/references/outcome-gates.md',
    'tools/benchmark-v3-cli.mjs',
    'reports/benchmark-v3/real/reads-navigation.json',
    'profiles/claude-code-minimal.v3.json',
    'fixtures/runtime-adapters/claude-code/c2.sanitized-telemetry.json',
    'fixtures/runtime-adapters/qwen-code/c2.sanitized-telemetry.json',
    'tools/c3-provider-pair-admission.mjs',
    'tools/runtime-lifecycle.mjs',
    'tools/runtime-telemetry/c2-adapter.mjs',
    'tools/runtime-telemetry/claude-code-c2.mjs',
    'tools/runtime-telemetry/qwen-code-c2.mjs',
  ]) assert.ok(paths.includes(path), `${path} must be packed`);
  assert.equal(paths.some((path) => path.startsWith('docs/')), false);
  assert.equal(paths.some((path) => path.startsWith('test/')), false);
  assert.equal(paths.some((path) => path.startsWith('benchmarks/v3/')), false);
  assert.equal(paths.some((path) => path.startsWith('contracts/verified-reuse/')), false);
  assert.equal(paths.some((path) => path.startsWith('contracts/context-state-v0.6/')), false);
  assert.equal(paths.some((path) => path.startsWith('contracts/multi-runtime-evidence-v0.7/')), false);
  assert.equal(paths.some((path) => path.startsWith('fixtures/benchmark-v3/')), false);
  assert.equal(paths.some((path) => path.startsWith('reports/verified-reuse/')), false);
  assert.equal(paths.some((path) => path.startsWith('tools/verified-reuse/')), false);
  assert.equal(paths.some((path) => /^tools\/(?:context-state(?:-benchmark)?|context-ledger|quiet-state-controller)\.mjs$/.test(path)), false);
  assert.equal(paths.some((path) => path.startsWith('benchmarks/context-state-v0.6/')), false);
});

test('GitHub CI runs full public checks with read-only permissions', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run benchmark:check/);
  assert.match(workflow, /npm run benchmark:v2:check/);
  assert.match(workflow, /--verify-report reports\/benchmark-v3\/real\/reads-navigation\.json --check/);
  assert.match(workflow, /npm pack --dry-run --json --ignore-scripts/);
  assert.doesNotMatch(workflow, /npm run build|sha256sum --check/);
});
