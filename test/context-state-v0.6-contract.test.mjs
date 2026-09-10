import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  admitSeparatedEvidenceClaim,
  decideQuietPoll,
  deltaContextSha256,
  resolveRuntimeRoute,
  validateDeltaContext,
  validateQuietState,
  validateReadFragment,
  validateRuntimeRoute,
  validateSeparatedEvidenceClaim,
} from '../tools/context-state.mjs';

const hash = (char) => char.repeat(64);
const fragmentIdentity = { policy_identity: hash('d'), schema_identity: hash('e'), tool_identity: hash('f') };
const registry = JSON.parse(await readFile('contracts/context-state-v0.6/registry.json', 'utf8'));

function delta() {
  return {
    schema_id: 'delta-context', schema_version: '0.6.0',
    repository: { repository_id: 'stolz-ai', canonical_remote: 'https://example.invalid/stolz-ai.git' },
    base_git_object: { object_type: 'commit', object_id: hash('a') },
    head_git_object: { object_type: 'commit', object_id: hash('b') },
    changed_ranges: [{ path: 'src/router.mjs', head_blob: hash('c'), start_byte: 12, end_byte: 39, content_sha256: hash('d') }],
    retrieval: { strategy: 'changed_ranges_only', max_fragments: 4, max_total_bytes: 4096, full_repository_reread: false, full_repository_hash_required: false },
  };
}

function evidence(kind, record, outcome = hash('c'), verification = hash('d')) {
  return { kind, record_sha256: hash(record), outcome_identity: outcome, verification_identity: verification, available: true };
}

test('v0.6 registry has exactly the additive, versioned fail-closed contracts', async () => {
  assert.equal(registry.schema_version, '0.6.0');
  assert.deepEqual(registry.contracts.map(({ schema_id }) => schema_id), [
    'delta-context', 'read-fragment-ledger', 'quiet-external-state', 'runtime-profile-route', 'separated-evidence-claim',
  ]);
  for (const entry of registry.contracts) {
    const schema = JSON.parse(await readFile(entry.path, 'utf8'));
    assert.equal(new Ajv2020({ strict: false }).compile(schema).schema.$id, schema.$id);
  }
});

test('delta context binds Git objects and changed byte ranges without full-repository acquisition', () => {
  const record = delta();
  assert.equal(validateDeltaContext(record).valid, true);
  assert.match(deltaContextSha256(record), /^[a-f0-9]{64}$/);

  for (const [name, mutate] of [
    ['same Git object', (value) => { value.head_git_object.object_id = value.base_git_object.object_id; }],
    ['non-strict range', (value) => { value.changed_ranges[0].end_byte = value.changed_ranges[0].start_byte; }],
    ['full reread', (value) => { value.retrieval.full_repository_reread = true; }],
    ['full hash', (value) => { value.retrieval.full_repository_hash_required = true; }],
    ['too many fragments', (value) => { value.retrieval.max_fragments = 1; value.changed_ranges.push({ ...value.changed_ranges[0], path: 'src/other.mjs' }); }],
  ]) {
    const candidate = structuredClone(record); mutate(candidate);
    assert.equal(validateDeltaContext(candidate).valid, false, name);
  }
});

test('read-fragment ledger requires a durable acknowledgement and explicit invalidation', () => {
  const record = {
    schema_id: 'read-fragment-ledger', schema_version: '0.6.0', fragment_id: 'fragment:router:1', delta_identity: hash('a'),
    range: { path: 'src/router.mjs', git_blob: hash('b'), start_byte: 0, end_byte: 120 }, content_sha256: hash('c'), identity: fragmentIdentity,
    durability: { write_protocol: 'atomic_rename_fsync', commit_acknowledged: true, stored_at: '2026-09-06T06:00:00Z' },
    invalidation: { state: 'valid', reasons: [] },
  };
  assert.equal(validateReadFragment(record).valid, true);
  for (const [name, mutate] of [
    ['missing durable acknowledgement', (value) => { value.durability.commit_acknowledged = false; }],
    ['not-invalidated with reason', (value) => { value.invalidation.reasons.push('head_changed'); }],
    ['invalidated without cause', (value) => { value.invalidation = { state: 'invalidated', reasons: [] }; }],
    ['unbounded range', (value) => { value.range.end_byte = value.range.start_byte; }],
  ]) {
    const candidate = structuredClone(record); mutate(candidate);
    assert.equal(validateReadFragment(candidate).valid, false, name);
  }
});

