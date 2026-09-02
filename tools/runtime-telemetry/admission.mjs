import { createHash } from 'node:crypto';

const RUNTIME_CONTRACTS = Object.freeze({
  'claude-code': Object.freeze({
    version: '2.1.251', emitted_by: 'runtime_cli',
    methods: Object.freeze({ cli_json: 'json', cli_stream_json: 'stream_json' }),
    argv: Object.freeze(['--yes', '@anthropic-ai/claude-code@2.1.251', '--version']),
  }),
  'qwen-code': Object.freeze({
    version: '0.22.3', emitted_by: 'runtime_otel',
    methods: Object.freeze({ otel: 'otel' }),
    argv: Object.freeze(['--yes', '@qwen-code/qwen-code@0.22.3', '--version']),
  }),
});

const EVENT_CLASSES = new Set(['command_completed', 'tool_completed', 'session_completed']);
const RESULT_CLASSES = new Set(['succeeded', 'failed', 'cancelled']);
const COUNTERS = new Set(['duration_ms', 'input_units', 'output_units', 'tool_calls']);
const RECORD_KEYS = ['availability', 'capture', 'event', 'event_id', 'privacy', 'retained_identity_sha256', 'runtime', 'schema_version', 'source_class'];
const RUNTIME_KEYS = ['id', 'version'];
const EVENT_KEYS = ['counters', 'event_class', 'result'];
const CAPTURE_KEYS = ['captured_at', 'command_argc', 'command_identity_sha256', 'emitted_by', 'method', 'output_mode', 'raw_evidence_sha256', 'source_identity_sha256'];
const PRIVACY_KEYS = ['payload_retention', 'redaction_version', 'sensitive_attributes'];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex');
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
}

function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }

function isCanonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

export function commandIdentity(runtimeId) {
  const contract = RUNTIME_CONTRACTS[runtimeId];
  if (!contract) throw new TypeError('undeclared runtime');
  return canonicalSha256({ domain: 'stolz-runtime-command-v1', runtime_id: runtimeId, program: 'npx', argv: contract.argv });
}

function sanitizeEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) throw new TypeError('runtime event must be an object');
  const { event_class, result, counters = {} } = rawEvent;
  if (!EVENT_CLASSES.has(event_class) || !RESULT_CLASSES.has(result) || !counters || typeof counters !== 'object' || Array.isArray(counters)) throw new TypeError('unsupported runtime event class');
  if (Object.keys(counters).some((key) => !COUNTERS.has(key) || !Number.isSafeInteger(counters[key]) || counters[key] < 0)) throw new TypeError('unsupported runtime counter');
  return { event_class, result, counters: Object.fromEntries(Object.keys(counters).sort().map((key) => [key, counters[key]])) };
}

/** Select only non-secret class/result/counter fields before any retained identity is calculated. */
export function sanitizeRuntimeEvent({ runtime_id, runtime_version, emitted_by, method, raw_event }) {
  const contract = RUNTIME_CONTRACTS[runtime_id];
  const output_mode = contract?.methods[method];
  if (!contract || runtime_version !== contract.version || emitted_by !== contract.emitted_by || !output_mode) throw new TypeError('runtime capture tuple is not declared');
  const event = sanitizeEvent(raw_event);
  const source = { runtime: { id: runtime_id, version: runtime_version }, emitted_by, method, output_mode, command_identity_sha256: commandIdentity(runtime_id), command_argc: contract.argv.length };
  const raw_evidence_sha256 = canonicalSha256({ domain: 'stolz-runtime-event-v1', event });
  const source_identity_sha256 = canonicalSha256({ domain: 'stolz-runtime-source-v1', source, event });
  return { event, source, raw_evidence_sha256, source_identity_sha256 };
}

function retainedIdentity(record) {
  const { retained_identity_sha256: ignored, ...envelope } = record;
  return canonicalSha256({ domain: 'stolz-retained-runtime-telemetry-v1', envelope });
}

export function createRuntimeTelemetry(input) {
  if (!isCanonicalInstant(input.captured_at)) throw new TypeError('captured_at must be a canonical RFC 3339 UTC instant');
  const retained = sanitizeRuntimeEvent(input);
  const record = {
    schema_version: '1.0',
    event_id: `runtime-${retained.source_identity_sha256.slice(0, 16)}`,
    runtime: retained.source.runtime,
    source_class: 'runtime_telemetry',
    event: retained.event,
    capture: { emitted_by: retained.source.emitted_by, method: retained.source.method, output_mode: retained.source.output_mode, command_argc: retained.source.command_argc, command_identity_sha256: retained.source.command_identity_sha256, raw_evidence_sha256: retained.raw_evidence_sha256, source_identity_sha256: retained.source_identity_sha256, captured_at: input.captured_at },
    privacy: { redaction_version: '1', payload_retention: 'excluded', sensitive_attributes: 'disabled' },
    availability: 'available',
  };
  return { ...record, retained_identity_sha256: retainedIdentity(record) };
}

/** Direct admission does not depend on JSON Schema: every persisted object is closed and every identity is recomputed. */
export function admitRuntimeTelemetry(record) {
  try {
    if (!exactKeys(record, RECORD_KEYS) || !exactKeys(record.runtime, RUNTIME_KEYS) || !exactKeys(record.event, EVENT_KEYS)
      || !exactKeys(record.capture, CAPTURE_KEYS) || !exactKeys(record.privacy, PRIVACY_KEYS) || !exactKeys(record.event.counters, Object.keys(record.event.counters))
      || Object.keys(record.event.counters).some((key) => !COUNTERS.has(key))) throw new TypeError('unclosed telemetry envelope');
    if (record.schema_version !== '1.0' || record.source_class !== 'runtime_telemetry' || record.availability !== 'available'
      || record.privacy.redaction_version !== '1' || record.privacy.payload_retention !== 'excluded' || record.privacy.sensitive_attributes !== 'disabled'
      || !isCanonicalInstant(record.capture.captured_at) || !isSha256(record.retained_identity_sha256)) throw new TypeError('invalid telemetry envelope');
    const retained = sanitizeRuntimeEvent({ runtime_id: record.runtime.id, runtime_version: record.runtime.version, emitted_by: record.capture.emitted_by, method: record.capture.method, raw_event: record.event });
    if (record.event_id !== `runtime-${retained.source_identity_sha256.slice(0, 16)}`
      || record.capture.output_mode !== retained.source.output_mode || record.capture.command_argc !== retained.source.command_argc
      || record.capture.command_identity_sha256 !== retained.source.command_identity_sha256 || record.capture.raw_evidence_sha256 !== retained.raw_evidence_sha256
      || record.capture.source_identity_sha256 !== retained.source_identity_sha256 || record.retained_identity_sha256 !== retainedIdentity(record)) throw new TypeError('stale telemetry identity');
    return { admitted: true, level: 'C2_evidence' };
  } catch {
    return { admitted: false, reason: 'telemetry_tuple_or_identity_mismatch' };
  }
}

export const declaredRuntimeContracts = RUNTIME_CONTRACTS;
