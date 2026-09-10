const TERMINAL_RESULT_STATES = new Set(['reused', 'timeout', 'unavailable', 'compatibility_mismatch']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function compatibilityKey(compatibility) {
  if (!compatibility || typeof compatibility !== 'object' || Array.isArray(compatibility)) {
    throw new TypeError('compatibility tuple is required');
  }
  return JSON.stringify(canonical(compatibility));
}

function controllerResult(lease) {
  return Object.freeze({
    role: 'controller',
    identity_digest: lease.identityDigest,
    holder_id: lease.holderId,
    fence: lease.fence,
    expires_at: lease.expiresAt,
  });
}

function terminal(state, extra = {}) {
  if (!TERMINAL_RESULT_STATES.has(state)) throw new TypeError(`unknown terminal state: ${state}`);
  return Object.freeze({ role: 'follower', state, ...extra });
}

/**
 * An intentionally in-memory S2 lease coordinator. It owns no ledger or
 * artifact-store path: the later durable writer must pass this coordinator's
 * current fence before it writes a verified terminal entry.
 */
export class FencedCoalescingCoordinator {
  #records = new Map();

  acquire({ identity_digest: identityDigest, compatibility, holder_id: holderId, now, lease_ms: leaseMs }) {
    if (typeof identityDigest !== 'string' || !identityDigest) throw new TypeError('identity_digest is required');
    if (typeof holderId !== 'string' || !holderId) throw new TypeError('holder_id is required');
    if (!Number.isFinite(now) || !Number.isFinite(leaseMs) || leaseMs <= 0) throw new TypeError('now and positive lease_ms are required');
    const key = compatibilityKey(compatibility);
    let record = this.#records.get(identityDigest);
    if (!record) {
      record = { nextFence: 0, lease: null, terminal: null };
      this.#records.set(identityDigest, record);
    }
    if (record.terminal?.compatibilityKey === key) return terminal('reused', { result: record.terminal.result });
    if (record.terminal && record.terminal.compatibilityKey !== key) return terminal('compatibility_mismatch');
    if (record.lease && record.lease.expiresAt > now) {
      if (record.lease.compatibilityKey !== key) return terminal('compatibility_mismatch');
      return Object.freeze({ role: 'follower', state: 'waiting', identity_digest: identityDigest, fence: record.lease.fence });
    }
    record.lease = {
      identityDigest,
      compatibilityKey: key,
      holderId,
      fence: ++record.nextFence,
      expiresAt: now + leaseMs,
    };
    return controllerResult(record.lease);
  }

  renew({ identity_digest: identityDigest, holder_id: holderId, fence, now, lease_ms: leaseMs }) {
    const lease = this.#records.get(identityDigest)?.lease;
    if (!lease || lease.holderId !== holderId || lease.fence !== fence || lease.expiresAt <= now) {
      return Object.freeze({ state: 'lease_lost' });
    }
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new TypeError('positive lease_ms is required');
    lease.expiresAt = now + leaseMs;
    return Object.freeze({ state: 'renewed', expires_at: lease.expiresAt });
  }

  commit({ identity_digest: identityDigest, holder_id: holderId, fence, compatibility, result, now }) {
    const record = this.#records.get(identityDigest);
    const lease = record?.lease;
    const key = compatibilityKey(compatibility);
    if (!lease || lease.holderId !== holderId || lease.fence !== fence || lease.compatibilityKey !== key || lease.expiresAt <= now) {
      return Object.freeze({ state: 'stale_fence' });
    }
    if (!result || result.verified !== true || result.identity_digest !== identityDigest || result.artifacts_verified !== true) {
      return Object.freeze({ state: 'verification_failed' });
    }
    record.terminal = { compatibilityKey: key, result: structuredClone(result) };
    record.lease = null;
    return Object.freeze({ state: 'committed', fence });
  }

  /** A follower may only return a verified controller result; it never executes work. */
  wait({ identity_digest: identityDigest, compatibility, now, timeout_ms: timeoutMs, poll_ms: pollMs = 1, sleep = async () => {} }) {
    if (!Number.isFinite(now) || !Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(pollMs) || pollMs <= 0) {
      throw new TypeError('valid now, timeout_ms, and positive poll_ms are required');
    }
    const key = compatibilityKey(compatibility);
    const deadline = now + timeoutMs;
    return (async () => {
      let current = now;
      while (current <= deadline) {
        const record = this.#records.get(identityDigest);
        if (record?.terminal?.compatibilityKey === key) return terminal('reused', { result: structuredClone(record.terminal.result) });
        if (record?.terminal || (record?.lease && record.lease.compatibilityKey !== key)) return terminal('compatibility_mismatch');
        if (!record?.lease || record.lease.expiresAt <= current) return terminal('unavailable');
        if (current === deadline) break;
        const delay = Math.min(pollMs, deadline - current);
        await sleep(delay);
        current += delay;
      }
      return terminal('timeout');
    })();
  }
}