test('unchanged polls remain quiet with zero model invocations and wake only on named terminal signals', () => {
  const quiet = decideQuietPoll({ poll_identity: hash('a'), previous_material_state: hash('b'), next_material_state: hash('b') });
  assert.deepEqual({ disposition: quiet.disposition, model_invocations: quiet.model_invocations, reason: quiet.reason }, { disposition: 'quiet', model_invocations: 0, reason: 'unchanged' });
  assert.equal(validateQuietState(quiet).valid, true);
  for (const signal of ['failure', 'needs_decision', 'terminal_material_change']) {
    const wake = decideQuietPoll({ poll_identity: hash('a'), previous_material_state: hash('b'), next_material_state: hash('c'), signal });
    assert.match(wake.disposition, /^wake_/);
    assert.equal(validateQuietState(wake).valid, true);
  }
  const invalid = { ...quiet, model_invocations: 1 };
  assert.equal(validateQuietState(invalid).valid, false);
});

test('runtime/profile-first routing records a stable economical context-then-reuse trace without a model', () => {
  const route = resolveRuntimeRoute({
    runtime: 'codex', profile_identity: hash('a'), economic_evidence_identity: hash('b'), requested_capabilities: ['artifact_identity'], limit: 2,
    mechanisms: [
      { mechanism_id: 'reuse', runtime: 'codex', profile_identity: hash('a'), economic_evidence_identity: hash('b'), capabilities: ['artifact_identity'], eligible: true, sequence_rank: 2, cost_rank: 1, measured_benefit_units: 9, total_overhead_units: 3 },
      { mechanism_id: 'context', runtime: 'codex', profile_identity: hash('a'), economic_evidence_identity: hash('b'), capabilities: ['artifact_identity'], eligible: true, sequence_rank: 1, cost_rank: 9, measured_benefit_units: 8, total_overhead_units: 2 },
      { mechanism_id: 'third-positive', runtime: 'codex', profile_identity: hash('a'), economic_evidence_identity: hash('b'), capabilities: ['artifact_identity'], eligible: true, sequence_rank: 3, cost_rank: 0, measured_benefit_units: 4, total_overhead_units: 3 },
      { mechanism_id: 'full-index', runtime: 'codex', profile_identity: hash('a'), economic_evidence_identity: hash('b'), capabilities: ['artifact_identity'], eligible: true, sequence_rank: 4, cost_rank: 0, measured_benefit_units: 3, total_overhead_units: 3 },
      { mechanism_id: 'missing-capability', runtime: 'codex', profile_identity: hash('a'), economic_evidence_identity: hash('b'), capabilities: [], eligible: true, sequence_rank: 5, cost_rank: 0, measured_benefit_units: 5, total_overhead_units: 1 },
      { mechanism_id: 'profile-ineligible', runtime: 'codex', profile_identity: hash('a'), economic_evidence_identity: hash('b'), capabilities: ['artifact_identity'], eligible: false, sequence_rank: 6, cost_rank: 0, measured_benefit_units: 5, total_overhead_units: 1 },
      { mechanism_id: 'other-profile', runtime: 'codex', profile_identity: hash('c'), economic_evidence_identity: hash('b'), capabilities: ['artifact_identity'], eligible: true, sequence_rank: 7, cost_rank: 0, measured_benefit_units: 5, total_overhead_units: 1 },
      { mechanism_id: 'other-runtime', runtime: 'qwen-code', profile_identity: hash('a'), economic_evidence_identity: hash('b'), capabilities: ['artifact_identity'], eligible: true, sequence_rank: 0, cost_rank: 0, measured_benefit_units: 10, total_overhead_units: 1 },
    ],
  });
  assert.deepEqual(route.mechanisms.map(({ mechanism_id }) => mechanism_id), ['other-runtime', 'context', 'reuse', 'third-positive', 'full-index', 'missing-capability', 'profile-ineligible', 'other-profile']);
  assert.deepEqual(route.mechanisms.map(({ decision }) => decision), ['runtime_mismatch', 'activated', 'activated', 'mechanism_limit_reached', 'uneconomic_after_all_overhead', 'capability_missing', 'profile_ineligible', 'profile_mismatch']);
  assert.equal(route.route_disposition, 'selected');
  assert.equal(route.router_model_invocations, 0);
  assert.equal(validateRuntimeRoute(route).valid, true);
  assert.equal(validateRuntimeRoute({ ...route, router_model_invocations: 1 }).valid, false);
  assert.equal(validateRuntimeRoute({ ...route, mechanisms: [...route.mechanisms].reverse() }).valid, false);
});

