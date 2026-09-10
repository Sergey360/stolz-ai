import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  BENCHMARK_V3_RUNTIME_ADAPTERS,
  resolveBenchmarkV3RuntimeAdapter,
} from '../adapters/benchmark-v3/registry.mjs';
import { RUNTIME_METRIC_NAMES } from '../adapters/benchmark-v3/runtime-adapter.mjs';
import { installProfile } from '../tools/profile-installer.mjs';
import { resolveProfile, UNIVERSAL_SKILLS } from '../tools/profile-resolver.mjs';
import {
  sealBenchmarkV3Record,
  validateBenchmarkV3Record,
} from '../tools/benchmark-v3-validator.mjs';

const FIXTURE_PATHS = Object.freeze({
  'codex-local': 'fixtures/benchmark-v3/runtime/codex-local.runtime-event.json',
  'claude-code': 'fixtures/benchmark-v3/runtime/claude-code.runtime-event.json',
  'qwen-code': 'fixtures/benchmark-v3/runtime/qwen-code.runtime-event.json',
});
const EXPECTED_ADAPTERS = Object.freeze(['claude-code', 'codex-local', 'qwen-code']);

const parse = async (path) => JSON.parse(await readFile(path, 'utf8'));
const clone = (value) => structuredClone(value);

async function captureFixture(adapterId) {
  const input = await parse(FIXTURE_PATHS[adapterId]);
  return { input, bundle: resolveBenchmarkV3RuntimeAdapter(adapterId).captureEvent(input) };
}

test('Codex, Claude Code, and Qwen Code expose closed versioned runtime-only capability maps', () => {
  assert.deepEqual(Object.keys(BENCHMARK_V3_RUNTIME_ADAPTERS).sort(), [...EXPECTED_ADAPTERS].sort());
  assert.equal(resolveBenchmarkV3RuntimeAdapter('not-declared'), null);

  for (const adapterId of EXPECTED_ADAPTERS) {
    const capability = resolveBenchmarkV3RuntimeAdapter(adapterId).getCapability();
    assert.equal(capability.schema_id, 'benchmark-v3-runtime-adapter-capability');
    assert.equal(capability.schema_version, '1.0.0');
    assert.equal(capability.track, 'runtime_measured');
    assert.equal(capability.adapter_id, adapterId);
    assert.match(capability.adapter_version, /^[1-9]\d*\.\d+\.\d+$/);
    assert.match(capability.observer.version, /^[1-9]\d*\.\d+\.\d+$/);
    assert.match(capability.capability_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(capability.metrics), [...RUNTIME_METRIC_NAMES]);
    assert.equal(capability.redaction.payload_retention, 'excluded');
    assert.doesNotMatch(JSON.stringify(capability), /provider_native|input_tokens|output_tokens|cached_tokens|billing|pricing|currency/i);
  }
});

test('all sanitized runtime fixtures emit valid deterministic measurement and provenance records', async () => {
  for (const adapterId of EXPECTED_ADAPTERS) {
    const { input, bundle } = await captureFixture(adapterId);
    const repeated = resolveBenchmarkV3RuntimeAdapter(adapterId).captureEvent(input);
    assert.deepEqual(repeated, bundle, `${adapterId} capture is deterministic`);
    assert.equal(bundle.status, 'captured');
    assert.equal(bundle.track, 'runtime_measured');
    assert.equal(bundle.measurement.track, 'runtime_measured');
    assert.equal(bundle.provenance.track, 'runtime_measured');
    assert.equal(bundle.provenance.capture_method, 'runtime_event');
    assert.equal(bundle.provenance.tuple.provider_id, 'not_observed');
    assert.equal(bundle.provenance.tuple.model_configuration, 'not_observed');
    assert.equal(bundle.provenance.admission.disposition, 'withheld');
    assert.notEqual(bundle.provenance.raw_evidence_sha256, bundle.provenance.retained_evidence_sha256);
    assert.deepEqual(bundle.measurement.metrics.map(({ name }) => name), [...RUNTIME_METRIC_NAMES]);

    for (const record of [bundle.measurement, bundle.provenance]) {
      const result = await validateBenchmarkV3Record(record);
      assert.equal(result.valid, true, `${adapterId}/${record.schema_id}: ${JSON.stringify(result.errors)}`);
    }
  }
});

