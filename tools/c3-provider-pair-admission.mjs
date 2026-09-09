import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const RUNTIMES = new Set(['claude-code', 'qwen-code']);
const OVERLAYS = new Set(['anthropic-api', 'alibaba-model-studio', 'zai']);
const PAIR_KEYS = ['admission', 'baseline_export', 'outcome_identity', 'provider_overlay', 'runtime', 'scenario_id', 'schema_version', 'stolz_export', 'verification_identity', 'withheld_reason'];
const ADMITTED_KEYS = PAIR_KEYS.filter((key) => key !== 'withheld_reason');
const WITHHELD_REASONS = new Set(['missing_export', 'outcome_mismatch', 'verification_mismatch', 'non_comparable', 'privacy_rejected']);
const EXPORT_KEYS = ['outcome_identity', 'raw_export_sha256', 'retained_sha256', 'sanitized', 'scenario_id', 'verification_identity'];

const exactKeys = (value, keys) => Boolean(value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(canonicalize(value))).digest('hex');
const validIdentity = (value) => typeof value === 'string' && SHA256.test(value);

export function retainedC3ExportIdentity(record) {
  const { retained_sha256, ...unsigned } = record ?? {};
  return sha256(unsigned);
}

/**
 * Reduce an in-memory raw export to the only six fields permitted to persist.
 * The input is deliberately not returned, cached, logged, or written to disk.
 */
export function sanitizeC3RawProviderExport(rawExport, { scenario_id, outcome_identity, verification_identity }) {
  if (rawExport === undefined || !validIdentity(outcome_identity) || !validIdentity(verification_identity)
    || typeof scenario_id !== 'string' || !SAFE_ID.test(scenario_id)) return null;
  const raw_export_sha256 = sha256(rawExport);
  const retained = { raw_export_sha256, sanitized: true, scenario_id, outcome_identity, verification_identity };
  return { ...retained, retained_sha256: retainedC3ExportIdentity(retained) };
}

/** Return a visible terminal result whenever raw exports cannot be compared safely. */
export function withholdC3ProviderPair({ scenario_id, runtime, provider_overlay, outcome_identity, verification_identity, baseline_export = null, stolz_export = null, reason }) {
  return { schema_version: '0.7.0', scenario_id, runtime, provider_overlay, baseline_export, stolz_export, outcome_identity, verification_identity, admission: 'withheld', withheld_reason: WITHHELD_REASONS.has(reason) ? reason : 'non_comparable' };
}

/**
 * Semantically admit only two different sanitized raw exports for one scenario
 * with equal outcome and verification identities. All other states are withheld.
 */
export function admitC3ProviderPair(record) {
  const rootKeys = record?.admission === 'admitted' ? ADMITTED_KEYS : PAIR_KEYS;
  if (!exactKeys(record, rootKeys) || record.schema_version !== '0.7.0'
    || typeof record.scenario_id !== 'string' || !SAFE_ID.test(record.scenario_id)
    || !validIdentity(record.outcome_identity) || !validIdentity(record.verification_identity)
    || !exactKeys(record.runtime, ['id', 'supported_version']) || !RUNTIMES.has(record.runtime.id) || !SEMVER.test(record.runtime.supported_version)
    || !exactKeys(record.provider_overlay, ['id', 'version']) || !OVERLAYS.has(record.provider_overlay.id) || !SEMVER.test(record.provider_overlay.version)) return { admitted: false, reason: 'invalid_c3_pair_envelope' };
  if (record.admission === 'withheld') return WITHHELD_REASONS.has(record.withheld_reason)
    ? { admitted: false, disposition: 'withheld', reason: record.withheld_reason }
    : { admitted: false, reason: 'invalid_c3_pair_envelope' };
  if (record.admission !== 'admitted' || !exactKeys(record.baseline_export, EXPORT_KEYS) || !exactKeys(record.stolz_export, EXPORT_KEYS)) return { admitted: false, reason: 'invalid_c3_pair_envelope' };
  const exports = [record.baseline_export, record.stolz_export];
  if (!exports.every((item) => item.sanitized === true && item.scenario_id === record.scenario_id
    && item.outcome_identity === record.outcome_identity && item.verification_identity === record.verification_identity
    && validIdentity(item.raw_export_sha256) && validIdentity(item.retained_sha256)
    && item.retained_sha256 === retainedC3ExportIdentity(item))
    || exports[0].raw_export_sha256 === exports[1].raw_export_sha256
    || exports[0].retained_sha256 === exports[1].retained_sha256) return { admitted: false, disposition: 'withheld', reason: 'non_comparable' };
  return { admitted: true, disposition: 'admitted' };
}
