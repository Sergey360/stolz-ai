const C1 = Object.freeze({
  'claude-code': { version: '2.1.251', adapter: 'claude-code', package: '@anthropic-ai/claude-code@2.1.251', sha256: '1aaadbe01265e82bd28c2e2639a2a6a0604edbb124f997e9d3a4d09b823c6fb8' },
  'qwen-code': { version: '0.22.3', adapter: 'qwen-code', package: '@qwen-code/qwen-code@0.22.3', sha256: 'af76ba6061bebbaf64f9505fb4eafd30594a58db183904285c6b7e8f8c6a7701' },
});

const C2_WITHHELD = Object.freeze({
  'claude-code': Object.freeze({ certification_id: 'claude-code-c2-withheld-unavailable-v1', version: '2.1.251', adapter: 'claude-code', owner: 'claude-code-runtime-collector' }),
  'qwen-code': Object.freeze({ certification_id: 'qwen-code-c2-withheld-unavailable-v1', version: '0.22.3', adapter: 'qwen-code', owner: 'qwen-code-runtime-collector' }),
});
const C2_KEYS = ['availability', 'certification_id', 'evidence', 'expected_evidence_class', 'level', 'outcome_gate', 'reason', 'recheck_trigger', 'retry_owner', 'schema_version', 'status', 'tuple', 'verification_gate'];
const TUPLE_KEYS = ['adapter_id', 'adapter_version', 'model_configuration', 'overlay_id', 'overlay_version', 'protocol_or_plan', 'runtime_id', 'runtime_version'];

function hasExactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
}

function isExactC2Withheld(record) {
  const expected = C2_WITHHELD[record?.tuple?.runtime_id];
  const tuple = record?.tuple;
  return Boolean(expected && hasExactKeys(record, C2_KEYS) && hasExactKeys(tuple, TUPLE_KEYS)
    && record.schema_version === '1.0' && record.certification_id === expected.certification_id && record.level === 'C2'
    && record.status === 'withheld' && record.availability === 'unavailable' && record.expected_evidence_class === 'runtime_telemetry'
    && record.reason === 'declared runtime telemetry capture is not available offline' && record.retry_owner === expected.owner
    && record.recheck_trigger === 'sanitized runtime collector evidence is retained' && Array.isArray(record.evidence) && record.evidence.length === 0
    && record.outcome_gate === 'not_run' && record.verification_gate === 'not_run' && tuple.runtime_version === expected.version
    && tuple.adapter_id === expected.adapter && tuple.adapter_version === '1.0.0' && tuple.overlay_id === 'none'
    && tuple.overlay_version === '1.0.0' && tuple.protocol_or_plan === 'runtime-cli' && tuple.model_configuration === 'not_available');
}

import { C3_TUPLES, admitProviderEvidence, containsSecretMaterial, matchesC3Tuple } from './provider-evidence-admission.mjs';

const C3_WITHHELD_KEYS = ['availability', 'certification_id', 'evidence', 'expected_evidence_class', 'level', 'outcome_gate', 'reason', 'recheck_trigger', 'retry_owner', 'schema_version', 'status', 'tuple', 'verification_gate'];
const C3_LIVE_KEYS = ['certification_id', 'compared_routes', 'evidence', 'level', 'outcome_gate', 'schema_version', 'status', 'tuple', 'verification_gate'];
const C3_TUPLE_KEYS = ['adapter_id', 'adapter_version', 'model_configuration', 'overlay_id', 'overlay_version', 'protocol_or_plan', 'provider_id', 'runtime_id', 'runtime_version'];
const REFERENCE_KEYS = ['class', 'evidence_id', 'redaction_status', 'sha256'];
const PROVIDER_REFERENCE_KEYS = ['adapter_id', 'adapter_version', 'class', 'evidence_id', 'model_configuration', 'outcome_gate', 'overlay_id', 'overlay_version', 'protocol_or_plan', 'provider_id', 'redaction_status', 'route_identity', 'route_role', 'runtime_id', 'runtime_version', 'sha256', 'verification_gate'];
const SHA256 = /^[a-f0-9]{64}$/;
const c3Expected = (record) => C3_TUPLES[`${record?.tuple?.runtime_id}-${record?.tuple?.overlay_id}`];

function isExactC3Withheld(record) {
  const expected = c3Expected(record);
  return Boolean(expected && hasExactKeys(record, C3_WITHHELD_KEYS) && hasExactKeys(record.tuple, C3_TUPLE_KEYS)
    && record.schema_version === '1.0' && record.certification_id === `${record.tuple.runtime_id}-${record.tuple.overlay_id}-c3-withheld-unavailable-v1`
    && record.level === 'C3' && record.status === 'withheld' && record.availability === 'unavailable' && record.expected_evidence_class === 'provider_export'
    && record.reason === 'No retained sanitized provider export is available for the declared C3 tuple.' && record.retry_owner === 'provider-evidence-v0.3'
    && record.recheck_trigger === 'A sanitized baseline and candidate provider export are retained for this exact tuple.' && Array.isArray(record.evidence) && record.evidence.length === 0
    && record.outcome_gate === 'not_run' && record.verification_gate === 'not_run' && matchesC3Tuple(record.tuple, expected) && !containsSecretMaterial(record));
}

