import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  canReuseLedgerEntry,
  commandIdentity,
  createStateEvent,
  deduplicateCommand,
  evaluateBenchmark,
  nextStateEvent,
  selectSafeRoute,
  validateLedgerEntry,
  validateManifest,
} from '../tools/foundation.mjs';

const execFileAsync = promisify(execFile);
const sha = 'a'.repeat(64);
const changedSha = 'b'.repeat(64);
const identity = { id: 'docs/design', sha256: sha, version: '1' };
const manifest = { task_id: 'task-43', selected_route: 'stolz-context', source_artifacts: [identity], invalidation_inputs: [identity] };

test('contract schemas are present and identify only provider-neutral records', async () => {
  for (const file of ['route-manifest', 'verified-result-ledger', 'state-event', 'adapter-capability', 'benchmark-record']) {
    const schema = JSON.parse(await readFile(`contracts/${file}.schema.json`, 'utf8'));
    assert.match(schema.$id, /stolz-ai\.dev\/contracts/);
    assert.equal(schema.additionalProperties, false);
  }
});

test('manifest validation requires immutable source identities and rejects malformed input', () => {
  assert.deepEqual(validateManifest(manifest), { valid: true, errors: [] });
  const invalid = validateManifest({ ...manifest, source_artifacts: [{ id: 'docs/design', sha256: 'not-a-sha' }] });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(({ path }) => path === 'source_artifacts[0].sha256'));
  assert.equal(validateManifest({ ...manifest, source_artifacts: [] }).valid, false);
});

test('ledger reuse rejects failed verification, expiry, changed identities, and invalid records', () => {
  const entry = {
    key: 'design-check', command: { program: 'node', args: ['--test'] }, input_identities: [identity], tool_version: '22',
    recorded_at: '2026-08-28T10:00:00.000Z', expires_at: '2026-08-29T10:00:00.000Z', verification: { passed: true }, invalidation_inputs: [identity],
  };
  const reuseRequest = { input_identities: [identity], invalidation_inputs: [identity] };
  assert.equal(validateLedgerEntry(entry).valid, true);
  assert.equal(canReuseLedgerEntry(entry, reuseRequest, new Date('2026-08-28T12:00:00Z')).reusable, true);
  assert.equal(canReuseLedgerEntry({ ...entry, verification: { passed: false } }, reuseRequest).reason, 'verification_failed');
  assert.equal(canReuseLedgerEntry(entry, reuseRequest, new Date('2026-08-30T12:00:00Z')).reason, 'expired');
  const beforeExpiry = new Date('2026-08-28T12:00:00Z');
  assert.equal(canReuseLedgerEntry(entry, { ...reuseRequest, input_identities: [{ ...identity, sha256: changedSha }] }, beforeExpiry).reason, 'input_identity_mismatch');
  assert.equal(canReuseLedgerEntry(entry, { ...reuseRequest, invalidation_inputs: [{ ...identity, sha256: changedSha }] }, beforeExpiry).reason, 'invalidation_identity_mismatch');
  assert.equal(validateLedgerEntry({ ...entry, command: { program: 'node', args: [42] } }).valid, false);
});

test('commands deduplicate strictly by executable argv and never parse a shell string', () => {
  const command = { program: 'node', args: ['--test', 'test/foundation-contract.test.mjs'] };
  const key = commandIdentity(command);
  const active = new Map([[key, 'controller-1']]);
  assert.deepEqual(deduplicateCommand(command, active), { execute: false, key, owner: 'controller-1' });
  assert.equal(deduplicateCommand({ ...command, args: ['--test', 'other.mjs'] }, active).execute, true);
  assert.doesNotThrow(() => commandIdentity({ program: 'C:\\Program Files\\nodejs\\node.exe', args: ['--test'] }));
  assert.throws(() => commandIdentity({ program: '', args: [] }), /program and string argv/);
});

test('state helpers emit compact material events and suppress unchanged heartbeats', () => {
  const started = createStateEvent({ operation_id: 'op-43', state: 'started', at: '2026-08-28T10:00:00.000Z' });
  assert.deepEqual(nextStateEvent(started, { operation_id: 'op-43', state: 'started', at: '2026-08-28T10:01:00.000Z' }), null);
  const retry = nextStateEvent(started, { operation_id: 'op-43', state: 'waiting', retry: 1, cursor: 'page-2', at: '2026-08-28T10:02:00.000Z' });
  assert.equal(retry.state, 'waiting');
  assert.equal(retry.retry, 1);
  assert.throws(() => createStateEvent({ operation_id: 'op-43', state: 'heartbeat' }), /state is invalid/);
});

test('adapter gaps select the provider-neutral route and benchmark claims stay outcome-gated', () => {
  const adapter = { adapter_id: 'example', provider: 'example-provider', capabilities: { artifact_identity: true, command_execution: true, durable_state: false, measurement_capture: true } };
  assert.deepEqual(selectSafeRoute(adapter, ['artifact_identity', 'durable_state']), { route: 'provider-neutral', reason: 'missing_capabilities', missing: ['durable_state'] });
  const measurement = { tokens: 100, token_source: 'fixture-trace-v1', model_wakeups: 2, tool_calls: 3, wall_time_ms: 50, interventions: 0, verification: true, outcome: 'passed', evidence: ['benchmarks/raw/baseline.json'] };
  const benchmark = { fixture_id: 'fixture-1', fixture_version: '1', required_outcome: 'passed', baseline_route: 'baseline', optimized_route: 'optimized', baseline: measurement, optimized: { ...measurement, tokens: 70, evidence: ['benchmarks/raw/optimized.json'] } };
  assert.deepEqual(evaluateBenchmark(benchmark), { accepted: true, token_delta: -30, token_saving: true });
  assert.deepEqual(evaluateBenchmark({ ...benchmark, optimized: { ...benchmark.optimized, outcome: 'weakened' } }), { accepted: false, reason: 'outcome_mismatch' });
  assert.deepEqual(evaluateBenchmark({ ...benchmark, optimized: { ...benchmark.optimized, verification: false } }), { accepted: false, reason: 'verification_failed' });
  assert.deepEqual(evaluateBenchmark({ ...benchmark, optimized: { ...benchmark.optimized, tokens: undefined } }), { accepted: false, reason: 'missing_measurement' });
  assert.deepEqual(evaluateBenchmark({ ...benchmark, required_outcome: 'different-required-outcome' }), { accepted: false, reason: 'required_outcome_failed' });
});

test('foundation CLI returns one machine-readable result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stolz-foundation-'));
  const input = join(directory, 'manifest.json');
  await writeFile(input, JSON.stringify(manifest));
  const { stdout } = await execFileAsync(process.execPath, ['tools/foundation-cli.mjs', 'manifest', input]);
  assert.deepEqual(JSON.parse(stdout), { ok: true, operation: 'manifest', result: { valid: true, errors: [] } });
});
