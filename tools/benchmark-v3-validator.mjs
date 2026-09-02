import { createHash } from 'node:crypto';
import {
  BENCHMARK_V3_RECORD_KEYS,
  loadBenchmarkV3Schemas,
  resolveBenchmarkV3Schema,
} from './benchmark-v3-schema-registry.mjs';

const EXPECTED_RUNTIME_METRICS = Object.freeze({
  model_wakeups: 'count',
  tool_calls: 'count',
  tool_output_bytes: 'bytes',
  wall_time_ms: 'milliseconds',
  operator_interventions: 'count',
  compaction_events: 'count',
});
const EXPECTED_PRICE_COMPONENTS = Object.freeze({
  input_uncached: 'per_1m_tokens',
  input_cached: 'per_1m_tokens',
  input_cache_write: 'per_1m_tokens',
  output: 'per_1m_tokens',
  hosted_tool: 'per_call',
});
const OVERHEAD_KEYS = Object.freeze([
  'routing',
  'context_selection',
  'reuse',
  'quiet_state',
  'benchmark_capture',
  'verification',
  'retry',
  'fallback',
]);
const PAIR_GATES = Object.freeze([
  'scenario_input',
  'environment_tuple',
  'route_declarations',
  'repetition_order',
  'reset_invalidation',
  'outcome',
  'verification',
]);
const REPORT_GATES = Object.freeze([
  'track_authority',
  'provenance',
  'redaction_retention',
  'pricing',
  'overhead',
  'equal_outcome',
  'equal_verification',
  'release_publication',
]);
const FORBIDDEN_RETAINED_MATERIAL = /(?:authorization|bearer\s|api[_-]?key|secret|password|sk-[A-Za-z0-9_-]{8,}|(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+))/i;

let validatorPromise;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function withoutIdentity(record) {
  const clone = structuredClone(record);
  delete clone.canonical_sha256;
  return clone;
}

export function canonicalBenchmarkV3Json(record) {
  return JSON.stringify(stable(withoutIdentity(record)));
}

export function computeBenchmarkV3Identity(record) {
  return createHash('sha256').update(canonicalBenchmarkV3Json(record)).digest('hex');
}

function sealNestedRecords(value) {
  if (Array.isArray(value)) return value.map(sealNestedRecords);
  if (!value || typeof value !== 'object') return value;
  const sealed = Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sealNestedRecords(nested)]));
  if (sealed.schema_id && sealed.schema_version && sealed.captured_at) sealed.canonical_sha256 = computeBenchmarkV3Identity(sealed);
  return sealed;
}

export function sealBenchmarkV3Record(record) {
  const sealed = sealNestedRecords(structuredClone(record));
  sealed.canonical_sha256 = computeBenchmarkV3Identity(sealed);
  return sealed;
}

async function compiledValidators() {
  if (!validatorPromise) validatorPromise = (async () => {
    const [{ default: Ajv2020 }, schemas] = await Promise.all([
      import('ajv/dist/2020.js'),
      loadBenchmarkV3Schemas(),
    ]);
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
    for (const { schema } of schemas) ajv.addSchema(schema);
    return new Map(schemas.filter(({ record }) => record).map(({ schema_id: schemaId, schema_version: version, uri }) => [
      `${schemaId}@${version}`,
      ajv.getSchema(uri),
    ]));
  })();
  return validatorPromise;
}

function add(errors, condition, code, path = '') {
  if (!condition) errors.push({ code, path });
}

function available(metric) {
  return metric?.availability === 'available';
}

function unique(values) {
  return new Set(values).size === values.length;
}

