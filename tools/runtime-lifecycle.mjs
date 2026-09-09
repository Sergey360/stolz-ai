/**
 * The v0.7 lifecycle is deliberately a small, pure boundary.  Runtime
 * selection and provider-overlay selection may meet in a certification tuple,
 * but overlays are never registered or returned as runtimes and no mutable
 * provider state is accepted here.
 */
export const RUNTIME_IDS = Object.freeze(['claude-code', 'qwen-code']);
export const PROVIDER_OVERLAY_IDS = Object.freeze(['anthropic-api', 'alibaba-model-studio', 'zai']);
export const LIFECYCLE_STATES = Object.freeze(['certified', 'stale', 'recheck_required', 'withheld', 'revoked']);

const runtimeIds = new Set(RUNTIME_IDS);
const overlayIds = new Set(PROVIDER_OVERLAY_IDS);
const lifecycleStates = new Set(LIFECYCLE_STATES);
const SHA256 = /^[a-f0-9]{64}$/;
const TUPLE_KEYS = ['runtime_id', 'runtime_version', 'adapter_version', 'overlay_id', 'overlay_version', 'schema_version'];
const SECRETISH_KEY = /(?:credential|secret|authorization|token|password|prompt|response|cache|state|endpoint)/i;

export function isRuntimeId(value) {
  return runtimeIds.has(value);
}

export function isProviderOverlayId(value) {
  return overlayIds.has(value);
}

/** A registry only accepts agent runtimes; provider overlays categorically fail. */
export function registerRuntime(runtimeId) {
  if (isProviderOverlayId(runtimeId)) throw new TypeError('provider overlays cannot be registered as runtimes');
  if (!isRuntimeId(runtimeId)) throw new TypeError('unsupported runtime');
  return runtimeId;
}

function exactTuple(tuple) {
  if (!tuple || typeof tuple !== 'object' || Array.isArray(tuple)
    || Object.keys(tuple).length !== TUPLE_KEYS.length || !TUPLE_KEYS.every((key) => Object.hasOwn(tuple, key))) return false;
  return isRuntimeId(tuple.runtime_id)
    && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(tuple.runtime_version)
    && typeof tuple.adapter_version === 'string' && tuple.adapter_version.length > 0
    && (tuple.overlay_id === 'none' || isProviderOverlayId(tuple.overlay_id))
    && typeof tuple.overlay_version === 'string' && tuple.overlay_version.length > 0
    && tuple.schema_version === '0.7.0';
}

function tupleChanged(previous, current) {
  return TUPLE_KEYS.some((key) => previous[key] !== current[key]);
}

function assertEvidenceHash(value) {
  if (!SHA256.test(value ?? '')) throw new TypeError('evidence_sha256 must be a SHA-256 digest');
}

/**
 * Advance an immutable lifecycle record.  A changed certified tuple always
 * invalidates before it can be certified again; callers must make a second
 * `recertify` request with fresh admitted evidence.
 */
export function advanceCertification({ previous, current_tuple, action, evidence_sha256, invalidation_reason } = {}) {
  if (!exactTuple(current_tuple)) throw new TypeError('current_tuple must be a complete supported v0.7 tuple');
  assertEvidenceHash(evidence_sha256);
  const prior = previous?.status ?? 'withheld';
  if (!lifecycleStates.has(prior)) throw new TypeError('previous status is unsupported');
  const priorTuple = previous?.tuple;

  let status;
  let transition;
  let reason;
  if (prior === 'certified' && (!exactTuple(priorTuple) || tupleChanged(priorTuple, current_tuple))) {
    status = 'stale'; transition = 'invalidate';
    reason = invalidation_reason ?? (priorTuple?.runtime_version !== current_tuple.runtime_version ? 'runtime_version_changed' : 'schema_changed');
  } else if (action === 'select' && prior === 'stale') {
    status = 'recheck_required'; transition = 'require_recheck'; reason = invalidation_reason ?? 'runtime_version_changed';
  } else if (action === 'revoke') {
    status = 'revoked'; transition = 'revoke'; reason = invalidation_reason ?? 'privacy_violation';
  } else if (action === 'withhold') {
    status = 'withheld'; transition = 'withhold';
  } else if (action === 'certify' && prior === 'withheld') {
    status = 'certified'; transition = 'certify';
  } else if (action === 'recertify' && prior !== 'certified') {
    status = 'certified'; transition = 'recertify';
  } else {
    throw new TypeError('lifecycle transition is not permitted');
  }

  return Object.freeze({
    schema_version: '0.7.0',
    certification_id: previous?.certification_id ?? `runtime-${current_tuple.runtime_id}-lifecycle`,
    tuple: Object.freeze({ ...current_tuple }),
    previous_status: prior,
    status,
    transition,
    evidence_sha256,
    ...(reason ? { invalidation_reason: reason } : {}),
  });
}

/** Non-certified lifecycle states are visible but never reusable as evidence. */
export function admitLifecycleEvidence(record) {
  if (!record || record.status !== 'certified' || !exactTuple(record.tuple) || !SHA256.test(record.evidence_sha256 ?? '')) {
    return { admitted: false, reason: 'non_certified_or_invalid_lifecycle' };
  }
  return { admitted: true, runtime_id: record.tuple.runtime_id, runtime_version: record.tuple.runtime_version };
}

/** Reuse, benchmark, and claim paths share the same certification gate. */
export function admitLifecycleForGate(record, gate) {
  if (!['reuse', 'benchmark', 'claim'].includes(gate)) throw new TypeError('unsupported lifecycle evidence gate');
  return admitLifecycleEvidence(record);
}

/** Runtime profiles cannot carry provider credentials, state, cache, or evidence. */
export function admitRuntimeProfileIsolation(profile) {
  if (!profile || typeof profile !== 'object' || !isRuntimeId(profile.agent_runtime?.id)) return { admitted: false, reason: 'unsupported_runtime_profile' };
  if (profile.provider_overlay?.overlay_id !== 'none') return { admitted: false, reason: 'provider_overlay_cross_talk' };
  const forbidden = Object.keys(profile).find((key) => SECRETISH_KEY.test(key));
  return forbidden ? { admitted: false, reason: 'profile_cross_talk_field' } : { admitted: true, runtime_id: profile.agent_runtime.id };
}