function isExactLiveC3(record, retainedExports) {
  const expected = c3Expected(record);
  if (!expected || !hasExactKeys(record, C3_LIVE_KEYS) || !hasExactKeys(record.tuple, C3_TUPLE_KEYS) || containsSecretMaterial(record)
    || record.schema_version !== '1.0' || typeof record.certification_id !== 'string' || record.certification_id.length === 0 || record.level !== 'C3' || record.status !== 'live_provider_certified'
    || record.outcome_gate !== 'passed' || record.verification_gate !== 'passed' || !matchesC3Tuple(record.tuple, expected)
    || !Array.isArray(record.compared_routes) || record.compared_routes.length !== 2 || !Array.isArray(record.evidence) || record.evidence.length !== 4 || !Array.isArray(retainedExports) || retainedExports.length !== 2) return false;
  const routes = record.compared_routes;
  if (!routes.every((route) => hasExactKeys(route, ['route_identity', 'route_role']) && typeof route.route_identity === 'string' && route.route_identity.length > 0 && ['baseline', 'candidate'].includes(route.route_role))
    || new Set(routes.map((route) => route.route_role)).size !== 2 || new Set(routes.map((route) => route.route_identity)).size !== 2) return false;
  const refs = record.evidence;
  if (!refs.every((ref) => ref && typeof ref === 'object' && !Array.isArray(ref) && ['cli', 'runtime_telemetry', 'provider_export'].includes(ref.class)
    && hasExactKeys(ref, ref.class === 'provider_export' ? PROVIDER_REFERENCE_KEYS : REFERENCE_KEYS) && typeof ref.evidence_id === 'string' && ref.evidence_id.length > 0 && SHA256.test(ref.sha256) && ref.redaction_status === 'passed')) return false;
  if (refs.filter((ref) => ref.class === 'cli').length !== 1 || refs.filter((ref) => ref.class === 'runtime_telemetry').length !== 1 || refs.filter((ref) => ref.class === 'provider_export').length !== 2 || new Set(refs.map((ref) => ref.evidence_id)).size !== 4) return false;
  const providerRefs = refs.filter((ref) => ref.class === 'provider_export');
  if (!providerRefs.every((ref) => ref.outcome_gate === 'passed' && ref.verification_gate === 'passed' && matchesC3Tuple(Object.fromEntries(C3_TUPLE_KEYS.map((key) => [key, ref[key]])), expected))
    || new Set(providerRefs.map((ref) => ref.sha256)).size !== 2 || new Set(providerRefs.map((ref) => ref.route_identity)).size !== 2 || new Set(providerRefs.map((ref) => ref.route_role)).size !== 2) return false;
  const retainedByRoute = routes.map((route) => retainedExports.find((item) => item?.route_identity === route.route_identity && item?.route_role === route.route_role));
  if (retainedByRoute.some((item) => !item)
    || new Set(retainedByRoute.map((item) => item.evidence_id)).size !== 2
    || new Set(retainedByRoute.map((item) => item.retained_record_sha256)).size !== 2
    || new Set(retainedByRoute.map((item) => item.raw_evidence_identity_sha256)).size !== 2
    || new Set(retainedByRoute.map((item) => item.capture?.raw_evidence_sha256)).size !== 2) return false;
  return routes.every((route) => {
    const ref = providerRefs.find((item) => item.route_identity === route.route_identity && item.route_role === route.route_role);
    const retained = retainedExports.find((item) => item?.route_identity === route.route_identity && item?.route_role === route.route_role);
    return Boolean(ref && retained && ref.evidence_id === retained.evidence_id && ref.sha256 === retained.retained_record_sha256 && admitProviderEvidence(retained, expected, route).admitted);
  });
}

/** Semantic certification admission is deliberately closed: a schema-valid near miss is not certified. */
export function admitRuntimeCertification(record, retainedExports) {
  if (record?.level === 'C2' && record?.status === 'withheld') return isExactC2Withheld(record) ? { admitted: true, level: 'C2', disposition: 'withheld' } : { admitted: false, reason: 'c2_withheld_disposition_mismatch' };
  if (record?.level === 'C3') {
    if (record.status === 'withheld') return isExactC3Withheld(record) ? { admitted: true, level: 'C3', disposition: 'withheld' } : { admitted: false, reason: 'c3_withheld_disposition_mismatch' };
    return isExactLiveC3(record, retainedExports) ? { admitted: true, level: 'C3' } : { admitted: false, reason: 'c3_live_envelope_or_retained_evidence_mismatch' };
  }
  const expected = C1[record?.tuple?.runtime_id];
  const evidence = record?.evidence?.find(({ class: klass }) => klass === 'cli');
  const command = record?.command;
  const valid = Boolean(expected && record.schema_version === '1.0' && record.level === 'C1' && record.status === 'cli_certified'
    && record.tuple.runtime_version === expected.version && record.tuple.adapter_id === expected.adapter && record.tuple.adapter_version === '1.0.0'
    && record.tuple.overlay_id === 'none' && record.tuple.overlay_version === '1.0.0' && record.tuple.protocol_or_plan === 'runtime-cli'
    && command?.program === 'npx' && JSON.stringify(command.argv) === JSON.stringify(['--yes', expected.package, '--version'])
    && command.node_requirement === 'v22.16.0' && command.sanitized_stdout_sha256 === expected.sha256 && evidence?.sha256 === expected.sha256
    && command.settings_source === `fixtures/runtime-adapters/${record.tuple.runtime_id}/c0.fixture.json` && command.provider_claim === 'none');
  return valid ? { admitted: true, level: 'C1' } : { admitted: false, reason: 'c1_tuple_or_evidence_mismatch' };
}
