import { canonicalSha256, sanitizeRuntimeEvent } from './admission.mjs';

const RUNTIMES = Object.freeze({
  'claude-code': Object.freeze({ name: 'Claude Code', version: '2.1.251', emitted_by: 'runtime_cli', method: 'cli_json', adapter_id: 'claude-code', collector: 'claude-code-c2-adapter' }),
  'qwen-code': Object.freeze({ name: 'Qwen Code', version: '0.22.3', emitted_by: 'runtime_otel', method: 'otel', adapter_id: 'qwen-code', collector: 'qwen-code-c2-adapter' }),
});

const ADAPTER_VERSION = '1.0.0';
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function assertedInstant(value) {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value) || new Date(value).toISOString() !== value) {
    throw new TypeError('captured_at must be a canonical RFC 3339 UTC instant');
  }
}

function fields(event) {
  return ['event_class', 'result', ...Object.keys(event.counters).sort()];
}

/**
 * Build a v0.7 C2 record for one runtime only. A caller-supplied version is
 * never normalized to the supported version: it is explicitly withheld when
 * it differs, so a former exact-version certification cannot leak forward.
 */
export function createC2RuntimeAdapter(runtime_id) {
  const runtime = RUNTIMES[runtime_id];
  if (!runtime) throw new TypeError('unsupported C2 runtime');

  return Object.freeze({
    runtime_id,
    runtime_name: runtime.name,
    supported_version: runtime.version,
    adapter_id: runtime.adapter_id,
    adapter_version: ADAPTER_VERSION,
    emit({ runtime_version, raw_event, captured_at, emitted_by = runtime.emitted_by, method = runtime.method }) {
      assertedInstant(captured_at);
      const exactVersion = runtime_version === runtime.version;
      let retained;
      try {
        // Sanitization is intentionally performed for the declared runtime
        // tuple only; drifted tuples do not obtain retained C2 evidence.
        retained = exactVersion ? sanitizeRuntimeEvent({ runtime_id, runtime_version, emitted_by, method, raw_event }) : null;
      } catch {
        retained = null;
      }
      const certified = Boolean(retained);
      const retained_evidence = certified
        ? { sha256: canonicalSha256({ domain: 'stolz-c2-retained-evidence-v0.7', runtime_id, runtime_version, captured_at, event: retained.event }), captured_at, fields: fields(retained.event) }
        : { sha256: canonicalSha256({ domain: 'stolz-c2-withheld-v0.7', runtime_id, runtime_version: String(runtime_version), captured_at }), captured_at, fields: ['event_class'] };
      return Object.freeze({
        schema_version: '0.7.0',
        runtime: { id: runtime_id, name: runtime.name, supported_version: runtime_version },
        adapter: { id: runtime.adapter_id, version: ADAPTER_VERSION, tool_build_version: ADAPTER_VERSION },
        source_class: 'runtime_telemetry',
        provenance: { collector: runtime.collector, kind: 'runtime_telemetry' },
        lifecycle_state: certified ? 'certified' : 'withheld',
        certification_status: certified ? 'certified' : 'withheld',
        retained_evidence,
      });
    },
  });
}

export function admitC2RuntimeTelemetry(record) {
  const declared = RUNTIMES[record?.runtime?.id];
  if (!declared || record?.schema_version !== '0.7.0' || record?.source_class !== 'runtime_telemetry') return { admitted: false, reason: 'unsupported_c2_tuple' };
  if (record.runtime.name !== declared.name || record.adapter?.id !== declared.adapter_id || record.adapter?.version !== ADAPTER_VERSION
    || record.adapter?.tool_build_version !== ADAPTER_VERSION || record.provenance?.collector !== declared.collector
    || record.provenance?.kind !== 'runtime_telemetry' || record.lifecycle_state !== record.certification_status) return { admitted: false, reason: 'c2_identity_mismatch' };
  if (record.certification_status !== 'certified') return { admitted: false, reason: 'c2_withheld' };
  if (record.runtime.supported_version !== declared.version || !/^[a-f0-9]{64}$/.test(record.retained_evidence?.sha256 ?? '')) return { admitted: false, reason: 'c2_version_or_evidence_mismatch' };
  return { admitted: true, level: 'C2', runtime_id: record.runtime.id, runtime_version: record.runtime.supported_version };
}