test('missing runtime counters remain unknown or unavailable and are never zero-filled', async () => {
  const bundles = Object.fromEntries(await Promise.all(EXPECTED_ADAPTERS.map(async (adapterId) => [
    adapterId,
    (await captureFixture(adapterId)).bundle,
  ])));
  const metric = (adapterId, name) => bundles[adapterId].measurement.metrics.find((entry) => entry.name === name);

  assert.deepEqual(
    { availability: metric('codex-local', 'compaction_events').availability, hasValue: Object.hasOwn(metric('codex-local', 'compaction_events'), 'value') },
    { availability: 'unknown', hasValue: false },
  );
  for (const name of ['model_wakeups', 'compaction_events']) {
    assert.equal(metric('claude-code', name).availability, 'unavailable');
    assert.equal(Object.hasOwn(metric('claude-code', name), 'value'), false);
  }
  assert.equal(metric('qwen-code', 'tool_output_bytes').availability, 'unknown');
  assert.equal(Object.hasOwn(metric('qwen-code', 'tool_output_bytes'), 'value'), false);
  assert.equal(metric('qwen-code', 'compaction_events').availability, 'unavailable');
  assert.equal(Object.hasOwn(metric('qwen-code', 'compaction_events'), 'value'), false);

  for (const bundle of Object.values(bundles)) {
    for (const fact of bundle.measurement.metrics.filter(({ availability }) => availability !== 'available')) {
      assert.equal(Object.hasOwn(fact, 'value'), false, `${bundle.capability.adapter_id}/${fact.name}`);
      assert.equal(typeof fact.reason, 'string');
      assert.ok(fact.reason.length > 0);
    }
    const intervention = bundle.measurement.metrics.find(({ name }) => name === 'operator_interventions');
    assert.equal(intervention.availability, 'available');
    assert.equal(intervention.value, 0, 'an explicit observed zero remains distinct from an unavailable fact');
  }

  const qwenFixture = await parse(FIXTURE_PATHS['qwen-code']);
  qwenFixture.capture_scope = 'runtime_observation';
  qwenFixture.observations = {};
  const emptyCapture = resolveBenchmarkV3RuntimeAdapter('qwen-code').captureEvent(qwenFixture);
  assert.equal(emptyCapture.provenance.admission.disposition, 'unknown');
  assert.equal(emptyCapture.measurement.metrics.every((fact) => !Object.hasOwn(fact, 'value')), true);
});

test('missing and unsupported runtime or observer versions terminate visibly without evidence records', async () => {
  const fixture = await parse(FIXTURE_PATHS['codex-local']);
  const adapter = resolveBenchmarkV3RuntimeAdapter('codex-local');

  const missingRuntimeVersion = clone(fixture);
  delete missingRuntimeVersion.runtime_version;
  assert.deepEqual(
    { status: adapter.captureEvent(missingRuntimeVersion).status, reason: adapter.captureEvent(missingRuntimeVersion).reason },
    { status: 'unknown', reason: 'runtime_identity_or_version_unknown' },
  );

  const unsupportedRuntimeVersion = { ...clone(fixture), runtime_version: '99.0.0' };
  const unsupportedResult = adapter.captureEvent(unsupportedRuntimeVersion);
  assert.equal(unsupportedResult.status, 'unavailable');
  assert.equal(unsupportedResult.reason, 'runtime_tuple_not_supported');
  assert.equal(Object.hasOwn(unsupportedResult, 'measurement'), false);

  const missingObserverVersion = clone(fixture);
  delete missingObserverVersion.observer.version;
  const missingObserverResult = adapter.captureEvent(missingObserverVersion);
  assert.equal(missingObserverResult.status, 'unknown');
  assert.equal(missingObserverResult.reason, 'runtime_observer_identity_or_version_unknown');
  assert.equal(Object.hasOwn(missingObserverResult, 'provenance'), false);
});

test('private raw payload is excluded before retention while its raw identity remains distinct', async () => {
  const fixture = await parse(FIXTURE_PATHS['qwen-code']);
  const adapter = resolveBenchmarkV3RuntimeAdapter('qwen-code');
  const privateKey = ['author', 'ization'].join('');
  const firstPrivateValue = 'fixture-private-material-a';
  const secondPrivateValue = 'fixture-private-material-b';
  const first = adapter.captureEvent({
    ...clone(fixture),
    private_payload: { [privateKey]: ['Bearer', firstPrivateValue].join(' '), task_content: firstPrivateValue },
  });
  const second = adapter.captureEvent({
    ...clone(fixture),
    private_payload: { [privateKey]: ['Bearer', secondPrivateValue].join(' '), task_content: secondPrivateValue },
  });

  assert.notEqual(first.provenance.raw_evidence_sha256, second.provenance.raw_evidence_sha256);
  assert.equal(first.provenance.retained_evidence_sha256, second.provenance.retained_evidence_sha256);
  assert.deepEqual(first.measurement, second.measurement);
  assert.equal(first.provenance.redaction.findings_count, 1);
  assert.equal(first.retained_event.redaction.payload_retention, 'excluded');
  assert.doesNotMatch(JSON.stringify(first), new RegExp(firstPrivateValue, 'i'));
  assert.doesNotMatch(JSON.stringify(second), new RegExp(secondPrivateValue, 'i'));
  assert.equal((await validateBenchmarkV3Record(first.provenance)).valid, true);
});