function equalSets(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function validateProvenance(record, errors) {
  add(errors, record.capture_window.started_at <= record.capture_window.ended_at, 'capture_window_reversed', '/capture_window');
  add(errors, record.raw_evidence_sha256 !== record.retained_evidence_sha256, 'raw_retained_identity_reused', '/retained_evidence_sha256');
  add(errors, !FORBIDDEN_RETAINED_MATERIAL.test(JSON.stringify(record)), 'forbidden_retained_material', '');
  const expected = {
    codex: 'codex-local',
    'claude-code': 'claude-code',
    'qwen-code': 'qwen-code',
  }[record.tuple.runtime_id];
  if (record.track === 'runtime_measured') {
    add(errors, record.tuple.adapter_id === expected && record.collector.id === expected, 'runtime_adapter_tuple_mismatch', '/tuple');
  } else if (record.capture_method === 'codex_cli_jsonl') {
    add(errors, record.schema_version === '1.1.0', 'codex_jsonl_provenance_version_mismatch', '/schema_version');
    add(errors, record.collector.id === 'codex-jsonl-collector'
      && record.tuple.runtime_id === 'codex-cli'
      && record.tuple.adapter_id === 'codex-jsonl-collector'
      && record.source.authority === 'openai_codex', 'codex_jsonl_provenance_tuple_mismatch', '/tuple');
  } else {
    add(errors, record.schema_version === '1.0.0'
      && record.collector.id === 'responses-collector'
      && record.tuple.runtime_id === 'responses-api'
      && record.tuple.adapter_id === 'responses-collector'
      && record.source.authority === 'openai_responses', 'responses_provenance_tuple_mismatch', '/tuple');
  }
  if (record.admission.disposition === 'admitted') {
    add(errors, record.redaction.result === 'passed', 'provenance_admitted_after_redaction_failure', '/redaction/result');
    add(errors, record.retention.disposal_status === 'retained', 'provenance_admitted_without_retained_evidence', '/retention/disposal_status');
    add(errors, record.retention.retain_until > record.capture_window.ended_at, 'provenance_admitted_after_retention_expiry', '/retention/retain_until');
  }
}

function validateCodexJsonlUsage(record, errors) {
  const input = record.input_tokens;
  const cached = record.cached_input_tokens;
  const cacheWrite = record.cache_write_input_tokens;
  const output = record.output_tokens;
  const reasoning = record.reasoning_output_tokens;
  const total = record.total_tokens;
  if ([cached, input].every(available)) add(errors, cached.value <= input.value, 'codex_cached_input_exceeds_input', '/cached_input_tokens/value');
  if ([reasoning, output].every(available)) add(errors, reasoning.value <= output.value, 'codex_reasoning_output_exceeds_output', '/reasoning_output_tokens/value');
  add(errors, !available(cacheWrite), 'codex_cache_write_partition_must_remain_unavailable', '/cache_write_input_tokens');
  add(errors, !available(total), 'codex_total_tokens_must_remain_unavailable', '/total_tokens');
}

function validateResponsesUsage(record, errors) {
  const input = record.input_tokens;
  const cached = record.input_tokens_details.cached_tokens;
  const write = record.input_tokens_details.cache_write_tokens;
  const output = record.output_tokens;
  const reasoning = record.output_tokens_details.reasoning_tokens;
  const total = record.total_tokens;
  const uncached = record.uncached_input_tokens;
  if ([input, output, total].every(available)) add(errors, total.value === input.value + output.value, 'responses_total_double_count_or_mismatch', '/total_tokens/value');
  if ([reasoning, output].every(available)) add(errors, reasoning.value <= output.value, 'reasoning_exceeds_output', '/output_tokens_details/reasoning_tokens/value');
  if ([cached, write, input].every(available)) add(errors, cached.value + write.value <= input.value, 'cache_partitions_exceed_input', '/input_tokens_details');
  if (available(uncached)) {
    add(errors, [input, cached, write].every(available), 'uncached_dependencies_unavailable', '/uncached_input_tokens');
    add(errors, uncached.provenance === 'derived', 'uncached_not_derived', '/uncached_input_tokens/provenance');
    add(errors, uncached.formula === 'input_tokens - cached_tokens - cache_write_tokens', 'uncached_formula_unknown', '/uncached_input_tokens/formula');
    add(errors, JSON.stringify(uncached.component_ids) === JSON.stringify(['input_tokens', 'cached_tokens', 'cache_write_tokens']), 'uncached_components_mismatch', '/uncached_input_tokens/component_ids');
    if ([input, cached, write].every(available)) add(errors, uncached.value === input.value - cached.value - write.value, 'uncached_value_mismatch', '/uncached_input_tokens/value');
  }
}

function validateRuntimeMeasurement(record, errors) {
  const names = record.metrics.map(({ name }) => name);
  add(errors, unique(names) && names.length === Object.keys(EXPECTED_RUNTIME_METRICS).length, 'runtime_metric_set_not_exact', '/metrics');
  for (const metric of record.metrics) add(errors, EXPECTED_RUNTIME_METRICS[metric.name] === metric.unit, 'runtime_metric_unit_mismatch', `/metrics/${metric.name}`);
}

function validatePricing(record, errors) {
  const names = record.components.map(({ name }) => name);
  add(errors, unique(names) && names.length === Object.keys(EXPECTED_PRICE_COMPONENTS).length, 'price_component_set_not_exact', '/components');
  for (const component of record.components) add(errors, EXPECTED_PRICE_COMPONENTS[component.name] === component.unit, 'price_component_unit_mismatch', `/components/${component.name}`);
  const complete = record.components.every(available) && available(record.conversion_basis);
  add(errors, complete ? available(record.final_cost_availability) : record.final_cost_availability.availability === 'unknown', 'final_cost_availability_mismatch', '/final_cost_availability');
}

function validateAttempt(record, errors) {
  add(errors, record.track === record.provenance.track, 'attempt_provenance_track_mismatch', '/provenance/track');
  add(errors, record.record_id === record.provenance.attempt_id, 'attempt_provenance_identity_mismatch', '/provenance/attempt_id');
  add(errors, record.route_id === record.provenance.tuple.route_id, 'attempt_route_identity_mismatch', '/route_id');
  add(errors, record.started_at <= record.ended_at, 'attempt_window_reversed', '/ended_at');
  if (record.track === 'provider_native') {
    add(errors, record.runtime_measurement.availability !== 'available', 'provider_track_contains_runtime_measurement', '/runtime_measurement');
  } else {
    add(errors, record.provider_usage.availability !== 'available', 'runtime_track_contains_provider_usage', '/provider_usage');
    add(errors, record.pricing.availability !== 'available', 'runtime_track_contains_pricing', '/pricing');
  }
  add(errors, unique(record.execution_events.map(({ event_id: id }) => id)), 'duplicate_execution_event', '/execution_events');
  add(errors, record.interventions.count === record.interventions.event_ids.length, 'intervention_count_mismatch', '/interventions');
  if (available(record.compaction.count)) add(errors, record.compaction.count.value === record.compaction.event_ids.length, 'compaction_count_mismatch', '/compaction');
  if (available(record.tool_activity.call_count)) add(errors, record.tool_activity.call_count.value === record.tool_activity.event_ids.length, 'tool_call_count_mismatch', '/tool_activity');
  const overhead = Object.entries(record.stolz_overhead);
  add(errors, JSON.stringify(overhead.map(([key]) => key)) === JSON.stringify(OVERHEAD_KEYS), 'overhead_component_set_not_exact', '/stolz_overhead');
  add(errors, overhead.every(([key, value]) => value.component_id === key), 'overhead_component_identity_mismatch', '/stolz_overhead');
  add(errors, unique(overhead.map(([, value]) => value.attribution_owner)), 'overhead_attribution_owner_reused', '/stolz_overhead');
  if (record.disposition === 'completed') {
    add(errors, record.outcome.result === 'passed', 'completed_outcome_not_passed', '/outcome/result');
    add(errors, record.verification.result === 'passed', 'completed_verification_not_passed', '/verification/result');
  } else {
    add(errors, record.outcome.result === record.disposition, 'attempt_disposition_outcome_mismatch', '/outcome/result');
  }
}

function validatePair(record, errors) {
  add(errors, record.baseline.record_id !== record.stolz.record_id, 'pair_attempt_identity_reused', '/stolz/record_id');
  const allEqual = PAIR_GATES.every((gate) => record.equivalence[gate].status === 'passed');
  if (record.admission === 'admitted_scoped') {
    add(errors, allEqual, 'pair_equivalence_incomplete', '/equivalence');
    add(errors, record.overhead_gate.status === 'passed', 'pair_overhead_incomplete', '/overhead_gate');
    add(errors, Object.values(record.attempt_dispositions).every((value) => value === 'completed'), 'pair_attempt_not_completed', '/attempt_dispositions');
    if (record.track === 'provider_native') {
      add(errors, available(record.usage_delta), 'provider_pair_usage_delta_unavailable', '/usage_delta');
    }
    if (record.track === 'runtime_measured') add(errors, record.runtime_deltas.some(available), 'runtime_pair_delta_unavailable', '/runtime_deltas');
  }
  if (record.track === 'runtime_measured') {
    add(errors, !available(record.usage_delta), 'runtime_pair_provider_usage_present', '/usage_delta');
    add(errors, !available(record.cost_delta), 'runtime_pair_provider_cost_present', '/cost_delta');
  }
}

function validatePilotManifest(record, errors) {
  add(errors, record.scenario_id === record.scenario_control.kind, 'manifest_scenario_control_mismatch', '/scenario_control/kind');
  add(errors, record.route_definitions.baseline.route_id !== record.route_definitions.stolz.route_id, 'manifest_route_identity_reused', '/route_definitions');
  add(errors, record.pair_order.length === record.repetitions * 2, 'manifest_pair_order_length_mismatch', '/pair_order');
  add(errors, record.pair_order.filter((role) => role === 'baseline').length === record.repetitions, 'manifest_baseline_order_count_mismatch', '/pair_order');
  add(errors, record.pair_order.filter((role) => role === 'stolz').length === record.repetitions, 'manifest_stolz_order_count_mismatch', '/pair_order');
  add(errors, record.commands.reproduce.includes(`--scenario ${record.scenario_id} `), 'manifest_reproduce_scenario_mismatch', '/commands/reproduce');
  add(errors, record.scenario_id === 'build-check-invalidation' ? record.invalidation_action.material : !record.invalidation_action.material, 'manifest_material_invalidation_mismatch', '/invalidation_action/material');
}

function refs(records, nestedKey) {
  return records.map((record) => nestedKey ? record[nestedKey].record_id : record.record_id);
}

function validateReportAdmission(record, errors) {
  const includedAttempts = refs(record.included_attempts);
  const excludedAttempts = refs(record.excluded_attempts, 'attempt');
  const includedPairs = refs(record.included_pairs);
  const excludedPairs = refs(record.excluded_pairs, 'pair');
  add(errors, unique([...includedAttempts, ...excludedAttempts]) && !includedAttempts.some((id) => excludedAttempts.includes(id)), 'report_attempt_membership_overlap', '/included_attempts');
  add(errors, unique([...includedPairs, ...excludedPairs]) && !includedPairs.some((id) => excludedPairs.includes(id)), 'report_pair_membership_overlap', '/included_pairs');
  if (record.admission === 'admitted_scoped') {
    add(errors, REPORT_GATES.every((gate) => record.gates[gate].status === 'passed'), 'report_gate_incomplete', '/gates');
    add(errors, includedPairs.length > 0, 'report_has_no_admitted_pairs', '/included_pairs');
  }
  if (record.public_claim.disposition === 'allowed') {
    add(errors, record.admission === 'admitted_scoped', 'public_claim_without_admission', '/public_claim');
    add(errors, record.gates.release_publication.status === 'passed', 'public_claim_without_release_gate', '/gates/release_publication');
    add(errors, includedPairs.length >= 5, 'public_claim_without_complete_cohort', '/included_pairs');
  }
  if (record.public_claim.kind === 'provider_savings') add(errors, record.track === 'provider_native', 'runtime_report_provider_claim', '/public_claim/kind');
  if (record.public_claim.kind === 'runtime_observation') add(errors, record.track === 'runtime_measured', 'provider_report_runtime_claim', '/public_claim/kind');
}

function validateReport(record, errors) {
  add(errors, record.track === record.admission.track, 'report_admission_track_mismatch', '/admission/track');
  const overheadNames = record.overhead_attribution.map(({ component_id: id }) => id);
  add(errors, unique(overheadNames) && OVERHEAD_KEYS.every((key) => overheadNames.includes(key)), 'report_overhead_set_not_exact', '/overhead_attribution');
  const metricNames = record.metrics.map(({ name }) => name);
  const expectedMetricNames = record.track === 'provider_native'
    ? ['net_token_delta', 'net_cost_delta']
    : Object.keys(EXPECTED_RUNTIME_METRICS);
  add(errors, unique(metricNames) && equalSets(metricNames, expectedMetricNames), 'report_metric_set_not_exact', '/metrics');
  if (record.track === 'runtime_measured') {
    add(errors, record.pricing.availability !== 'available', 'runtime_report_pricing_present', '/pricing');
    add(errors, record.metrics.every(({ name }) => !['net_token_delta', 'net_cost_delta'].includes(name)), 'runtime_report_provider_metric_present', '/metrics');
  }
  if (record.claim.disposition === 'published_scoped') {
    add(errors, record.admission.admission === 'admitted_scoped' && record.admission.public_claim.disposition === 'allowed', 'published_claim_not_admitted', '/claim');
    if (record.claim.kind === 'provider_savings_percentage') {
      const tokenDelta = record.metrics.find(({ name }) => name === 'net_token_delta');
      add(errors, record.track === 'provider_native' && available(tokenDelta) && tokenDelta.value > 0, 'provider_claim_missing_positive_provider_delta', '/claim');
      add(errors, record.claim.value > 0 && record.claim.value <= 100, 'provider_claim_percentage_out_of_range', '/claim/value');
      add(errors, record.admission.included_pairs.length >= 5, 'provider_claim_without_complete_cohort', '/admission/included_pairs');
    }
    if (record.claim.kind === 'runtime_observation') add(errors, record.track === 'runtime_measured', 'runtime_claim_track_mismatch', '/claim');
  }
}

const semanticValidators = Object.freeze({
  'evidence-provenance': validateProvenance,
  'responses-usage': validateResponsesUsage,
  'codex-jsonl-usage': validateCodexJsonlUsage,
  'runtime-measurement': validateRuntimeMeasurement,
  'pricing-identity': validatePricing,
  'benchmark-attempt': validateAttempt,
  'benchmark-pair': validatePair,
  'pilot-manifest': validatePilotManifest,
  'report-admission': validateReportAdmission,
  'benchmark-report': validateReport,
});

function collectRecords(record, output = []) {
  if (!record || typeof record !== 'object') return output;
  if (record.schema_id && record.schema_version && record.canonical_sha256 && record.captured_at) output.push(record);
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) value.forEach((item) => collectRecords(item, output));
    else if (value && typeof value === 'object') collectRecords(value, output);
  }
  return output;
}

