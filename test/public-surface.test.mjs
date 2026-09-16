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
  'docs/PILOT_JOURNAL_TEMPLATE.md',
  'docs/README.he.md',
  'docs/README.nl.md',
  'docs/README.ru.md',
  'docs/README.zh.md',
  'docs/SOLUTION_DESIGN.md',
  'docs/BRAND_PLATFORM.md',
  'benchmarks/README.md',
];
const rootReadmes = [
  'README.md',
  'README.ru.md',
  'README.nl.md',
  'README.zh.md',
  'README.he.md',
];
const readmeBrandMarkers = [
  '<div align="center">',
  'assets/brand/stolz-readme-light.png',
  'assets/brand/stolz-readme-dark.png',
  'actions/workflows/ci.yml/badge.svg',
  'shields.io/github/v/release/Sergey360/stolz-ai',
  'focused_skills-5',
  '](LICENSE)',
  'no_token-wasted',
];
const historicalLocalizedDocLinksOutsidePackage = new Set([
  'RELEASE_NOTES_TEMPLATE.md',
  'RUNTIME_PROVIDER_CAPABILITY_MATRIX.md',
]);

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
  assert.match(russian, /Ни одного лишнего токена/);
  assert.match(readme, /five core skills/i);
});

test('root READMEs preserve the branded multilingual GitHub presentation', async () => {
  for (const document of rootReadmes) {
    const text = await readFile(document, 'utf8');
    assert.ok(text.split(/\r?\n/).length >= 80, `${document} looks abbreviated`);
    for (const marker of readmeBrandMarkers) {
      assert.ok(text.includes(marker), `${document} is missing ${marker}`);
    }

    const languageLinks = new Set(text.match(/README(?:\.(?:ru|nl|zh|he))?\.md/g) ?? []);
    assert.ok(languageLinks.size >= 4, `${document} is missing multilingual navigation`);
  }

  await Promise.all([
    access('assets/brand/stolz-readme-light.png'),
    access('assets/brand/stolz-readme-dark.png'),
  ]);
});

test('public documents have valid local links and no internal process residue', async () => {
  const forbidden = /lab\.it360\.ru|C:\\Sergey|PRIVATE-TOKEN|glpat-|github_pat_/i;
  for (const document of publicDocuments.filter((document) => document !== 'CHANGELOG.md')) {
    const text = await readFile(document, 'utf8');
    assert.doesNotMatch(text, forbidden, `${document} contains internal process language`);
    for (const target of localTargets(text)) {
      const path = target.split('#')[0];
      if (document.startsWith('docs/README.') && historicalLocalizedDocLinksOutsidePackage.has(path)) continue;
      if (path) await access(resolve(dirname(document), decodeURIComponent(path)));
    }
  }
});

test('public documentation preserves the exact v0.8 evidence and lifecycle boundaries', async () => {
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
  assert.match(combined, /status/);
  assert.match(combined, /doctor/);
  assert.match(combined, /rollback/);
  assert.match(combined, /uninstall/);
  assert.doesNotMatch(combined, /general v0\.8\.0 savings|универсальн\w+ экономи\w+ v0\.8\.0/i);
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
    'contracts/multi-runtime-evidence-v0.7/',
    'fixtures/benchmark-v3/',
    'reports/verified-reuse/',
    'tools/context-state-benchmark.mjs',
    'docs/GOAL_REVIEW_',
    'docs/IMPLEMENTATION_PLAN_',
    'docs/RELEASE_READINESS_',
    'docs/SDLC_',
  ];
  for (const path of paths) {
    assert.equal(forbiddenPrefixes.some((prefix) => path.startsWith(prefix)), false, `${path} is private release-control material`);
  }
});