test('provider usage, cache, Responses, pricing, and billing relabels fail closed', async () => {
  const fixture = await parse(FIXTURE_PATHS['codex-local']);
  const adapter = resolveBenchmarkV3RuntimeAdapter('codex-local');
  for (const mutation of [
    { provider_usage: { availability: 'available', value: 1 } },
    { input_tokens: 1 },
    { cached_tokens: 1 },
    { billing: { amount: 1 } },
    { pricing: { currency: 'USD' } },
    { responses_export: { id: 'response-fixture' } },
    { private_payload: { provider_tokens: 1 } },
  ]) {
    assert.throws(() => adapter.captureEvent({ ...clone(fixture), ...mutation }), /provider-native usage or billing/);
  }

  const bundle = adapter.captureEvent(fixture);
  const relabeledMeasurement = sealBenchmarkV3Record({ ...clone(bundle.measurement), track: 'provider_native' });
  assert.equal((await validateBenchmarkV3Record(relabeledMeasurement)).valid, false);

  const relabeledProvenance = clone(bundle.provenance);
  relabeledProvenance.collector.id = 'responses-collector';
  relabeledProvenance.tuple.adapter_id = 'responses-collector';
  const resealedProvenance = sealBenchmarkV3Record(relabeledProvenance);
  assert.equal((await validateBenchmarkV3Record(resealedProvenance)).valid, false);
});

test('capability limits and canonical provenance identities fail closed under mutation', async () => {
  const claudeFixture = await parse(FIXTURE_PATHS['claude-code']);
  const claudeAdapter = resolveBenchmarkV3RuntimeAdapter('claude-code');
  const exceeded = clone(claudeFixture);
  exceeded.observations.model_wakeups = { availability: 'available', value: 1 };
  assert.throws(() => claudeAdapter.captureEvent(exceeded), /exceeds declared capability/);

  const bundle = claudeAdapter.captureEvent(claudeFixture);
  const staleIdentity = clone(bundle.provenance);
  staleIdentity.source.snapshot_sha256 = 'a'.repeat(64);
  assert.equal((await validateBenchmarkV3Record(staleIdentity)).valid, false, 'stale provenance identity is rejected');

  const crossedTuple = clone(bundle.provenance);
  crossedTuple.tuple.runtime_id = 'qwen-code';
  assert.equal((await validateBenchmarkV3Record(sealBenchmarkV3Record(crossedTuple))).valid, false, 'crossed runtime tuple is rejected');
});

test('v0.6.0 preserves the v0.3.4 five-skill install boundary', async (context) => {
  const [skillEntries, pkg, lock] = await Promise.all([
    readdir('skills', { withFileTypes: true }),
    parse('package.json'),
    parse('package-lock.json'),
  ]);
  const skillIds = skillEntries.filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();
  assert.deepEqual(skillIds, [...UNIVERSAL_SKILLS].sort());
  assert.equal(pkg.version, '0.9.0');
  assert.equal(lock.version, '0.9.0');
  assert.deepEqual(pkg.dependencies, { ajv: '8.20.0' });
  assert.deepEqual(pkg.exports, {
    './profile-resolver': './tools/profile-resolver.mjs',
    './profile-installer': './tools/profile-installer.mjs',
    './codex-local-state': './tools/codex-local-state.mjs',
  });
  assert.equal(pkg.files.some((path) => path.startsWith('fixtures/benchmark-v3')), false);

  for (const runtime of ['codex', 'claude-code', 'qwen-code']) {
    const resolution = await resolveProfile({ runtime, capabilities: { command_execution: true } });
    const root = await mkdtemp(join(tmpdir(), `stolz-v04-runtime-${runtime}-`));
    context.after(() => rm(root, { recursive: true, force: true }));
    const destination = runtime === 'codex'
      ? join(root, '.codex')
      : join(root, runtime === 'claude-code' ? '.claude' : '.qwen', 'skills');
    const installed = await installProfile(resolution, { destination });
    assert.equal(installed.files.length, 5, runtime);
    const actualSkills = runtime === 'codex'
      ? (await readdir(join(destination, 'skills'))).sort()
      : (await readdir(destination)).filter((name) => name !== 'install-manifest.json').sort();
    assert.deepEqual(actualSkills, [...UNIVERSAL_SKILLS].sort(), runtime);
    await assert.rejects(() => access(join(destination, 'adapters')));
    await assert.rejects(() => access(join(destination, 'benchmark-v3')));
  }
});
