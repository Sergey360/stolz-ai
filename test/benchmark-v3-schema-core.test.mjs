import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BENCHMARK_V3_RECORD_KEYS,
  BENCHMARK_V3_SCHEMA_REGISTRY,
  loadBenchmarkV3Schemas,
} from '../tools/benchmark-v3-schema-registry.mjs';
import {
  sealBenchmarkV3Record,
  validateBenchmarkV3Record,
} from '../tools/benchmark-v3-validator.mjs';

const FIXTURE_DIRECTORY = 'fixtures/benchmark-v3';
const EXPECTED_RECORD_KEYS = Object.freeze([
  'evidence-provenance@1.0.0',
  'evidence-provenance@1.1.0',
  'responses-usage@1.0.0',
  'codex-jsonl-usage@1.0.0',
  'runtime-measurement@1.0.0',
  'pricing-identity@1.0.0',
  'benchmark-attempt@3.0.0',
  'benchmark-pair@1.0.0',
  'pilot-manifest@1.0.0',
  'report-admission@1.0.0',
  'benchmark-report@3.0.0',
]);
const EXPECTED_SKILLS = Object.freeze([
  'stolz-benchmark',
  'stolz-context',
  'stolz-quiet-state',
  'stolz-reuse',
  'stolz-route',
]);

const clone = (value) => structuredClone(value);
const parse = async (path) => JSON.parse(await readFile(path, 'utf8'));