test('npm package contains the approved product files, setup docs, and public smoke, not project tests', async () => {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : 'npm';
  const args = npmExecPath
    ? [npmExecPath, 'pack', '--dry-run', '--json', '--ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const { stdout } = await execFileAsync(command, args);
  const packed = JSON.parse(stdout)[0];
  const paths = packed.files.map((entry) => entry.path);

  assert.equal(packed.name, 'stolz-ai');
  assert.equal(packed.version, '0.14.0');
  assert.equal(packed.entryCount, 197);
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
    'reports/benchmark-v3/real/v014-sol-xhigh-reads-navigation.json',
    'reports/benchmark-v3/real/v014-sol-xhigh-build-check-invalidation.json',
    'reports/benchmark-v3/real/v014-sol-xhigh-multi-step-state-transition.json',
    'reports/benchmark-v3/real/v014-astra-medium-multi-step-state-transition.json',
    'reports/benchmark-v3/real/v014-summary.json',
    'reports/benchmark-v3/real/v014-summary.md',
    'profiles/claude-code-minimal.v3.json',
    'fixtures/runtime-adapters/claude-code/c2.sanitized-telemetry.json',
    'fixtures/runtime-adapters/qwen-code/c2.sanitized-telemetry.json',
    'tools/c3-provider-pair-admission.mjs',
    'contracts/install-lifecycle-manifest.schema.json',
    'tools/profile-lifecycle.mjs',
    'tools/runtime-lifecycle.mjs',
    'tools/runtime-telemetry/c2-adapter.mjs',
    'tools/runtime-telemetry/claude-code-c2.mjs',
    'tools/runtime-telemetry/qwen-code-c2.mjs',
    'tools/codex-local-state.mjs',
    'tools/context-ledger.mjs',
    'tools/quiet-state-controller.mjs',
    'benchmarks/skill-selection-v012/adjudications.json',
    'benchmarks/skill-selection-v012/corpus-heldout-b.json',
    'benchmarks/skill-selection-v012/corpus.json',
    'benchmarks/skill-selection-v012/results.json',
    'benchmarks/skill-selection-v012/results.md',
    'tools/skill-selection-eval.mjs',
    'tools/skill-selection-report.mjs',
    'contracts/profile-lock.schema.json',
    'docs/architecture.md',
    'docs/benchmarking.md',
    'docs/installation.md',
    'docs/PILOT_JOURNAL_TEMPLATE.md',
    'examples/verify-public-package.mjs',
  ]) assert.ok(paths.includes(path), `${path} must be packed`);

  const expectedInventory = (await readFile('.github/releases/stolz-ai-0.14.0.tgz.inventory.txt', 'utf8'))
    .trim().split(/\r?\n/).map((path) => path.replace(/^package\//, '')).sort();
  assert.deepEqual([...paths].sort(), expectedInventory, 'public source reproduces the private release inventory');
  for (const skill of ['stolz-benchmark', 'stolz-context', 'stolz-quiet-state', 'stolz-reuse', 'stolz-route']) {
    const entrypoint = `skills/${skill}/SKILL.md`;
    assert.ok(paths.includes(entrypoint));
    const text = await readFile(entrypoint, 'utf8');
    for (const [, target] of text.matchAll(/\[[^\]]+\]\((references\/[^)]+)\)/g)) {
      assert.ok(paths.includes(`skills/${skill}/${target}`), `${entrypoint} reference ${target} must be packed`);
    }
  }
  assert.deepEqual(paths.filter((path) => path.startsWith('docs/')).sort(), [
    'docs/PILOT_JOURNAL_TEMPLATE.md',
    'docs/README.he.md',
    'docs/README.nl.md',
    'docs/README.ru.md',
    'docs/README.zh.md',
    'docs/architecture.md',
    'docs/benchmarking.md',
    'docs/installation.md',
  ]);
  assert.equal(paths.some((path) => path.startsWith('test/')), false);
  assert.equal(paths.some((path) => path.startsWith('benchmarks/v3/')), false);
  assert.equal(paths.some((path) => path.startsWith('contracts/multi-runtime-evidence-v0.7/')), false);
  assert.equal(paths.some((path) => path.startsWith('fixtures/benchmark-v3/')), false);
  assert.equal(paths.some((path) => path.startsWith('reports/verified-reuse/')), false);
  assert.equal(paths.some((path) => path === 'tools/context-state-benchmark.mjs'), false);
  assert.equal(paths.some((path) => path.startsWith('benchmarks/context-state-v0.6/')), false);
});

test('v0.8 public-release evidence records the private-validated archive identity', async () => {
  const checksum = await readFile('.github/releases/stolz-ai-0.8.0.tgz.sha256', 'utf8');
  const inventory = await readFile('.github/releases/stolz-ai-0.8.0.tgz.inventory.txt', 'utf8');
  assert.match(checksum, /^c6ee64dfcb247f8fa0880d59469f30b4af688c2829bbc323bd9ed4ad725189f9\s+stolz-ai-0\.8\.0\.tgz/m);
  assert.equal(inventory.trim().split(/\r?\n/).length, 149);
  assert.match(inventory, /package\/contracts\/install-lifecycle-manifest\.schema\.json/);
  assert.match(inventory, /package\/tools\/profile-lifecycle\.mjs/);
});

