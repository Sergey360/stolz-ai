import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const V030_PAYLOAD_SHA = 'f4f0814ef0eec9fb03868c2caae6f9ac642661dd';
const V030_TAG_COMMIT = 'c205d2f392e19ff0ba6e6dd4c4a322b082419d59';
const V031_TAG_COMMIT = 'f1bf1b2e4b80ade83db3999d7a3d45e37b6dd3e2';
const SUPPORT_CEILING = /C0\/C1 supported; C2\/C3\s+withheld\/unavailable\./;
const RETAINED_PROVENANCE_PATHS = Object.freeze([
  'fixtures/runtime-adapters/claude-code/c0.fixture.json',
  'fixtures/runtime-adapters/claude-code/c2.sanitized-telemetry.json',
  'fixtures/runtime-adapters/claude-code/settings-provenance.json',
  'fixtures/runtime-adapters/qwen-code/c0.fixture.json',
  'fixtures/runtime-adapters/qwen-code/c2.sanitized-telemetry.json',
  'fixtures/runtime-adapters/qwen-code/settings-provenance.json',
]);
const OVERLAY_PATHS = Object.freeze([
  'overlays/alibaba-model-studio.selected.json',
  'overlays/alibaba-model-studio.unavailable.json',
  'overlays/anthropic-api.selected.json',
  'overlays/anthropic-api.unavailable.json',
  'overlays/zai.selected.json',
  'overlays/zai.unavailable.json',
]);
const V04_SCHEMA_CORE_PATHS = Object.freeze([
  'contracts/benchmark-v3/attempt.schema.json',
  'contracts/benchmark-v3/common.schema.json',
  'contracts/benchmark-v3/evidence-provenance.schema.json',
  'contracts/benchmark-v3/pair.schema.json',
  'contracts/benchmark-v3/pilot-manifest.schema.json',
  'contracts/benchmark-v3/pricing-identity.schema.json',
  'contracts/benchmark-v3/report-admission.schema.json',
  'contracts/benchmark-v3/report.schema.json',
  'contracts/benchmark-v3/responses-usage.schema.json',
  'contracts/benchmark-v3/runtime-measurement.schema.json',
  'tools/benchmark-v3-schema-registry.mjs',
  'tools/benchmark-v3-validator.mjs',
]);
const V04_RUNTIME_ADAPTER_PATHS = Object.freeze([
  'adapters/benchmark-v3/claude-code.capability.json',
  'adapters/benchmark-v3/codex-local.capability.json',
  'adapters/benchmark-v3/qwen-code.capability.json',
  'adapters/benchmark-v3/registry.mjs',
  'adapters/benchmark-v3/runtime-adapter.mjs',
]);
const V04_RESPONSES_COLLECTOR_PATHS = Object.freeze([
  'tools/responses-collector.mjs',
]);
const V04_CODEX_JSONL_PATHS = Object.freeze([
  'contracts/benchmark-v3/codex-jsonl-usage.schema.json',
  'contracts/benchmark-v3/evidence-provenance-codex.schema.json',
  'tools/codex-jsonl-collector.mjs',
  'reports/benchmark-v3/real/build-check-invalidation.json',
  'reports/benchmark-v3/real/quiet-wait-transition.json',
  'reports/benchmark-v3/real/reads-navigation.json',
]);
const V04_ADMISSION_PATHS = Object.freeze([
  'tools/benchmark-v3-admission.mjs',
  'tools/benchmark-v3-cli.mjs',
  'reports/benchmark-v3/build-check-invalidation.json',
  'reports/benchmark-v3/quiet-wait-transition.json',
  'reports/benchmark-v3/reads-navigation.json',
]);
const V07_C2_ADAPTER_PATHS = Object.freeze([
  'tools/runtime-telemetry/c2-adapter.mjs',
  'tools/runtime-telemetry/claude-code-c2.mjs',
  'tools/runtime-telemetry/qwen-code-c2.mjs',
]);
const V07_LIFECYCLE_PATHS = Object.freeze([
  'tools/runtime-lifecycle.mjs',
]);
const V07_C3_ADMISSION_PATHS = Object.freeze([
  'tools/c3-provider-pair-admission.mjs',
]);
const V09_LOCAL_STATE_PATHS = Object.freeze([
  'contracts/context-state-v0.6/delta-context.schema.json',
  'contracts/context-state-v0.6/evidence-claim.schema.json',
  'contracts/context-state-v0.6/quiet-state.schema.json',
  'contracts/context-state-v0.6/read-fragment-ledger.schema.json',
  'contracts/context-state-v0.6/registry.json',
  'contracts/context-state-v0.6/runtime-route.schema.json',
  'contracts/verified-reuse/identity.schema.json',
  'contracts/verified-reuse/policy.schema.json',
  'contracts/verified-reuse/registry.json',
  'tools/codex-local-state.mjs',
  'tools/context-ledger.mjs',
  'tools/context-state.mjs',
  'tools/quiet-state-controller.mjs',
  'tools/verified-reuse/artifact-store.mjs',
  'tools/verified-reuse/identity.mjs',
  'tools/verified-reuse/ledger.mjs',
  'tools/verified-reuse/policy.mjs',
]);
const V04_ADDITIONAL_PRODUCTION_PATHS = Object.freeze([
  ...V04_SCHEMA_CORE_PATHS,
  ...V04_RUNTIME_ADAPTER_PATHS,
  ...V04_RESPONSES_COLLECTOR_PATHS,
  ...V04_CODEX_JSONL_PATHS,
  ...V04_ADMISSION_PATHS,
  ...V07_C2_ADAPTER_PATHS,
  ...V07_LIFECYCLE_PATHS,
  ...V07_C3_ADMISSION_PATHS,
]);
const LIFECYCLE_SCRIPTS = new Set([
  'preinstall', 'install', 'postinstall',
  'prepack', 'postpack', 'prepare',
  'prepublish', 'prepublishOnly', 'publish', 'postpublish',
  'preversion', 'version', 'postversion'
]);

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) return { command: process.execPath, args: [npmExecPath, ...args] };
  if (process.platform === 'win32') {
    const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return { command: process.execPath, args: [npmCli, ...args] };
  }
  return { command: 'npm', args };
}