export async function validateBenchmarkV3Record(record) {
  const key = `${record?.schema_id}@${record?.schema_version}`;
  const registryEntry = resolveBenchmarkV3Schema(record?.schema_id, record?.schema_version);
  if (!registryEntry?.record || !BENCHMARK_V3_RECORD_KEYS.includes(key)) return { valid: false, errors: [{ code: 'unknown_schema_or_version', path: '' }] };
  const validators = await compiledValidators();
  const validateSchema = validators.get(key);
  const schemaValid = validateSchema(record);
  const errors = schemaValid ? [] : (validateSchema.errors ?? []).map((error) => ({ code: `schema_${error.keyword}`, path: error.instancePath, message: error.message }));
  if (schemaValid) {
    const records = collectRecords(record);
    for (const nested of records) {
      add(errors, nested.canonical_sha256 === computeBenchmarkV3Identity(nested), 'canonical_identity_mismatch', nested === record ? '/canonical_sha256' : `/${nested.schema_id}/canonical_sha256`);
      semanticValidators[nested.schema_id]?.(nested, errors);
    }
  }
  return { valid: errors.length === 0, errors };
}

export async function assertBenchmarkV3Record(record) {
  const result = await validateBenchmarkV3Record(record);
  if (!result.valid) throw new Error(`benchmark_v3_validation_failed:${JSON.stringify(result.errors)}`);
  return record;
}