test('v0.12 public-release evidence records the private archive and bounded live gate', async () => {
  const checksum = await readFile('.github/releases/stolz-ai-0.12.0.tgz.sha256', 'utf8');
  const inventory = await readFile('.github/releases/stolz-ai-0.12.0.tgz.inventory.txt', 'utf8');
  const report = JSON.parse(await readFile('benchmarks/skill-selection-v012/results.json', 'utf8'));
  assert.match(checksum, /^b5c04072774c0b78c99893b82e4312643c0390b2be704babcb31a27a2ebd1f9a\s+stolz-ai-0\.12\.0\.tgz/m);
  assert.equal(inventory.trim().split(/\r?\n/).length, 181);
  assert.equal(report.total_attempts, 68);
  assert.equal(report.release_gate.passed, true);
  assert.equal(report.release_gate.observed.route_correct, 23);
  assert.equal(report.release_gate.observed.outcome_correct, 24);
  assert.equal(report.release_gate.observed.permission_correct, 24);
});

test('v0.13 public-release evidence records the exact private archive and both platform smokes', async () => {
  const checksum = await readFile('.github/releases/stolz-ai-0.13.0.tgz.sha256', 'utf8');
  const inventory = await readFile('.github/releases/stolz-ai-0.13.0.tgz.inventory.txt', 'utf8');
  const linux = JSON.parse(await readFile('.github/releases/public-package-smoke-linux.json', 'utf8'));
  const windows = JSON.parse(await readFile('.github/releases/public-package-smoke-windows.json', 'utf8'));
  assert.match(checksum, /^05645ff2d899dee7a8c3231c04e069a11f7e6bccb044509f9d39e58f1b34c82c\s+stolz-ai-0\.13\.0\.tgz/m);
  assert.equal(inventory.trim().split(/\r?\n/).length, 191);
  assert.equal(linux.status, 'passed');
  assert.equal(linux.node_version, 'v22.22.2');
  assert.equal(windows.status, 'passed');
  assert.equal(windows.node_version, 'v22.22.2');
  assert.deepEqual(windows.scenarios, linux.scenarios);
});

test('v0.14 public-release evidence records the exact private archive, both platform smokes, and bounded result', async () => {
  const checksum = await readFile('.github/releases/stolz-ai-0.14.0.tgz.sha256', 'utf8');
  const inventory = await readFile('.github/releases/stolz-ai-0.14.0.tgz.inventory.txt', 'utf8');
  const linux = JSON.parse(await readFile('.github/releases/public-package-smoke-linux-v0.14.0.json', 'utf8'));
  const windows = JSON.parse(await readFile('.github/releases/public-package-smoke-windows-v0.14.0.json', 'utf8'));
  const summary = JSON.parse(await readFile('reports/benchmark-v3/real/v014-summary.json', 'utf8'));
  assert.match(checksum, /^8437e0ddfe6c3a1cc97ad6a05e08f87ab8b6f0235e79d9a856d7789212dfd201\s+stolz-ai-0\.14\.0\.tgz/m);
  assert.equal(inventory.trim().split(/\r?\n/).length, 197);
  assert.equal(linux.status, 'passed');
  assert.equal(linux.node_version, 'v22.22.2');
  assert.equal(windows.status, 'passed');
  assert.equal(windows.package_version, '0.14.0');
  assert.deepEqual(windows.scenarios, linux.scenarios);
  assert.equal(summary.attempt_accounting.started, 40);
  assert.equal(summary.attempt_accounting.included, 40);
  assert.equal(summary.attempt_accounting.excluded, 0);
  assert.equal(summary.general_claim, 'withheld');
  assert.deepEqual(summary.series.map(({ routes }) => routes.delta_baseline_minus_stolz.comparable_input_plus_output_tokens), [
    -208689,
    -207733,
    -214706,
    -208111,
  ]);
});

test('GitHub CI runs full public checks with read-only permissions', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run benchmark:check/);
  assert.match(workflow, /npm run benchmark:v2:check/);
  assert.match(workflow, /--verify-report reports\/benchmark-v3\/real\/reads-navigation\.json --check/);
  assert.match(workflow, /--verify-report reports\/benchmark-v3\/real\/v014-sol-xhigh-reads-navigation\.json --check/);
  assert.match(workflow, /--verify-report reports\/benchmark-v3\/real\/v014-astra-medium-multi-step-state-transition\.json --check/);
  assert.match(workflow, /npm run smoke:public-package/);
  assert.match(workflow, /npm pack --dry-run --json --ignore-scripts/);
  assert.match(workflow, /sha256sum --check \.github\/releases\/stolz-ai-0\.14\.0\.tgz\.sha256/);
  assert.doesNotMatch(workflow, /npm run build/);
});
