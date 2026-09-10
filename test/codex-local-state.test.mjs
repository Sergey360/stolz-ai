import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { openCodexLocalState } from '../tools/codex-local-state.mjs';

const execFileAsync = promisify(execFile);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const now = () => new Date(Date.now() + 60_000).toISOString();

function policy() {
  return [{
    schema_id: 'reuse-policy', schema_version: '1.0.0', policy_id: 'codex-local-check', policy_version: '1.0.0', owner: 'workspace-owner',
    operation_class: 'local_deterministic_check', allowed_program_path_classes: ['workspace'], allowed_cwd_path_classes: ['workspace'], allowed_environment_names: [],
    discovery_method_id: 'declared-inputs-v1', source_ttl_class: 'bounded', isolation_mechanism: 'workspace-local', idempotence_argument: 'read-only check',
    deterministic_input_contract: 'declared digests', bounded_effects: 'no side effects', required_outcome_oracle_id: 'outcome-v1', required_verification_oracle_id: 'verify-v1',
    retention_class: 'local-bounded', revocation_state: 'active',
  }];
}

function identity(input) {
  return {
    schema_id: 'reuse-identity', schema_version: '1.0.0', canonicalization_version: '1',
    program: { path_class: 'workspace', digest_sha256: sha('program'), version: '1' }, argv: ['check'],
    cwd: { path_class: 'workspace', normalized_resolved_path: 'workspace' },
    inputs: { declared: [{ path_class: 'workspace', path: 'input.txt', digest_sha256: sha(input) }], discovered: [], discovery: { state: 'complete', method_id: 'declared-inputs-v1' } },
    tool_runtime: { tool: 'node', tool_version: '22.22.2', runtime: 'codex', runtime_version: '0.153.4' }, policy: { policy_id: 'codex-local-check', policy_version: '1.0.0' }, environment: [],
  };
}

const safeOperation = Object.freeze({ side_effects: false, network_mutation: false, idempotent: true, deterministic: true, secret_data: false, user_data: false, mutable_external_state: false, unknown_influence: false, discovery_complete: true, path_resolved: true });

test('local state requires explicit opt-in and keeps the public entry point small', () => {
  assert.throws(() => openCodexLocalState({ workspace: 'C:\\workspace' }), /explicit enabled/);
});

test('one local Codex path records bounded context, reuses verified evidence, invalidates, and survives restart', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'stolz-local-state-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await writeFile(join(workspace, 'input.txt'), 'abcdefghij', 'utf8');
  const state = openCodexLocalState({ enabled: true, workspace, max_storage_bytes: 512 * 1024, quiet_policy: { poll_interval_ms: 1 } });
  const bytes = Buffer.from('cdef');
  const delta = {
    schema_id: 'delta-context', schema_version: '0.6.0', repository: { repository_id: 'local', canonical_remote: 'local://workspace' },
    base_git_object: { object_type: 'commit', object_id: sha('base') }, head_git_object: { object_type: 'commit', object_id: sha('head') },
    changed_ranges: [{ path: 'input.txt', head_blob: sha('blob'), start_byte: 2, end_byte: 6, content_sha256: sha(bytes) }],
    retrieval: { strategy: 'changed_ranges_only', max_fragments: 1, max_total_bytes: 4, full_repository_reread: false, full_repository_hash_required: false },
  };
  const recordedContext = await state.recordContext({ delta, range: { path: 'input.txt', git_blob: sha('blob'), start_byte: 2, end_byte: 6 }, policy_identity: sha('policy'), schema_identity: sha('schema'), tool_identity: sha('tool') });
  assert.equal(recordedContext.disposition, 'recorded');
  assert.equal(Object.hasOwn(recordedContext.projection, 'content'), false);

  const candidate = identity('abcdefghij');
  assert.equal((await state.lookupReuse({ identity: candidate, operation: safeOperation, policies: policy() })).disposition, 'miss');
  const recordedReuse = await state.recordReuse({ identity: candidate, operation: safeOperation, policies: policy(), verification: { status: 'passed', oracle_id: 'verify-v1', identity: 'verified-output-v1' }, result: { status: 'passed', outcome_identity: 'outcome-v1', private_output: 'never replay this' }, content: 'private command output', expires_at: now() });
  assert.equal(recordedReuse.disposition, 'recorded');
  assert.equal(Object.hasOwn(recordedReuse, 'content'), false);
  const reused = await state.lookupReuse({ identity: candidate, operation: safeOperation, policies: policy() });
  assert.equal(reused.disposition, 'reused');
  assert.deepEqual(reused.result, { status: 'passed', outcome_identity: 'outcome-v1' });
  await state.invalidateReuse(candidate, 'changed_input');
  assert.deepEqual(await state.lookupReuse({ identity: candidate, operation: safeOperation, policies: policy() }), { disposition: 'miss', reason: 'changed_input', fallback: 'normal_verified_route' });

  const initial = await state.observeQuietState({ operation_id: 'build-1', snapshot: { cursor: 1, status: 'waiting', revision: 'r1' } });
  assert.equal(initial.disposition, 'quiet');
  const quiet = await state.observeQuietState({ operation_id: 'build-1', snapshot: { cursor: 2, status: 'waiting', revision: 'r1' } });
  assert.equal(quiet.disposition, 'quiet');
  await new Promise((resolve) => setTimeout(resolve, 2));
  const restarted = openCodexLocalState({ enabled: true, workspace, max_storage_bytes: 512 * 1024, quiet_policy: { poll_interval_ms: 1 } });
  const done = await restarted.observeQuietState({ operation_id: 'build-1', snapshot: { cursor: 3, status: 'done', revision: 'r2', result_identity: sha('done') } });
  assert.equal(done.disposition, 'wake_terminal_material_change');
  assert.equal(done.notifications, 1);
  assert.equal((await restarted.observeQuietState({ operation_id: 'build-1', snapshot: { cursor: 4, status: 'done', revision: 'r2', result_identity: sha('done') } })).reason, 'terminal_replay');
  assert.equal((await restarted.recover()).reuse.index instanceof Map, true);
  const overhead = await restarted.overhead();
  assert.equal(overhead.automatic_model_invocations, 0);
  assert.equal(overhead.storage_bytes > 0, true);

});

