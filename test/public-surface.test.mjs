import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const publicDocuments = [
  'README.md',
  'README.ru.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'docs/installation.md',
  'docs/architecture.md',
  'docs/benchmarking.md',
  'benchmarks/README.md',
];

function localLinks(text) {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !target.startsWith('#') && !/^[a-z]+:\/\//i.test(target));
}

test('public documentation is compact and tells one consistent product story', async () => {
  const docs = (await readdir('docs', { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(docs, ['architecture.md', 'benchmarking.md', 'installation.md']);
  const [readme, russian] = await Promise.all([
    readFile('README.md', 'utf8'),
    readFile('README.ru.md', 'utf8'),
  ]);
  for (const text of [readme, russian]) {
    assert.match(text, /STOLZ A\.I\./);
    assert.match(text, /Движений лишних у него не было/);
    assert.doesNotMatch(text, /Штольц А\.И\./);
  }
  for (const skill of ['stolz-route', 'stolz-context', 'stolz-reuse', 'stolz-quiet-state', 'stolz-benchmark']) {
    assert.match(readme, new RegExp(`skills/${skill}/SKILL\\.md`));
  }
  assert.match(readme, /not a measurement of Codex usage/i);
  assert.match(russian, /не измерение расхода Codex/i);
});

test('public documents have valid local links and no internal process residue', async () => {
  const forbidden = /lab\.it360\.ru|C:\\Sergey|GOAL_REVIEW|IMPLEMENTATION_PLAN|RELEASE_READINESS|VERIFICATION_V0|SDLC_|C0\/C1|C2\/C3|public_jobs|NO-GO/i;
  for (const document of publicDocuments) {
    const text = await readFile(document, 'utf8');
    assert.doesNotMatch(text, forbidden, `${document} contains internal process language`);
    for (const target of localLinks(text)) {
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
});

test('npm package contains the five skills and public guides, not project tests', async () => {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : 'npm';
  const args = npmExecPath
    ? [npmExecPath, 'pack', '--dry-run', '--json', '--ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const { stdout } = await execFileAsync(command, args);
  const packed = JSON.parse(stdout)[0];
  const paths = packed.files.map((entry) => entry.path);

  assert.equal(packed.name, 'stolz-ai');
  for (const path of [
    'README.md',
    'README.ru.md',
    'LICENSE',
    'docs/installation.md',
    'skills/stolz-route/SKILL.md',
    'skills/stolz-benchmark/references/outcome-gates.md',
  ]) assert.ok(paths.includes(path), `${path} must be packed`);
  assert.equal(paths.some((path) => path.startsWith('test/')), false);
  assert.equal(paths.some((path) => path.startsWith('benchmarks/raw/')), false);
});

test('GitHub CI runs the focused public checks with read-only permissions', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run benchmark:check/);
  assert.match(workflow, /npm pack --dry-run --json --ignore-scripts/);
  assert.doesNotMatch(workflow, /npm run build|benchmark:v2/);
});