function segments(pointer) {
  assert.match(pointer, /^\//);
  return pointer.slice(1).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function applyChange(record, change) {
  const path = segments(change.path);
  const key = path.pop();
  let parent = record;
  for (const part of path) parent = parent[part];
  if (change.op === 'delete') {
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
    return;
  }
  assert.equal(change.op, 'set');
  parent[key] = clone(change.value);
}

async function expectRejected(name, record) {
  const result = await validateBenchmarkV3Record(record);
  assert.equal(result.valid, false, `${name}: ${JSON.stringify(result.errors)}`);
  assert.ok(result.errors.length > 0, `${name}: rejection contains a reason`);
}

test('the registry exposes the approved records plus the authorized Codex JSONL additions', async () => {
  assert.deepEqual([...BENCHMARK_V3_RECORD_KEYS].sort(), [...EXPECTED_RECORD_KEYS].sort());
  assert.deepEqual(Object.keys(BENCHMARK_V3_SCHEMA_REGISTRY).sort(), ['common@1.0.0', ...EXPECTED_RECORD_KEYS].sort());
  const schemas = await loadBenchmarkV3Schemas();
  assert.equal(schemas.length, 12);
  for (const entry of schemas) {
    assert.equal(entry.schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(entry.schema.$id, entry.uri);
    assert.equal(entry.schema.type, entry.schema_id === 'common' ? undefined : 'object');
    if (entry.record) assert.equal(entry.schema.additionalProperties, false, `${entry.filename} closes its root object`);
  }
});

test('all checked-in positive fixtures pass Draft 2020-12 and semantic admission', async () => {
  const names = (await readdir(FIXTURE_DIRECTORY)).filter((name) => name.endsWith('.valid.json')).sort();
  assert.equal(names.length, 13);
  const covered = new Set();
  for (const name of names) {
    const record = await parse(`${FIXTURE_DIRECTORY}/${name}`);
    const result = await validateBenchmarkV3Record(record);
    assert.equal(result.valid, true, `${name}: ${JSON.stringify(result.errors)}`);
    covered.add(`${record.schema_id}@${record.schema_version}`);
  }
  assert.deepEqual([...covered].sort(), [...EXPECTED_RECORD_KEYS].sort());
});

test('every mutation fixture fails closed after canonical identity is recomputed', async () => {
  const names = (await readdir(FIXTURE_DIRECTORY)).filter((name) => name.endsWith('.mutations.json')).sort();
  assert.equal(names.length, EXPECTED_RECORD_KEYS.length);
  let mutationCount = 0;
  for (const name of names) {
    const manifest = await parse(`${FIXTURE_DIRECTORY}/${name}`);
    const original = await parse(`${FIXTURE_DIRECTORY}/${manifest.fixture}`);
    assert.equal((await validateBenchmarkV3Record(original)).valid, true, `${manifest.fixture} is a valid mutation seed`);
    assert.ok(manifest.mutations.length >= 6, `${name} has a substantive mutation set`);
    for (const mutation of manifest.mutations) {
      let candidate = clone(original);
      for (const change of mutation.changes) applyChange(candidate, change);
      if (mutation.reseal !== false) candidate = sealBenchmarkV3Record(candidate);
      await expectRejected(`${name}: ${mutation.name}`, candidate);
      mutationCount += 1;
    }
  }
  assert.ok(mutationCount >= 68, `expected at least 68 focused mutations, received ${mutationCount}`);
});

test('every required root field, unknown field, version, and canonical identity fails closed', async () => {
  const schemas = await loadBenchmarkV3Schemas();
  const validNames = (await readdir(FIXTURE_DIRECTORY)).filter((name) => name.endsWith('.valid.json')).sort();
  const records = await Promise.all(validNames.map((name) => parse(`${FIXTURE_DIRECTORY}/${name}`)));
  for (const { schema_id: schemaId, schema_version: version, schema } of schemas.filter(({ record }) => record)) {
    const original = records.find((record) => record.schema_id === schemaId && record.schema_version === version);
    assert.ok(original, `${schemaId}@${version} positive fixture exists`);
    for (const key of schema.required) {
      const candidate = clone(original);
      delete candidate[key];
      await expectRejected(`${schemaId}: missing ${key}`, key === 'canonical_sha256' ? candidate : sealBenchmarkV3Record(candidate));
    }
    const extra = sealBenchmarkV3Record({ ...clone(original), unknown_field: 'closed' });
    await expectRejected(`${schemaId}: unknown field`, extra);
    const versionMutation = sealBenchmarkV3Record({ ...clone(original), schema_version: '99.0.0' });
    await expectRejected(`${schemaId}: unknown version`, versionMutation);
    const identityMutation = clone(original);
    identityMutation.canonical_sha256 = identityMutation.canonical_sha256 === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64);
    await expectRejected(`${schemaId}: identity mismatch`, identityMutation);
  }
});

test('provider-native and runtime-measured tracks remain disjoint at attempt boundaries', async () => {
  const [provider, runtime] = await Promise.all([
    parse(`${FIXTURE_DIRECTORY}/attempt.provider-native.valid.json`),
    parse(`${FIXTURE_DIRECTORY}/attempt.runtime-measured.valid.json`),
  ]);
  assert.equal(provider.provider_usage.availability, 'available');
  assert.equal(provider.runtime_measurement.availability, 'unavailable');
  assert.equal(runtime.runtime_measurement.availability, 'available');
  assert.equal(runtime.provider_usage.availability, 'unavailable');
  assert.equal(runtime.pricing.availability, 'unavailable');

  const relabeledProvider = clone(provider);
  relabeledProvider.track = 'runtime_measured';
  await expectRejected('provider attempt relabeled as runtime', sealBenchmarkV3Record(relabeledProvider));
  const relabeledRuntime = clone(runtime);
  relabeledRuntime.track = 'provider_native';
  await expectRejected('runtime attempt relabeled as provider', sealBenchmarkV3Record(relabeledRuntime));
});

test('withheld and unknown terminal facts stay visible without becoming zero', async () => {
  const [provenance, usage, pricing] = await Promise.all([
    parse(`${FIXTURE_DIRECTORY}/evidence-provenance.provider-native.valid.json`),
    parse(`${FIXTURE_DIRECTORY}/responses-usage.valid.json`),
    parse(`${FIXTURE_DIRECTORY}/pricing-identity.valid.json`),
  ]);

  provenance.redaction.result = 'failed';
  provenance.redaction.findings_count = 1;
  assert.equal((await validateBenchmarkV3Record(sealBenchmarkV3Record(provenance))).valid, true, 'failed redaction remains a withheld provenance record');

  const cacheWrite = usage.input_tokens_details.cache_write_tokens;
  cacheWrite.availability = 'unknown';
  cacheWrite.reason = 'Provider field was not retained.';
  delete cacheWrite.value;
  const uncached = usage.uncached_input_tokens;
  uncached.availability = 'unknown';
  uncached.reason = 'Cache partition dependency is unknown.';
  delete uncached.value;
  delete uncached.formula;
  delete uncached.component_ids;
  assert.equal((await validateBenchmarkV3Record(sealBenchmarkV3Record(usage))).valid, true, 'unknown usage has a reason and no fabricated value');

  const inputPrice = pricing.components.find(({ name }) => name === 'input_uncached');
  inputPrice.availability = 'unknown';
  inputPrice.reason = 'Price snapshot does not contain this component.';
  delete inputPrice.unit_price;
  pricing.final_cost_availability = { availability: 'unknown', reason: 'A billed component is unknown.' };
  assert.equal((await validateBenchmarkV3Record(sealBenchmarkV3Record(pricing))).valid, true, 'unknown component makes final cost explicitly unknown');
});

test('v0.6.0 keeps exactly five skills and the package/install dependency boundary', async () => {
  const [skillEntries, pkg, lock] = await Promise.all([
    readdir('skills', { withFileTypes: true }),
    parse('package.json'),
    parse('package-lock.json'),
  ]);
  const skills = skillEntries.filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();
  assert.deepEqual(skills, [...EXPECTED_SKILLS]);
  assert.equal(pkg.version, '0.9.0');
  assert.equal(lock.version, '0.9.0');
  assert.deepEqual(pkg.dependencies, { ajv: '8.20.0' });
  assert.equal(pkg.devDependencies, undefined);
  assert.deepEqual(pkg.exports, {
    './profile-resolver': './tools/profile-resolver.mjs',
    './profile-installer': './tools/profile-installer.mjs',
    './codex-local-state': './tools/codex-local-state.mjs',
  });
  assert.equal(pkg.files.includes('contracts/'), true);
  assert.equal(pkg.files.includes('tools/'), true);
  assert.equal(pkg.files.some((path) => path.startsWith('fixtures/benchmark-v3')), false, 'schema/mutation fixtures stay outside the package');
});