test('concurrent local observers emit one terminal quiet-state wake', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'stolz-local-concurrency-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const options = { enabled: true, workspace, quiet_policy: { poll_interval_ms: 1 } };
  const first = openCodexLocalState(options);
  const second = openCodexLocalState(options);
  await first.observeQuietState({ operation_id: 'shared-op', snapshot: { cursor: 1, status: 'waiting', revision: 'r1' } });
  await new Promise((resolve) => setTimeout(resolve, 2));
  const snapshot = { cursor: 2, status: 'done', revision: 'r2', result_identity: sha('shared-result') };
  const results = await Promise.all([
    first.observeQuietState({ operation_id: 'shared-op', snapshot }),
    second.observeQuietState({ operation_id: 'shared-op', snapshot }),
  ]);
  assert.equal(results.filter((result) => result.notifications === 1).length, 1);
  assert.equal(results.some((result) => result.reason === 'terminal_replay'), true);
});

test('storage exhaustion and unsafe reuse both select the normal verified fallback', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'stolz-local-limit-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const state = openCodexLocalState({ enabled: true, workspace, max_storage_bytes: 64 * 1024 });
  const unsafe = { ...safeOperation, network_mutation: true };
  assert.deepEqual(await state.lookupReuse({ identity: identity('input'), operation: unsafe, policies: policy() }), { disposition: 'unavailable', reason: 'unsafe_side_effect', fallback: 'normal_verified_route' });
  const result = await state.recordReuse({ identity: identity('input'), operation: safeOperation, policies: policy(), verification: { status: 'passed', oracle_id: 'verify-v1', identity: 'verified' }, result: { status: 'passed' }, content: Buffer.alloc(60 * 1024), expires_at: now() });
  assert.equal(result.disposition, 'unavailable');
  assert.equal(result.reason, 'storage_limit');
});

test('the packed public API imports from a clean consumer without a private checkout', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'stolz-public-consumer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const npmCli = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const { stdout } = await execFileAsync(process.execPath, [npmCli, 'pack', '--pack-destination', root, '--json', '--ignore-scripts'], { cwd: process.cwd() });
  const archive = join(root, JSON.parse(stdout)[0].filename);
  const consumer = join(root, 'consumer');
  await (await import('node:fs/promises')).mkdir(consumer);
  await execFileAsync(process.execPath, [npmCli, 'install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', archive], { cwd: consumer });
  const { stdout: imported } = await execFileAsync(process.execPath, [
    '--input-type=module', '-e',
    "import { openCodexLocalState } from 'stolz-ai/codex-local-state'; console.log(typeof openCodexLocalState);",
  ], { cwd: consumer });
  assert.equal(imported.trim(), 'function');
});