test('runtime routes fail closed for unsupported provider/runtime input and use a recorded safe baseline when no mechanism pays back', () => {
  const input = {
    runtime: 'codex', profile_identity: hash('a'), economic_evidence_identity: hash('b'),
    mechanisms: [{ mechanism_id: 'context', runtime: 'codex', profile_identity: hash('a'), economic_evidence_identity: hash('b'), capabilities: [], eligible: true, sequence_rank: 1, cost_rank: 1, measured_benefit_units: 2, total_overhead_units: 2 }],
  };
  const route = resolveRuntimeRoute(input);
  assert.deepEqual({ route_disposition: route.route_disposition, decision: route.mechanisms[0].decision }, { route_disposition: 'safe_baseline', decision: 'uneconomic_after_all_overhead' });
  assert.equal(validateRuntimeRoute(route).valid, true);
  assert.throws(() => resolveRuntimeRoute({ ...input, runtime: 'unsupported' }), /fails closed/);
  assert.throws(() => resolveRuntimeRoute({ ...input, provider: 'example' }), /provider or model/);
  assert.throws(() => resolveRuntimeRoute({ ...input, mechanisms: [{ ...input.mechanisms[0], provider: 'example' }] }), /provider or model/);
});

test('provider-native and runtime evidence remain separate and claims fail closed unless equal', () => {
  const claim = admitSeparatedEvidenceClaim({ scenario_id: 'delta-read', provider_native_evidence: evidence('provider_native', 'a'), runtime_evidence: evidence('runtime_measured', 'b') });
  assert.equal(claim.admission, 'admitted_scenario');
  assert.equal(validateSeparatedEvidenceClaim(claim).valid, true);

  const incomplete = admitSeparatedEvidenceClaim({ scenario_id: 'delta-read', provider_native_evidence: evidence('provider_native', 'a'), runtime_evidence: evidence('runtime_measured', 'b', hash('e')) });
  assert.equal(incomplete.admission, 'withheld');
  assert.equal(validateSeparatedEvidenceClaim(incomplete).valid, true);

  const relabelled = structuredClone(claim); relabelled.runtime_evidence.kind = 'provider_native';
  assert.equal(validateSeparatedEvidenceClaim(relabelled).valid, false);
});

test('the public package keeps five skills and the explicit local Codex-state entry point', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.deepEqual(pkg.exports, {
    './profile-resolver': './tools/profile-resolver.mjs',
    './profile-installer': './tools/profile-installer.mjs',
    './codex-local-state': './tools/codex-local-state.mjs',
  });
  assert.equal(pkg.files.includes('!contracts/context-state-v0.6/'), false);
  assert.equal(pkg.files.includes('!tools/context-state.mjs'), false);
  assert.equal(pkg.files.includes('!tools/context-ledger.mjs'), false);
  assert.equal(pkg.files.includes('!tools/quiet-state-controller.mjs'), false);
  assert.deepEqual((await (await import('node:fs/promises')).readdir('skills')).sort(), [
    'stolz-benchmark', 'stolz-context', 'stolz-quiet-state', 'stolz-reuse', 'stolz-route',
  ]);
});
