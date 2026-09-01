import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  gateBenchmark,
  prepareContext,
  reportQuietState,
  reuseOrExecute,
  selectRoutedSkill,
} from '../tools/routed-skills.mjs';

const sha = 'a'.repeat(64);
const changedSha = 'b'.repeat(64);
const identity = { id: 'fixture', sha256: sha, version: '1' };
const request = { input_identities: [identity], invalidation_inputs: [identity] };
const command = { program: 'node', args: ['--test', 'test/routed-skills.integration.test.mjs'] };
const verifiedEntry = {
  key: 'fixture-check', command, ...request, tool_version: '22', recorded_at: '2026-08-28T10:00:00.000Z',
  expires_at: '2026-08-29T10:00:00.000Z', verification: { passed: true }, evidence: ['test/result'],
};
const beforeExpiry = new Date('2026-08-28T12:00:00Z');

test('five installable skill entrypoints are narrow and use progressive-disclosure references', async () => {
  const names = ['stolz-context', 'stolz-reuse', 'stolz-quiet-state', 'stolz-route', 'stolz-benchmark'];
  for (const name of names) {
    const skill = await readFile(`skills/${name}/SKILL.md`, 'utf8');
    assert.match(skill, new RegExp(`name: ${name}`));
    assert.match(skill, /references\//);
  }
  assert.equal((await readFile('skills/stolz-route/SKILL.md', 'utf8')).includes('unbenchmarked savings claim'), true);
});

test('route selection chooses one smallest route and safely falls back for unsupported adapters', () => {
  const insufficient = { adapter_id: 'minimal', provider: 'example', capabilities: { artifact_identity: true, command_execution: true, durable_state: false, measurement_capture: false } };
  assert.deepEqual(selectRoutedSkill({ concern: 'reuse', adapter: insufficient }), {
    skill: 'stolz-reuse', route: 'adapter', adapter_id: 'minimal', references: ['skills/stolz-reuse/references/ledger-and-invalidation.md'],
  });
  assert.deepEqual(selectRoutedSkill({ concern: 'benchmark', adapter: insufficient }), {
    skill: 'stolz-benchmark', route: 'provider-neutral', reason: 'missing_capabilities', missing: ['measurement_capture'], references: ['skills/stolz-benchmark/references/outcome-gates.md'],
  });
  assert.equal(selectRoutedSkill({ concern: 'unknown' }).skill, 'stolz-route');
});

test('unchanged inputs are not reread, while manifest errors and changed identities stop safely', () => {
  const route = selectRoutedSkill({ concern: 'context' });
  const manifest = { task_id: 'task-44', selected_route: 'stolz-context', source_artifacts: [identity], invalidation_inputs: [identity] };
  assert.equal(prepareContext(manifest, route).ok, true);
  assert.deepEqual(reuseOrExecute({ ledgerEntry: verifiedEntry, request, command, now: beforeExpiry }), { action: 'reuse', entry: verifiedEntry });
  assert.equal(reuseOrExecute({ ledgerEntry: verifiedEntry, request: { ...request, input_identities: [{ ...identity, sha256: changedSha }] }, command, now: beforeExpiry }).action, 'execute');
  assert.equal(prepareContext({ ...manifest, selected_route: 'stolz-reuse' }, route).reason, 'route_mismatch');
  assert.equal(prepareContext({ ...manifest, source_artifacts: [] }, route).reason, 'invalid_manifest');
});

test('equivalent operations coalesce and state reporting suppresses unchanged heartbeats', () => {
  const active = new Map([[JSON.stringify([command.program, command.args]), 'controller-44']]);
  assert.deepEqual(reuseOrExecute({ ledgerEntry: null, request, command, activeCommands: active }), {
    action: 'coalesce', key: JSON.stringify([command.program, command.args]), owner: 'controller-44', reuse_reason: 'verification_failed',
  });
  const started = { operation_id: 'op-44', state: 'started', cursor: null, retry: 0, at: '2026-08-28T10:00:00.000Z' };
  assert.equal(reportQuietState(started, { operation_id: 'op-44', state: 'started', at: '2026-08-28T10:01:00.000Z' }), null);
  assert.equal(reportQuietState(started, { operation_id: 'op-44', state: 'needs_decision', reason: 'approval required', at: '2026-08-28T10:01:00.000Z' }).state, 'needs_decision');
});

test('benchmark routing never silently weakens verification', () => {
  const measurement = { tokens: 100, token_source: 'fixture-trace-v1', model_wakeups: 2, tool_calls: 3, wall_time_ms: 50, interventions: 0, outcome: 'passed', verification: true, evidence: ['benchmarks/raw/baseline.json'] };
  const record = { fixture_id: 'fixture-1', fixture_version: '1', required_outcome: 'passed', baseline_route: 'baseline', optimized_route: 'optimized', baseline: measurement, optimized: { ...measurement, tokens: 40, verification: false, evidence: ['benchmarks/raw/optimized.json'] } };
  assert.deepEqual(gateBenchmark(record), { accepted: false, reason: 'verification_failed' });
});
