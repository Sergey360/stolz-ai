import assert from 'node:assert/strict';
import test from 'node:test';

import {
  admitC2RuntimeTelemetry,
} from '../tools/runtime-telemetry/c2-adapter.mjs';
import { claudeCodeC2Adapter } from '../tools/runtime-telemetry/claude-code-c2.mjs';
import { qwenCodeC2Adapter } from '../tools/runtime-telemetry/qwen-code-c2.mjs';
import {
  admitC3ProviderPair,
  sanitizeC3RawProviderExport,
  withholdC3ProviderPair,
} from '../tools/c3-provider-pair-admission.mjs';
import {
  admitLifecycleForGate,
  advanceCertification,
  registerRuntime,
} from '../tools/runtime-lifecycle.mjs';

const captured_at = '2026-09-08T12:00:00.000Z';
const outcome_identity = 'a'.repeat(64);
const verification_identity = 'b'.repeat(64);
const evidence_sha256 = 'c'.repeat(64);

test('C2 adapters certify only exact runtime versions and retain no payload', () => {
  const raw_event = {
    event_class: 'tool_completed',
    result: 'succeeded',
    counters: { duration_ms: 12, tool_calls: 1 },
    prompt: 'must never persist',
    response: 'must never persist',
    api_key: 'must never persist',
  };
  const claude = claudeCodeC2Adapter.emit({
    runtime_version: '2.1.251',
    raw_event,
    captured_at,
  });
  const qwen = qwenCodeC2Adapter.emit({
    runtime_version: '0.22.3',
    raw_event,
    captured_at,
  });

  assert.deepEqual(admitC2RuntimeTelemetry(claude), {
    admitted: true,
    level: 'C2',
    runtime_id: 'claude-code',
    runtime_version: '2.1.251',
  });
  assert.deepEqual(admitC2RuntimeTelemetry(qwen), {
    admitted: true,
    level: 'C2',
    runtime_id: 'qwen-code',
    runtime_version: '0.22.3',
  });
  assert.doesNotMatch(JSON.stringify([claude, qwen]), /must never persist|api_key|prompt|response/);

  const drifted = claudeCodeC2Adapter.emit({
    runtime_version: '2.1.252',
    raw_event,
    captured_at,
  });
  assert.equal(drifted.certification_status, 'withheld');
  assert.deepEqual(admitC2RuntimeTelemetry(drifted), { admitted: false, reason: 'c2_withheld' });
});

test('C3 admits only two distinct sanitized exports with equal scenario identities', () => {
  const identity = { scenario_id: 'same-scenario', outcome_identity, verification_identity };
  const baseline_export = sanitizeC3RawProviderExport(
    { request_id: 'baseline', prompt: 'not retained' },
    identity,
  );
  const stolz_export = sanitizeC3RawProviderExport(
    { request_id: 'stolz', response: 'not retained' },
    identity,
  );
  const pair = {
    schema_version: '0.7.0',
    scenario_id: identity.scenario_id,
    runtime: { id: 'claude-code', supported_version: '2.1.251' },
    provider_overlay: { id: 'anthropic-api', version: '1.0.0' },
    baseline_export,
    stolz_export,
    outcome_identity,
    verification_identity,
    admission: 'admitted',
  };

  assert.deepEqual(admitC3ProviderPair(pair), { admitted: true, disposition: 'admitted' });
  assert.doesNotMatch(JSON.stringify([baseline_export, stolz_export]), /not retained|prompt|response/);

  const withheld = withholdC3ProviderPair({
    ...identity,
    runtime: pair.runtime,
    provider_overlay: pair.provider_overlay,
    reason: 'missing_export',
  });
  assert.deepEqual(admitC3ProviderPair(withheld), {
    admitted: false,
    disposition: 'withheld',
    reason: 'missing_export',
  });
});

test('runtime drift invalidates certification before evidence can be reused', () => {
  const original_tuple = {
    runtime_id: 'claude-code',
    runtime_version: '2.1.251',
    adapter_version: '1.0.0',
    overlay_id: 'none',
    overlay_version: 'none',
    schema_version: '0.7.0',
  };
  const certified = advanceCertification({
    current_tuple: original_tuple,
    action: 'certify',
    evidence_sha256,
  });
  assert.equal(admitLifecycleForGate(certified, 'claim').admitted, true);

  const changed_tuple = { ...original_tuple, runtime_version: '2.1.252' };
  const stale = advanceCertification({
    previous: certified,
    current_tuple: changed_tuple,
    action: 'select',
    evidence_sha256,
  });
  assert.equal(stale.status, 'stale');
  assert.equal(admitLifecycleForGate(stale, 'reuse').admitted, false);

  const recheck = advanceCertification({
    previous: stale,
    current_tuple: changed_tuple,
    action: 'select',
    evidence_sha256,
  });
  assert.equal(recheck.status, 'recheck_required');
});

test('provider overlays cannot be registered as runtimes', () => {
  assert.equal(registerRuntime('qwen-code'), 'qwen-code');
  assert.throws(() => registerRuntime('zai'), /provider overlays cannot be registered as runtimes/);
});
