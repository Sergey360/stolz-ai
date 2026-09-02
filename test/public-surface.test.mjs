import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const publicDocuments = [
  'README.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'docs/INSTALLATION.md',
  'docs/architecture.md',
  'docs/benchmarking.md',
  'docs/README.he.md',
  'docs/README.nl.md',
  'docs/README.ru.md',
  'docs/README.zh.md',
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
  const [readme, russian] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('docs/README.ru.md', 'utf8'),
  ]);
  assert.match(readme, /STOLZ A\.I\./);
  assert.match(russian, /Штольц А\.И\./);
  for (const skill of ['stolz-route', 'stolz-context', 'stolz-reuse', 'stolz-quiet-state', 'stolz-benchmark']) {
    assert.equal(readme.includes(`\`${skill}\``), true);
  }
  assert.match(readme, /not a numerical saving\s+claim/i);
  assert.match(russian, /не\s*заявляет\s*численный\s*результат/i);
});

test('public documents have valid local links and no internal process residue', async () => {
  const forbidden = /lab\.it360\.ru|C:\\Sergey|PRIVATE-TOKEN|glpat-|github_pat_/i;
  for (const document of publicDocuments) {
    const text = await readFile(document, 'utf8');
    assert.doesNotMatch(text, forbidden, `${document} contains internal process language`);
    if (document === 'CHANGELOG.md') continue;
    for (const target of localTargets(text)) {
      const path = target.split('#')[0];
      if (path) await access(resolve(dirname(document), decodeURIComponent(path)));
    }
  }
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

  const forbiddenPrefixes = [
    '.gitlab-ci.yml',
    'benchmarks/v3/',
    'fixtures/benchmark-v3/',
    'docs/GOAL_REVIEW_',
    'docs/IMPLEMENTATION_PLAN_',
    'docs/RELEASE_READINESS_',
    'docs/SDLC_',
  ];
  for (const path of paths) {
    assert.equal(forbiddenPrefixes.some((prefix) => path.startsWith(prefix)), false, `${path} is private release-control material`);
  }
});

test('npm package reproduces the reviewed 137-file v0.4.1 inventory', async () => {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : 'npm';
  const args = npmExecPath
    ? [npmExecPath, 'pack', '--dry-run', '--json', '--ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const { stdout } = await execFileAsync(command, args);
  const packed = JSON.parse(stdout)[0];
  const paths = packed.files.map((entry) => entry.path);
  const expected = (await readFile('.github/releases/stolz-ai-0.4.1.tgz.inventory.txt', 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((path) => path.replace(/^package\//, ''));

  assert.equal(packed.name, 'stolz-ai');
  assert.equal(packed.version, '0.4.1');
  assert.equal(paths.length, 137);
  assert.deepEqual([...paths].sort(), [...expected].sort());
  for (const path of [
    'README.md',
    'LICENSE',
    'NOTICE',
    'CONTRIBUTING.md',
    'skills/stolz-route/SKILL.md',
    'skills/stolz-benchmark/references/outcome-gates.md',
    'tools/benchmark-v3-cli.mjs',
    'reports/benchmark-v3/real/reads-navigation.json',
    'profiles/claude-code-minimal.v3.json',
  ]) assert.ok(paths.includes(path), `${path} must be packed`);
  assert.equal(paths.some((path) => path.startsWith('test/')), false);
  assert.equal(paths.some((path) => path.startsWith('benchmarks/v3/')), false);
  assert.equal(paths.some((path) => path.startsWith('fixtures/benchmark-v3/')), false);
});

test('GitHub CI runs full public checks and canonical archive verification with read-only permissions', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run benchmark:check/);
  assert.match(workflow, /npm run benchmark:v2:check/);
  assert.match(workflow, /--verify-report reports\/benchmark-v3\/real\/reads-navigation\.json --check/);
  assert.match(workflow, /sha256sum --check/);
});
