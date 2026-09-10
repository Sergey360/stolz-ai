import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { decideQuietPoll, validateQuietState } from './context-state.mjs';

export const QUIET_STATE_CONTROLLER_VERSION = '0.6.0';

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STATUSES = new Set(['started', 'running', 'progressed', 'waiting', 'needs_decision', 'failed', 'done']);
const SNAPSHOT_KEYS = new Set(['cursor', 'status', 'revision', 'progress', 'reason_code', 'result_identity', 'observed_at']);
const ZERO_STATE = '0'.repeat(64);
const DEFAULT_POLICY = Object.freeze({
  poll_interval_ms: 1_000,
  max_attempts: 3,
  backoff_base_ms: 250,
  backoff_multiplier: 2,
  backoff_max_ms: 30_000,
  debounce_polls: 1,
  progress_threshold: 5,
  dedupe_limit: 128,
  lock_retry_ms: 5,
  lock_max_attempts: 400,
  lock_stale_ms: 60_000,
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const UNSUPPORTED_DIRECTORY_SYNC = new Set(['EINVAL', 'ENOTSUP', 'EPERM']);

async function syncDirectory(path) {
  const directory = await open(path, 'r');
  try {
    await directory.sync();
  } catch (error) {
    if (process.platform !== 'win32' || !UNSUPPORTED_DIRECTORY_SYNC.has(error?.code)) throw error;
  } finally {
    await directory.close();
  }
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function canonical(value) {
  if (typeof value === 'string') return value.normalize('NFC').replace(/\r\n/g, '\n');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function assertIdentifier(value, name) {
  if (!IDENTIFIER.test(value ?? '')) throw new TypeError(`${name} is invalid`);
}

function integerInRange(value, minimum, maximum, name) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function normalizePolicy(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('policy must be an object');
  const unknown = Object.keys(input).filter((key) => !Object.hasOwn(DEFAULT_POLICY, key));
  if (unknown.length > 0) throw new TypeError(`unknown quiet-state policy fields: ${unknown.sort().join(', ')}`);
  const policy = { ...DEFAULT_POLICY, ...input };
  integerInRange(policy.poll_interval_ms, 1, 86_400_000, 'poll_interval_ms');
  integerInRange(policy.max_attempts, 1, 16, 'max_attempts');
  integerInRange(policy.backoff_base_ms, 1, 86_400_000, 'backoff_base_ms');
  integerInRange(policy.backoff_multiplier, 1, 16, 'backoff_multiplier');
  integerInRange(policy.backoff_max_ms, 1, 86_400_000, 'backoff_max_ms');
  if (policy.backoff_max_ms < policy.backoff_base_ms) throw new TypeError('backoff_max_ms must be at least backoff_base_ms');
  integerInRange(policy.debounce_polls, 1, 16, 'debounce_polls');
  integerInRange(policy.progress_threshold, 1, 100, 'progress_threshold');
  integerInRange(policy.dedupe_limit, 1, 1_024, 'dedupe_limit');
  integerInRange(policy.lock_retry_ms, 1, 1_000, 'lock_retry_ms');
  integerInRange(policy.lock_max_attempts, 1, 10_000, 'lock_max_attempts');
  integerInRange(policy.lock_stale_ms, 1_000, 86_400_000, 'lock_stale_ms');
  return Object.freeze(policy);
}

/** Return the bounded, deterministic delay for a one-based consecutive failure. */
export function deterministicBackoffMs(attempt, policy = DEFAULT_POLICY) {
  const normalized = normalizePolicy(policy);
  integerInRange(attempt, 1, normalized.max_attempts, 'attempt');
  const delay = normalized.backoff_base_ms * (normalized.backoff_multiplier ** (attempt - 1));
  return Math.min(normalized.backoff_max_ms, Number.isSafeInteger(delay) ? delay : normalized.backoff_max_ms);
}

function normalizeSnapshot(snapshot, progressThreshold) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError('external poll must return an object');
  const unknown = Object.keys(snapshot).filter((key) => !SNAPSHOT_KEYS.has(key));
  if (unknown.length > 0) throw new TypeError(`unknown external-state fields: ${unknown.sort().join(', ')}`);
  const { cursor, status, revision, progress, reason_code: reasonCode, result_identity: resultIdentity } = snapshot;
  integerInRange(cursor, 0, Number.MAX_SAFE_INTEGER, 'cursor');
  if (!STATUSES.has(status)) throw new TypeError('external state status is invalid');
  if (!REVISION.test(revision ?? '')) throw new TypeError('external state revision is invalid');
  if (progress !== undefined) integerInRange(progress, 0, 100, 'progress');
  if (['failed', 'needs_decision'].includes(status) && !REVISION.test(reasonCode ?? '')) {
    throw new TypeError(`${status} requires a bounded reason_code`);
  }
  if (reasonCode !== undefined && !REVISION.test(reasonCode)) throw new TypeError('reason_code is invalid');
  if (status === 'done' && !SHA256.test(resultIdentity ?? '')) throw new TypeError('done requires result_identity as SHA-256');
  if (resultIdentity !== undefined && !SHA256.test(resultIdentity)) throw new TypeError('result_identity must be SHA-256');
  const material = {
    status,
    revision,
    progress_bucket: progress === undefined ? null : Math.floor(progress / progressThreshold) * progressThreshold,
    reason_code: reasonCode ?? null,
    result_identity: resultIdentity ?? null,
  };
  return { cursor, material, fingerprint: sha(canonicalJson(material)) };
}

/** Hash only bounded material fields. Cursor and observed timestamps are deliberately excluded. */
export function materialStateFingerprint(snapshot, { progress_threshold = DEFAULT_POLICY.progress_threshold } = {}) {
  integerInRange(progress_threshold, 1, 100, 'progress_threshold');
  return normalizeSnapshot(snapshot, progress_threshold).fingerprint;
}

function initialState(operationId, policyIdentity) {
  return {
    schema_id: 'stolz-quiet-state-controller',
    schema_version: QUIET_STATE_CONTROLLER_VERSION,
    operation_id: operationId,
    policy_identity: policyIdentity,
    cursor: null,
    accepted: null,
    candidate: null,
    last_seen_fingerprint: null,
    poll_sequence: 0,
    next_poll_at_ms: 0,
    retry: { consecutive_failures: 0, failure_generation: 0, active_failure_identity: null },
    seen_wake_ids: [],
    terminal: null,
  };
}

function validateDurableState(state, operationId, policyIdentity, dedupeLimit) {
  if (!state || state.schema_id !== 'stolz-quiet-state-controller' || state.schema_version !== QUIET_STATE_CONTROLLER_VERSION) {
    throw new TypeError('quiet_state_record_invalid');
  }
  if (state.operation_id !== operationId) throw new TypeError('quiet_state_operation_mismatch');
  if (state.policy_identity !== policyIdentity) throw new TypeError('quiet_state_policy_changed');
  if (state.cursor !== null) integerInRange(state.cursor, 0, Number.MAX_SAFE_INTEGER, 'durable cursor');
  integerInRange(state.poll_sequence, 0, Number.MAX_SAFE_INTEGER, 'poll_sequence');
  if (state.next_poll_at_ms !== null) integerInRange(state.next_poll_at_ms, 0, Number.MAX_SAFE_INTEGER, 'next_poll_at_ms');
  integerInRange(state.retry?.consecutive_failures, 0, 16, 'consecutive_failures');
  integerInRange(state.retry?.failure_generation, 0, Number.MAX_SAFE_INTEGER, 'failure_generation');
  if (!Array.isArray(state.seen_wake_ids) || state.seen_wake_ids.length > dedupeLimit || state.seen_wake_ids.some((id) => !SHA256.test(id))) {
    throw new TypeError('quiet_state_dedupe_invalid');
  }
  for (const value of [state.accepted?.fingerprint, state.candidate?.fingerprint, state.last_seen_fingerprint, state.retry?.active_failure_identity, state.terminal?.wake_id]) {
    if (value !== undefined && value !== null && !SHA256.test(value)) throw new TypeError('quiet_state_identity_invalid');
  }
  return state;
}

function errorCode(error) {
  for (const value of [error?.code, error?.name]) {
    if (REVISION.test(value ?? '')) return value;
  }
  return 'external_poll_failed';
}

function compactResult(state, reason, extras = {}) {
  return Object.freeze({
    operation_id: state.operation_id,
    disposition: extras.disposition ?? 'quiet',
    reason,
    cursor: state.cursor,
    next_poll_at_ms: state.next_poll_at_ms,
    model_invocations: 0,
    notifications: extras.notifications ?? 0,
    poll_identity: extras.poll_identity ?? null,
    ...extras,
  });
}

function wakeSignal(status) {
  if (status === 'failed') return 'failure';
  if (status === 'needs_decision') return 'needs_decision';
  if (status === 'done') return 'terminal_material_change';
  return null;
}

function wakeIdentity(operationId, material, failureGeneration) {
  return sha(canonicalJson({
    operation_id: operationId,
    signal: wakeSignal(material.status),
    failure_generation: material.status === 'failed' ? failureGeneration : null,
    revision: material.revision,
    reason_code: material.reason_code,
    result_identity: material.result_identity,
  }));
}

/**
 * Durable, model-free polling controller. Callers schedule `poll` at the
 * returned next_poll_at_ms and invoke a model only for a returned wake event.
 */
export class QuietStateController {
  constructor({ root, clock = () => Date.now(), policy = {} } = {}) {
    if (!root) throw new TypeError('root is required');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.root = root;
    this.clock = clock;
    this.policy = normalizePolicy(policy);
    this.policyIdentity = sha(canonicalJson(this.policy));
    this.states = join(root, 'states');
    this.locks = join(root, 'locks');
  }

  statePath(operationId) {
    assertIdentifier(operationId, 'operation_id');
    return join(this.states, `${operationId}.json`);
  }

  lockPath(operationId) {
    assertIdentifier(operationId, 'operation_id');
    return join(this.locks, `${operationId}.lock`);
  }

  async initialize() {
    await Promise.all([
      mkdir(this.states, { recursive: true, mode: 0o700 }),
      mkdir(this.locks, { recursive: true, mode: 0o700 }),
    ]);
  }

  async atomicJson(path, value) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, path);
      await syncDirectory(dirname(path));
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async writeState(state) {
    const payload = canonical(state);
    await this.atomicJson(this.statePath(state.operation_id), { payload, integrity_sha256: sha(canonicalJson(payload)) });
  }

  async readState(operationId) {
    let envelope;
    try {
      envelope = JSON.parse(await readFile(this.statePath(operationId), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return initialState(operationId, this.policyIdentity);
      throw new TypeError('quiet_state_record_corrupt');
    }
    if (!envelope || !SHA256.test(envelope.integrity_sha256 ?? '') || sha(canonicalJson(envelope.payload)) !== envelope.integrity_sha256) {
      throw new TypeError('quiet_state_integrity_failed');
    }
    return validateDurableState(envelope.payload, operationId, this.policyIdentity, this.policy.dedupe_limit);
  }

  async acquireLock(operationId) {
    const path = this.lockPath(operationId);
    for (let attempt = 1; attempt <= this.policy.lock_max_attempts; attempt += 1) {
      const token = randomUUID();
      const acquiredAt = this.clock();
      try {
        const handle = await open(path, 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify({ token, pid: process.pid, acquired_at_ms: acquiredAt }));
          await handle.sync();
        } finally {
          await handle.close();
        }
        return { path, token };
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        try {
          const current = JSON.parse(await readFile(path, 'utf8'));
          if (Number.isSafeInteger(current.acquired_at_ms)
            && acquiredAt - current.acquired_at_ms >= this.policy.lock_stale_ms
            && !processIsAlive(current.pid)) {
            await rm(path, { force: true });
            continue;
          }
        } catch {
          // A competing process may still be writing the newly-created lock.
          // Only reap an unreadable lock after the bounded stale interval.
          try {
            const metadata = await stat(path);
            if (Date.now() - metadata.mtimeMs >= this.policy.lock_stale_ms) {
              await rm(path, { force: true });
              continue;
            }
          } catch (metadataError) {
            if (metadataError?.code === 'ENOENT') continue;
            throw metadataError;
          }
        }
        if (attempt === this.policy.lock_max_attempts) throw new Error('quiet_state_controller_busy');
        await wait(this.policy.lock_retry_ms);
      }
    }
    throw new Error('quiet_state_controller_busy');
  }

  async releaseLock(lock) {
    try {
      const current = JSON.parse(await readFile(lock.path, 'utf8'));
      if (current.token === lock.token) await rm(lock.path, { force: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  addWakeIdentity(state, wakeId) {
    if (state.seen_wake_ids.includes(wakeId)) return false;
    state.seen_wake_ids = [...state.seen_wake_ids, wakeId].slice(-this.policy.dedupe_limit);
    return true;
  }

  pollIdentity(state, pollerId) {
    return sha(canonicalJson({
      operation_id: state.operation_id,
      policy_identity: state.policy_identity,
      poll_sequence: state.poll_sequence,
      poller_id: pollerId,
    }));
  }

  async emitWake(state, material, previousFingerprint, pollIdentity, notify) {
    const signal = wakeSignal(material.status);
    const wakeId = wakeIdentity(state.operation_id, material, state.retry.failure_generation);
    if (!signal || !this.addWakeIdentity(state, wakeId)) {
      await this.writeState(state);
      return compactResult(state, signal ? 'deduplicated_wake' : 'material_progress', { poll_identity: pollIdentity });
    }
    const decision = decideQuietPoll({
      poll_identity: pollIdentity,
      previous_material_state: previousFingerprint ?? ZERO_STATE,
      next_material_state: state.accepted.fingerprint,
      signal,
    });
    if (!validateQuietState(decision).valid) throw new TypeError('quiet_state_decision_invalid');
    const event = Object.freeze({
      wake_id: wakeId,
      operation_id: state.operation_id,
      cursor: state.cursor,
      status: material.status,
      revision: material.revision,
      reason_code: material.reason_code,
      result_identity: material.result_identity,
      decision,
    });
    if (material.status === 'done') {
      state.terminal = { wake_id: wakeId, result_identity: material.result_identity, cursor: state.cursor };
      state.next_poll_at_ms = null;
    }
    // Commit dedupe/cursor state before delivery so concurrent pollers and
    // restarts cannot replay the same wake.
    await this.writeState(state);
    if (notify) await notify(event);
    return compactResult(state, decision.reason, {
      disposition: decision.disposition,
      notifications: 1,
      poll_identity: pollIdentity,
      wake_id: wakeId,
      event,
    });
  }

  async handlePollError(state, error, pollIdentity, notify, now) {
    const reasonCode = errorCode(error);
    const failureIdentity = sha(canonicalJson({ source: 'poll_error', reason_code: reasonCode }));
    state.retry.consecutive_failures = Math.min(state.retry.consecutive_failures + 1, this.policy.max_attempts);
    const attempt = state.retry.consecutive_failures;
    state.next_poll_at_ms = now + deterministicBackoffMs(attempt, this.policy);
    if (attempt < this.policy.max_attempts) {
      await this.writeState(state);
      return compactResult(state, 'retry_scheduled', { poll_identity: pollIdentity, retry_attempt: attempt });
    }
    if (state.retry.active_failure_identity !== failureIdentity) {
      state.retry.failure_generation += 1;
      state.retry.active_failure_identity = failureIdentity;
    }
    const material = {
      status: 'failed',
      revision: `poll-error-${state.retry.failure_generation}`,
      progress_bucket: null,
      reason_code: reasonCode,
      result_identity: null,
    };
    const previousFingerprint = state.accepted?.fingerprint ?? null;
    state.accepted = { fingerprint: sha(canonicalJson(material)), material };
    state.candidate = null;
    return this.emitWake(state, material, previousFingerprint, pollIdentity, notify);
  }

  async poll({ operation_id: operationId, poller_id: pollerId = 'controller', fetch_state: fetchState, notify } = {}) {
    assertIdentifier(operationId, 'operation_id');
    assertIdentifier(pollerId, 'poller_id');
    if (typeof fetchState !== 'function') throw new TypeError('fetch_state must be a function');
    if (notify !== undefined && typeof notify !== 'function') throw new TypeError('notify must be a function');
    await this.initialize();
    const lock = await this.acquireLock(operationId);
    try {
      const state = await this.readState(operationId);
      const now = this.clock();
      integerInRange(now, 0, Number.MAX_SAFE_INTEGER, 'clock value');
      if (state.terminal) return compactResult(state, 'terminal_replay');
      if (now < state.next_poll_at_ms) return compactResult(state, 'not_due');

      state.poll_sequence += 1;
      const pollIdentity = this.pollIdentity(state, pollerId);
      let normalized;
      try {
        normalized = normalizeSnapshot(await fetchState(Object.freeze({
          operation_id: operationId,
          cursor: state.cursor,
          retry_attempt: Math.min(state.retry.consecutive_failures + 1, this.policy.max_attempts),
          poll_identity: pollIdentity,
        })), this.policy.progress_threshold);
      } catch (error) {
        // Keep the operation lock until the durable retry/wake transition and
        // optional delivery are complete; returning the bare promise would run
        // the finally block early.
        return await this.handlePollError(state, error, pollIdentity, notify, now);
      }

      state.retry.consecutive_failures = 0;
      state.next_poll_at_ms = now + this.policy.poll_interval_ms;
      if (state.cursor !== null && normalized.cursor < state.cursor) {
        await this.writeState(state);
        return compactResult(state, 'stale_cursor', { poll_identity: pollIdentity });
      }
      if (state.cursor !== null && normalized.cursor === state.cursor && state.last_seen_fingerprint !== normalized.fingerprint) {
        await this.writeState(state);
        return compactResult(state, 'cursor_conflict', { poll_identity: pollIdentity });
      }

      if (state.cursor === null || normalized.cursor > state.cursor) state.cursor = normalized.cursor;
      state.last_seen_fingerprint = normalized.fingerprint;
      if (state.accepted?.fingerprint === normalized.fingerprint) {
        state.candidate = null;
        await this.writeState(state);
        return compactResult(state, 'unchanged', { poll_identity: pollIdentity });
      }

      if (state.candidate?.fingerprint === normalized.fingerprint) {
        state.candidate.count += 1;
        state.candidate.cursor = normalized.cursor;
      } else {
        state.candidate = { fingerprint: normalized.fingerprint, material: normalized.material, cursor: normalized.cursor, count: 1 };
      }
      if (state.candidate.count < this.policy.debounce_polls) {
        await this.writeState(state);
        return compactResult(state, 'debouncing', { poll_identity: pollIdentity, debounce_count: state.candidate.count });
      }

      const previousFingerprint = state.accepted?.fingerprint ?? null;
      const firstAcceptedState = state.accepted === null;
      state.accepted = { fingerprint: normalized.fingerprint, material: normalized.material };
      state.candidate = null;
      const signal = wakeSignal(normalized.material.status);
      if (normalized.material.status === 'failed') {
        const externalFailureIdentity = sha(canonicalJson({
          source: 'external_state',
          revision: normalized.material.revision,
          reason_code: normalized.material.reason_code,
        }));
        if (state.retry.active_failure_identity !== externalFailureIdentity) {
          state.retry.failure_generation += 1;
          state.retry.active_failure_identity = externalFailureIdentity;
        }
      } else {
        state.retry.active_failure_identity = null;
      }
      if (!signal) {
        await this.writeState(state);
        return compactResult(state, firstAcceptedState ? 'initialized' : 'material_progress', { poll_identity: pollIdentity });
      }
      return await this.emitWake(state, normalized.material, previousFingerprint, pollIdentity, notify);
    } finally {
      await this.releaseLock(lock);
    }
  }

  pollOnce(options) {
    return this.poll(options);
  }

  async inspect(operationId) {
    assertIdentifier(operationId, 'operation_id');
    await this.initialize();
    const lock = await this.acquireLock(operationId);
    try {
      const state = await this.readState(operationId);
      return Object.freeze({
        operation_id: state.operation_id,
        cursor: state.cursor,
        next_poll_at_ms: state.next_poll_at_ms,
        consecutive_failures: state.retry.consecutive_failures,
        terminal: state.terminal ? { ...state.terminal } : null,
        seen_wake_count: state.seen_wake_ids.length,
      });
    } finally {
      await this.releaseLock(lock);
    }
  }
}
