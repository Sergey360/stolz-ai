import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PROVIDER_KEYS = ['adapter_id', 'adapter_version', 'capture', 'evidence_id', 'model_configuration', 'outcome_gate', 'overlay_id', 'overlay_version', 'protocol_or_plan', 'provider_id', 'raw_evidence_identity_sha256', 'redaction_status', 'retained_record_sha256', 'route_identity', 'route_role', 'runtime_id', 'runtime_version', 'schema_version', 'source_class', 'usage_fields', 'verification_gate'];
const CAPTURE_KEYS = ['captured_at', 'method', 'raw_evidence_sha256'];
const USAGE_FIELDS = new Set(['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_creation_tokens', 'total_tokens']);
const SECRET_KEY = /(?:^|[_-])(authorization|auth|credential|secret|password|prompt|response|environment|vendor|path|token|key)(?:$|[_-])/i;
const SECRET_VALUE = /(?:bearer|basic)\s+[a-z0-9._~+\/=:-]+|(?:sk-|api[_-]?key[=:])[a-z0-9_-]{6,}|https?:\/\/[^/]*@/i;

export const C3_TUPLES = Object.freeze(Object.fromEntries(['claude-code', 'qwen-code'].flatMap((runtime_id) => {
  const runtime_version = runtime_id === 'claude-code' ? '2.1.251' : '0.22.3';
  return [['anthropic-api', 'anthropic', 'standard', 'claude-3-5-sonnet'], ['alibaba-model-studio', 'alibaba-model-studio', 'international', 'qwen-plus'], ['zai', 'zai', 'global', 'glm-4.5']]
    .map(([overlay_id, provider_id, protocol_or_plan, model_configuration]) => [`${runtime_id}-${overlay_id}`, Object.freeze({ runtime_id, runtime_version, adapter_id: runtime_id, adapter_version: '1.0.0', overlay_id, overlay_version: '1.0.0', provider_id, protocol_or_plan, model_configuration })]);
})));

const exactKeys = (value, keys) => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;

export function containsSecretMaterial(value) {
  if (typeof value === 'string') return SECRET_VALUE.test(value);
  if (Array.isArray(value)) return value.some(containsSecretMaterial);
  return Boolean(value && typeof value === 'object' && Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || containsSecretMaterial(child)));
}

export function isCanonicalUtc(value) {
  return typeof value === 'string' && UTC.test(value) && !Number.isNaN(new Date(value).valueOf()) && new Date(value).toISOString() === value;
}

export function retainedProviderEvidenceIdentity(record) {
  const { retained_record_sha256, ...unsigned } = record ?? {};
  return createHash('sha256').update(JSON.stringify(canonicalize(unsigned))).digest('hex');
}

export const matchesC3Tuple = (value, expected) => Boolean(expected && exactKeys(value, Object.keys(expected)) && Object.entries(expected).every(([key, item]) => value[key] === item));

/** Validate a complete, sanitized retained export. Its hash is integrity-only evidence. */
export function admitProviderEvidence(record, expectedTuple, expectedRoute) {
  if (!exactKeys(record, PROVIDER_KEYS) || !exactKeys(record.capture, CAPTURE_KEYS) || containsSecretMaterial(record)) return { admitted: false, reason: 'provider_export_envelope_or_secret_mismatch' };
  const scalarStrings = ['evidence_id', 'route_identity'];
  if (scalarStrings.some((key) => typeof record[key] !== 'string' || record[key].length === 0)
    || record.schema_version !== '1.0' || record.source_class !== 'provider_export' || record.route_role !== expectedRoute?.route_role || record.route_identity !== expectedRoute?.route_identity
    || record.capture.method !== 'provider_export' || !isCanonicalUtc(record.capture.captured_at)
    || !SHA256.test(record.capture.raw_evidence_sha256) || !SHA256.test(record.raw_evidence_identity_sha256) || record.raw_evidence_identity_sha256 !== record.capture.raw_evidence_sha256
    || !SHA256.test(record.retained_record_sha256) || record.retained_record_sha256 !== retainedProviderEvidenceIdentity(record)
    || !Array.isArray(record.usage_fields) || record.usage_fields.length === 0 || new Set(record.usage_fields).size !== record.usage_fields.length || record.usage_fields.some((field) => typeof field !== 'string' || !USAGE_FIELDS.has(field))
    || record.outcome_gate !== 'passed' || record.verification_gate !== 'passed' || record.redaction_status !== 'passed' || !matchesC3Tuple(Object.fromEntries(Object.keys(expectedTuple ?? {}).map((key) => [key, record[key]])), expectedTuple)) return { admitted: false, reason: 'provider_export_content_or_tuple_mismatch' };
  return { admitted: true };
}