async function packageDryRun() {
  const packArgs = ['pack', '--dry-run', '--json', '--ignore-scripts'];
  const { command, args } = npmInvocation(packArgs);
  const { stdout } = await execFileAsync(command, args);
  return JSON.parse(stdout)[0];
}

async function extractedPackage() {
  const directory = await mkdtemp(join(tmpdir(), 'stolz-v033-package-'));
  const packArgs = ['pack', '--json', '--ignore-scripts', '--pack-destination', directory];
  const { command, args } = npmInvocation(packArgs);
  const { stdout } = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
  const packed = JSON.parse(stdout)[0];
  await execFileAsync('tar', ['-xzf', join(directory, packed.filename), '-C', directory]);
  return { directory, root: join(directory, 'package'), packed };
}

async function packagedJson(root, relativeScript, args = []) {
  const { stdout } = await execFileAsync(process.execPath, [relativeScript, ...args], {
    cwd: root,
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function assertLocalLinks(documentPath, text) {
  const targets = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !target.startsWith('#') && !/^[a-z]+:\/\//i.test(target));
  for (const target of targets) {
    const path = target.split('#')[0];
    if (path) await access(resolve(dirname(documentPath), decodeURIComponent(path)));
  }
}

test('v0.6.0 distribution metadata retains the dev-only AJV remediation and runtime boundaries', async () => {
  const [pkg, lock, attributes] = await Promise.all([
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile('package-lock.json', 'utf8').then(JSON.parse),
    readFile('.gitattributes', 'utf8')
  ]);

  assert.equal(pkg.version, '0.9.0');
  assert.equal(lock.version, '0.9.0');
  assert.equal(lock.packages[''].version, '0.9.0');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.deepEqual(pkg.dependencies, { ajv: '8.20.0' });
  assert.deepEqual(lock.packages[''].dependencies, { ajv: '8.20.0' });
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(lock.packages[''].devDependencies, undefined);
  assert.equal(lock.packages['node_modules/ajv'].version, '8.20.0');
  assert.equal(lock.packages['node_modules/ajv'].dev, undefined);
  assert.deepEqual(
    Object.keys(lock.packages).sort(),
    ['', 'node_modules/ajv', 'node_modules/fast-deep-equal', 'node_modules/fast-uri', 'node_modules/json-schema-traverse', 'node_modules/require-from-string'],
    'the lockfile may contain only AJV and its dependency graph'
  );
  for (const script of Object.keys(pkg.scripts ?? {})) {
    assert.equal(LIFECYCLE_SCRIPTS.has(script), false, `${script} must not be a lifecycle/publish script`);
  }

  const draftSuites = await Promise.all([
    readFile('test/runtime-certification-draft-2020-12.test.mjs', 'utf8'),
    readFile('test/provider-evidence-admission.test.mjs', 'utf8')
  ]);
  assert.doesNotMatch(draftSuites.join('\n'), /\$data\s*:/, '$data must remain disabled');
});

test('v0.3.3 readiness, notes, and changelog preserve immutable predecessors and bounded NO-GO', async () => {
  const [readiness, notes, changelog] = await Promise.all([
    readFile('docs/RELEASE_READINESS_V0.3.md', 'utf8'),
    readFile('docs/RELEASE_NOTES_V0.3.md', 'utf8'),
    readFile('CHANGELOG.md', 'utf8')
  ]);

  for (const artifact of [readiness, notes, changelog]) {
    assert.match(artifact, SUPPORT_CEILING);
    assert.match(artifact, /NO-GO/i);
    assert.doesNotMatch(artifact, /provider-token-saving (?:is|was) (?:proven|certified|achieved)/i);
  }

  assert.match(readiness, new RegExp(V030_PAYLOAD_SHA));
  assert.match(readiness, new RegExp(V030_TAG_COMMIT));
  assert.match(readiness, /pipeline 6296/i);
  assert.match(readiness, /MR !73/i);
  assert.match(readiness, /v0\.3\.1/);
  assert.match(readiness, new RegExp(V031_TAG_COMMIT));
  assert.match(readiness, /pipeline 6314/i);
  assert.match(readiness, /#182/);
  assert.match(readiness, /#183/);
  assert.match(readiness, /v0\.3\.2/);
  assert.match(readiness, /v0\.3\.3/);
  assert.match(readiness, /#188/);
  assert.match(readiness, /#189/);
  assert.match(readiness, /Issue\s+\[#164\]|Issue #164|#164/);
  assert.match(readiness, /manual `dev` to `main`/i);
  assert.match(readiness, /separate production\/publication approval/i);
  assert.match(readiness, /sha256sum stolz-ai-0\.3\.3\.tgz/);
  assert.match(readiness, /authenticated package and checksum downloads/i);
  assert.match(readiness, /anonymous denial/i);
  assert.match(readiness, /rollback, backup, and hypercare procedure/i);
  assert.match(readiness, /visibility: private/);
  assert.match(readiness, /public_jobs: false/);
  assert.match(readiness, /GitHub publication\/mirroring remains excluded/i);
  assert.match(readiness, /unmet_requirements: \[\]/);
  assert.match(notes, new RegExp(V030_TAG_COMMIT));
  assert.match(notes, new RegExp(V031_TAG_COMMIT));
  assert.match(notes, /pipeline 6296/i);
  assert.match(notes, /pipeline 6314/i);
  assert.match(notes, /v0\.3\.2/);
  assert.match(notes, /v0\.3\.3/);
  assert.match(notes, /Claude Code 2\.1\.251/);
  assert.match(notes, /Qwen Code 0\.22\.3/);
  await Promise.all([
    assertLocalLinks('docs/RELEASE_READINESS_V0.3.md', readiness),
    assertLocalLinks('docs/RELEASE_NOTES_V0.3.md', notes)
  ]);
});

test('v0.3 package inventory contains only declared production surfaces', async () => {
  const [packed, attributes] = await Promise.all([
    packageDryRun(),
    readFile('.gitattributes', 'utf8')
  ]);
  const paths = packed.files.map((entry) => entry.path);

  assert.equal(packed.name, 'stolz-ai');
  assert.equal(packed.version, '0.9.0');
  assert.equal(paths.length, 115 + V04_ADDITIONAL_PRODUCTION_PATHS.length + V09_LOCAL_STATE_PATHS.length);
  assert.equal(paths.includes('package-lock.json'), false);

  for (const path of V04_ADDITIONAL_PRODUCTION_PATHS) assert.ok(paths.includes(path), `${path} is part of the versioned v0.4 surface`);
  for (const path of V09_LOCAL_STATE_PATHS) assert.ok(paths.includes(path), `${path} is part of the explicit v0.9 local-state surface`);
  for (const path of ['contracts/install-lifecycle-manifest.schema.json', 'tools/profile-lifecycle.mjs']) assert.ok(paths.includes(path), `${path} is part of the v0.8 lifecycle surface`);
  assert.equal(paths.some((path) => path.startsWith('fixtures/benchmark-v3/')), false, 'benchmark-v3 test fixtures stay outside the package');

  assert.deepEqual(paths.filter((path) => path.startsWith('fixtures/')).sort(), [...RETAINED_PROVENANCE_PATHS].sort());
  assert.deepEqual(paths.filter((path) => path.startsWith('overlays/')).sort(), [...OVERLAY_PATHS].sort());

  const forbidden = [
    /^(?:test|docs|collectors|evidence)\//,
    /^(?:node_modules|dist)\//,
    /(?:^|\/)(?:\.env(?:\.|$)|local-state(?:\/|$))/,
    /\.(?:pem|key|p12)$/i
  ];
  for (const path of paths) {
    for (const pattern of forbidden) assert.doesNotMatch(path, pattern, `${path} must not be packed`);
  }

  const adapterFamilies = [...new Set(paths
    .filter((path) => path.startsWith('adapters/'))
    .map((path) => path.split('/')[1]))].sort();
  assert.deepEqual(adapterFamilies, ['benchmark-v3', 'claude-code', 'codex', 'conformance', 'qwen-code']);
  assert.ok(paths.includes('tools/integrations/registry.mjs'));
  assert.equal(paths.some((path) => /^tools\/integrations\/(?!registry\.mjs$)/.test(path)), false);

  assert.deepEqual(
    attributes.trim().split(/\r?\n/),
    [
      '* text=auto eol=lf',
      '',
      '*.gif binary',
      '*.ico binary',
      '*.jpg binary',
      '*.jpeg binary',
      '*.png binary',
      '*.pdf binary',
      '*.tgz binary',
      '*.zip binary'
    ],
    'the package newline policy must remain complete, explicit, and CI-image independent'
  );
  const textPaths = paths.filter((path) => /(?:^|\/)(?:[^/]+\.(?:json|md|mjs)|LICENSE|NOTICE)$/.test(path));
  assert.ok(textPaths.length > 0);
  for (const path of textPaths) {
    assert.doesNotMatch(path, /\.(?:gif|ico|jpe?g|png|pdf|tgz|zip)$/i, `${path} must use the global LF text rule`);
  }
});

test('v0.6.0 extracted archive resolves, installs, overlays, and conforms without provider calls', async (context) => {
  const extracted = await extractedPackage();
  context.after(() => rm(extracted.directory, { recursive: true, force: true }));
  assert.equal(extracted.packed.version, '0.9.0');
  assert.equal(extracted.packed.entryCount, 115 + V04_ADDITIONAL_PRODUCTION_PATHS.length + V09_LOCAL_STATE_PATHS.length);

  for (const runtime of ['claude-code', 'qwen-code']) {
    const resolved = await packagedJson(extracted.root, 'tools/profile-cli.mjs', ['resolve', '--runtime', runtime]);
    assert.equal(resolved.resolution, 'profile');
    assert.equal(resolved.certified, true);
    assert.equal(resolved.runtime, runtime);
    assert.deepEqual(resolved.core_skills, ['stolz-context', 'stolz-reuse', 'stolz-quiet-state', 'stolz-route', 'stolz-benchmark']);

    const destination = join(extracted.directory, `install-${runtime}`, runtime === 'claude-code' ? '.claude' : '.qwen', 'skills');
    const installed = await packagedJson(extracted.root, 'tools/profile-cli.mjs', ['install', '--runtime', runtime, '--destination', destination]);
    assert.equal(installed.resolution.resolution, 'profile');
    assert.equal(installed.install.dry_run, false);
    assert.equal(installed.install.files.length, 5);
    await access(join(destination, 'install-manifest.json'));
    await Promise.all(installed.install.files.map((source) => access(join(destination, source.slice('skills/'.length)))));
  }

  for (const [runtime, provider] of [
    ['claude-code', 'anthropic-api'],
    ['qwen-code', 'alibaba-model-studio'],
    ['qwen-code', 'zai'],
  ]) {
    const resolved = await packagedJson(extracted.root, 'tools/profile-cli.mjs', ['resolve', '--runtime', runtime, '--provider', provider]);
    assert.equal(resolved.resolution, 'profile');
    assert.equal(resolved.provider_overlay.overlay_id, provider);
    assert.equal(resolved.provider_overlay.availability, 'selected');
  }

  for (const adapter of ['codex-local', 'claude-code', 'qwen-code']) {
    const report = await packagedJson(extracted.root, 'tools/adapter-conformance.mjs', [adapter]);
    assert.equal(report.certified, true);
    assert.ok(report.checks.length > 0);
    assert.equal(report.checks.every(({ passed }) => passed), true);
  }
});
