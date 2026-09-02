import { createHash } from 'node:crypto';

import {
  assertBenchmarkV3Record,
  sealBenchmarkV3Record,
  validateBenchmarkV3Record,
} from './benchmark-v3-validator.mjs';

export const BENCHMARK_V3_OVERHEAD_COMPONENTS = Object.freeze([
  'routing',
  'context_selection',
  'reuse',
  'quiet_state',
  'benchmark_capture',
  'verification',
  'retry',
  'fallback',
]);

export const BENCHMARK_V3_RUNTIME_DELTA_NAMES = Object.freeze([
  'model_wakeups',
  'tool_calls',
  'tool_output_bytes',
  'wall_time_ms',
  'operator_interventions',
  'compaction_events',
]);

const PAIR_EQUIVALENCE_KEYS = Object.freeze([
  'scenario_input',
  'environment_tuple',
  'route_declarations',
  'repetition_order',
  'reset_invalidation',
  'outcome',
  'verification',
]);
const PROVIDER_TUPLE_KEYS = Object.freeze([
  'runtime_id',
  'runtime_version',
  'adapter_id',
  'adapter_version',
  'provider_id',
  'model_configuration',
  'environment_id',
]);
const USD_MINOR_UNITS = 100;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 1e12) / 1e12;
}

function gate(condition, reason) {
  return condition ? { status: 'passed' } : { status: 'failed', reason };
}

function terminalGate(status, reason) {
  return status === 'passed' ? { status } : { status, reason };
}

function recordReference(record, routeRole) {
  const reference = {
    schema_id: record.schema_id,
    schema_version: record.schema_version,
    record_id: record.record_id,
    canonical_sha256: record.canonical_sha256,
  };
  if (routeRole) reference.route_role = routeRole;
  return reference;
}

function terminalDelta(name, unit, availability, reason, sourceIdentity) {
  return {
    name,
    availability,
    provenance: 'derived',
    source_identity: sourceIdentity,
    unit,
    reason,
  };
}

function availableDelta(name, unit, value, formula, componentIds, sourceIdentity) {
  return {
    name,
    availability: 'available',
    provenance: 'derived',
    source_identity: sourceIdentity,
    unit,
    value: round(value),
    formula,
    component_ids: componentIds,
  };
}

function availabilityForAdmission(admission) {
  if (admission === 'not_comparable') return 'not_comparable';
  if (admission === 'unknown') return 'unknown';
  return 'withheld';
}

function validationReason(label, result) {
  return `${label}_invalid:${result.errors.map(({ code }) => code).join(',')}`;
}

function manifestRouteMatches(manifest, attempt) {
  const route = manifest.route_definitions[attempt.route_role];
  return route?.route_id === attempt.route_id
    && route?.configuration_sha256 === attempt.provenance.tuple.configuration_sha256
    && attempt.provenance.tuple.route_id === attempt.route_id;
}

function manifestOrderMatches(manifest, attempt) {
  return attempt.execution_control.seed === manifest.seed
    && manifest.pair_order[attempt.execution_control.order - 1] === attempt.route_role
    && attempt.execution_control.order >= 1
    && attempt.execution_control.order <= manifest.pair_order.length;
}

function providerTuple(attempt) {
  return Object.fromEntries(PROVIDER_TUPLE_KEYS.map((key) => [key, attempt.provenance.tuple[key]]));
}

function pricingTuple(record) {
  return {
    provider_id: record.provider_id,
    model_configuration: record.model_configuration,
    currency: record.currency,
    price_source: record.price_source,
    service_tier: record.service_tier,
    token_unit: record.token_unit,
    conversion_basis: record.conversion_basis,
    accounting: record.accounting,
    components: record.components,
  };
}

function provenanceAdmitted(attempt) {
  return attempt.provenance.admission.disposition === 'admitted'
    && attempt.provenance.redaction.result === 'passed'
    && attempt.provenance.retention.disposal_status === 'retained'
    && attempt.provenance.retention.retain_until > attempt.provenance.capture_window.ended_at;
}

function pricingComplete(attempt) {
  if (attempt.pricing.availability !== 'available') return false;
  const pricing = attempt.pricing.record;
  return pricing.provider_id === attempt.provenance.tuple.provider_id
    && pricing.model_configuration === attempt.provenance.tuple.model_configuration
    && pricing.final_cost_availability.availability === 'available'
    && pricing.conversion_basis.availability === 'available'
    && pricing.components.length === 5
    && pricing.components.every(({ availability }) => availability === 'available');
}

function pricingExplicitlyTerminal(attempt) {
  return ['unknown', 'unavailable', 'withheld'].includes(attempt.pricing.availability)
    && typeof attempt.pricing.reason === 'string'
    && attempt.pricing.reason.length > 0
    && !Object.hasOwn(attempt.pricing, 'record');
}

function overheadComplete(attempt) {
  if (!equal(Object.keys(attempt.stolz_overhead), BENCHMARK_V3_OVERHEAD_COMPONENTS)) return false;
  if (!BENCHMARK_V3_OVERHEAD_COMPONENTS.every((key) => attempt.stolz_overhead[key].availability === 'available')) return false;
  const eventKinds = new Set(attempt.execution_events.map(({ kind }) => kind));
  if (eventKinds.has('retry') && attempt.stolz_overhead.retry.value <= 0) return false;
  if (eventKinds.has('fallback') && attempt.stolz_overhead.fallback.value <= 0) return false;
  return true;
}

function providerUsageComplete(attempt) {
  if (attempt.provider_usage.availability !== 'available') return false;
  const usage = attempt.provider_usage.record;
  if (usage.schema_id === 'responses-usage') {
    return usage.response_id === attempt.provenance.source_response_id && [
      usage.input_tokens,
      usage.input_tokens_details.cached_tokens,
      usage.input_tokens_details.cache_write_tokens,
      usage.output_tokens,
      usage.output_tokens_details.reasoning_tokens,
      usage.total_tokens,
      usage.uncached_input_tokens,
    ].every(({ availability }) => availability === 'available');
  }
  if (usage.schema_id === 'codex-jsonl-usage') {
    return usage.source_event_id === attempt.provenance.source_event_id
      && [usage.input_tokens, usage.cached_input_tokens, usage.output_tokens, usage.reasoning_output_tokens]
        .every(({ availability }) => availability === 'available')
      && usage.cache_write_input_tokens.availability !== 'available'
      && usage.total_tokens.availability !== 'available';
  }
  return false;
}

function comparableTokenTotal(attempt) {
  if (!providerUsageComplete(attempt)) return { available: false, reason: 'provider_usage_incomplete' };
  const usage = attempt.provider_usage.record;
  if (usage.schema_id === 'responses-usage') {
    return {
      available: true,
      value: usage.total_tokens.value,
      component_ids: ['total_tokens'],
      expression: 'total_tokens',
    };
  }
  return {
    available: true,
    value: usage.input_tokens.value + usage.output_tokens.value,
    component_ids: ['input_tokens', 'output_tokens'],
    expression: 'input_tokens + output_tokens',
  };
}

function runtimeMeasurementComplete(attempt) {
  if (attempt.runtime_measurement.availability !== 'available') return true;
  const measurement = attempt.runtime_measurement.record;
  const tuple = attempt.provenance.tuple;
  return measurement.runtime_id === tuple.runtime_id
    && measurement.runtime_version === tuple.runtime_version
    && measurement.adapter_id === tuple.adapter_id
    && measurement.adapter_version === tuple.adapter_version;
}

function providerSourceRecordsLinked(attempt) {
  const usage = attempt.provider_usage.record;
  const usageLinked = attempt.provider_usage.availability !== 'available'
    || (usage.schema_id === 'responses-usage' && usage.response_id === attempt.provenance.source_response_id)
    || (usage.schema_id === 'codex-jsonl-usage' && usage.source_event_id === attempt.provenance.source_event_id);
  const pricingLinked = attempt.pricing.availability !== 'available'
    || (attempt.pricing.record.provider_id === attempt.provenance.tuple.provider_id
      && attempt.pricing.record.model_configuration === attempt.provenance.tuple.model_configuration);
  return usageLinked && pricingLinked;
}

function tokenOverhead(attempt) {
  return BENCHMARK_V3_OVERHEAD_COMPONENTS
    .map((key) => attempt.stolz_overhead[key])
    .filter(({ unit }) => unit === 'tokens')
    .reduce((sum, { value }) => sum + value, 0);
}

function providerCost(attempt) {
  if (!providerUsageComplete(attempt)) return { available: false, reason: 'provider_usage_incomplete' };
  if (!pricingComplete(attempt)) return { available: false, reason: 'pricing_incomplete' };
  if (attempt.pricing.record.currency !== 'USD') return { available: false, reason: 'currency_minor_unit_unknown' };
  if (attempt.execution_events.some(({ kind }) => ['retry', 'background_start', 'background_complete'].includes(kind))) {
    return { available: false, reason: 'provider_request_multiplicity_not_attributed' };
  }
  if (tokenOverhead(attempt) > 0) return { available: false, reason: 'token_overhead_price_partition_unknown' };

  const usage = attempt.provider_usage.record;
  const components = Object.fromEntries(attempt.pricing.record.components.map((component) => [component.name, component]));
  const hostedCalls = attempt.tool_activity.call_count.availability === 'available'
    ? attempt.tool_activity.call_count.value
    : null;
  if (components.hosted_tool.unit_price > 0 && hostedCalls === null) {
    return { available: false, reason: 'hosted_tool_count_unknown' };
  }
  // The attempt ledger does not distinguish local from hosted tools. A non-zero
  // hosted price with any tool activity therefore remains unknown, never guessed.
  if (components.hosted_tool.unit_price > 0 && hostedCalls > 0) {
    return { available: false, reason: 'hosted_tool_attribution_unknown' };
  }

  const tokenCost = (
    usage.uncached_input_tokens.value * components.input_uncached.unit_price
    + usage.input_tokens_details.cached_tokens.value * components.input_cached.unit_price
    + usage.input_tokens_details.cache_write_tokens.value * components.input_cache_write.unit_price
    + usage.output_tokens.value * components.output.unit_price
  ) / 1_000_000;
  const hostedCost = hostedCalls === 0 ? 0 : components.hosted_tool.unit_price * (hostedCalls ?? 0);
  return {
    available: true,
    value: round((tokenCost + hostedCost) * attempt.pricing.record.conversion_basis.rate * USD_MINOR_UNITS),
  };
}

function runtimeMetric(attempt, name) {
  if (attempt.runtime_measurement.availability !== 'available') return null;
  return attempt.runtime_measurement.record.metrics.find((metric) => metric.name === name) ?? null;
}

function runtimeDeltas(baseline, stolz, sourceIdentity) {
  return BENCHMARK_V3_RUNTIME_DELTA_NAMES.map((name) => {
    const left = runtimeMetric(baseline, name);
    const right = runtimeMetric(stolz, name);
    const unit = left?.unit ?? right?.unit ?? {
      model_wakeups: 'count',
      tool_calls: 'count',
      tool_output_bytes: 'bytes',
      wall_time_ms: 'milliseconds',
      operator_interventions: 'count',
      compaction_events: 'count',
    }[name];
    if (left?.availability !== 'available' || right?.availability !== 'available') {
      const availability = [left?.availability, right?.availability].includes('unknown') ? 'unknown' : 'unavailable';
      return terminalDelta(name, unit, availability, 'Both runtime observations must be available for a signed delta.', sourceIdentity);
    }
    return availableDelta(
      name,
      unit,
      left.value - right.value,
      'baseline_value - stolz_value',
      [`baseline.${name}`, `stolz.${name}`],
      sourceIdentity,
    );
  });
}

function pairReason(admission, reasons) {
  if (reasons.length > 0) return reasons.join('; ').slice(0, 500);
  return admission === 'admitted_scoped'
    ? 'Equal-result/equal-verification pair passed complete track, provenance, pricing, and STOLZ overhead admission.'
    : 'Pair was not admitted.';
}

/**
 * Assemble one schema-valid pair from complete G1/G2 attempt ledgers and a G3
 * manifest. Invalid input records are returned as a terminal rejected decision
 * without manufacturing a pair reference.
 */
export async function assembleBenchmarkV3Pair({ manifest, baseline, stolz }) {
  const validations = await Promise.all([
    validateBenchmarkV3Record(manifest),
    validateBenchmarkV3Record(baseline),
    validateBenchmarkV3Record(stolz),
  ]);
  if (validations.some(({ valid }) => !valid)) {
    const reasons = validations.flatMap((result, index) => result.valid ? [] : [validationReason(['manifest', 'baseline', 'stolz'][index], result)]);
    return { admission: 'rejected', reasons, pair: null };
  }

  const sourceIdentity = sha256([baseline.canonical_sha256, stolz.canonical_sha256, manifest.canonical_sha256]);
  const sameTrack = baseline.track === stolz.track;
  const track = sameTrack ? baseline.track : baseline.track;
  const scenarioInput = manifest.scenario_id === baseline.identity.scenario_id
    && manifest.scenario_id === stolz.identity.scenario_id
    && manifest.cohort_id === baseline.identity.cohort_id
    && manifest.cohort_id === stolz.identity.cohort_id
    && baseline.identity.input_sha256 === stolz.identity.input_sha256;
  const environmentTuple = baseline.identity.environment_sha256 === stolz.identity.environment_sha256
    && baseline.identity.environment_sha256 === manifest.environment.environment_sha256
    && baseline.provenance.tuple.environment_id === stolz.provenance.tuple.environment_id;
  const routeDeclarations = baseline.route_role === 'baseline'
    && stolz.route_role === 'stolz'
    && manifestRouteMatches(manifest, baseline)
    && manifestRouteMatches(manifest, stolz);
  const repetitionOrder = baseline.execution_control.repetition === stolz.execution_control.repetition
    && manifestOrderMatches(manifest, baseline)
    && manifestOrderMatches(manifest, stolz);
  const resetInvalidation = baseline.execution_control.reset_condition_sha256 === stolz.execution_control.reset_condition_sha256
    && baseline.execution_control.reset_condition_sha256 === manifest.workspace_reset.procedure_sha256
    && baseline.execution_control.invalidation_condition_sha256 === stolz.execution_control.invalidation_condition_sha256
    && baseline.execution_control.invalidation_condition_sha256 === manifest.invalidation_action.action_sha256;
  const outcome = baseline.outcome.result === 'passed'
    && stolz.outcome.result === 'passed'
    && baseline.outcome.oracle_id === manifest.outcome_oracle.oracle_id
    && stolz.outcome.oracle_id === manifest.outcome_oracle.oracle_id
    && baseline.outcome.oracle_version === manifest.outcome_oracle.version
    && stolz.outcome.oracle_version === manifest.outcome_oracle.version
    && baseline.outcome.result_sha256 === stolz.outcome.result_sha256;
  const verification = baseline.verification.required === true
    && stolz.verification.required === true
    && baseline.verification.result === 'passed'
    && stolz.verification.result === 'passed'
    && baseline.verification.oracle_id === manifest.verification_oracle.oracle_id
    && stolz.verification.oracle_id === manifest.verification_oracle.oracle_id
    && baseline.verification.oracle_version === manifest.verification_oracle.version
    && stolz.verification.oracle_version === manifest.verification_oracle.version
    && baseline.verification.result_sha256 === stolz.verification.result_sha256;
  const equivalence = {
    scenario_input: gate(scenarioInput, 'Scenario, cohort, or input identity differs.'),
    environment_tuple: gate(environmentTuple, 'Environment tuple differs from the manifest or paired route.'),
    route_declarations: gate(routeDeclarations, 'Baseline/STOLZ route role, ID, or pinned configuration differs.'),
    repetition_order: gate(repetitionOrder, 'Repetition, seed, or immutable execution order differs.'),
    reset_invalidation: gate(resetInvalidation, 'Reset or invalidation identity differs.'),
    outcome: gate(outcome, 'Outcome oracle identity, passing result, or result identity differs.'),
    verification: gate(verification, 'Required verification identity, passing result, or result identity differs.'),
  };

  const attemptsCompleted = baseline.disposition === 'completed'
    && stolz.disposition === 'completed'
    && baseline.interventions.count === 0
    && stolz.interventions.count === 0;
  const provenance = sameTrack
    && provenanceAdmitted(baseline)
    && provenanceAdmitted(stolz)
    && (track !== 'provider_native' || equal(providerTuple(baseline), providerTuple(stolz)));
  const sourceRecordsLinked = track === 'provider_native'
    ? providerSourceRecordsLinked(baseline) && providerSourceRecordsLinked(stolz)
    : runtimeMeasurementComplete(baseline) && runtimeMeasurementComplete(stolz);
  const completeOverhead = overheadComplete(stolz);
  const samePricing = track !== 'provider_native' || (
    pricingComplete(baseline)
    && pricingComplete(stolz)
    && equal(pricingTuple(baseline.pricing.record), pricingTuple(stolz.pricing.record))
  );

  const reasons = [];
  let admission = 'admitted_scoped';
  if (!sameTrack) {
    admission = 'rejected';
    reasons.push('track_authority_mismatch');
  } else if (!sourceRecordsLinked) {
    admission = 'rejected';
    reasons.push('attempt_source_record_tuple_mismatch');
  } else if (!attemptsCompleted) {
    admission = 'rejected';
    reasons.push('attempt_failed_partial_aborted_or_intervened');
  } else if (PAIR_EQUIVALENCE_KEYS.some((key) => equivalence[key].status !== 'passed')) {
    admission = 'not_comparable';
    reasons.push(...PAIR_EQUIVALENCE_KEYS.filter((key) => equivalence[key].status !== 'passed').map((key) => `unequal_${key}`));
  } else if (!provenance) {
    admission = 'withheld';
    reasons.push('provenance_redaction_or_retention_not_admitted');
  } else if (!completeOverhead) {
    admission = 'unknown';
    reasons.push('stolz_overhead_incomplete_or_duplicated');
  }

  let usageDelta;
  let costDelta;
  let runtimeDeltaRecords = [];
  if (track === 'provider_native' && admission === 'admitted_scoped') {
    if (!providerUsageComplete(baseline) || !providerUsageComplete(stolz)) {
      admission = 'unknown';
      reasons.push('provider_usage_incomplete');
    } else {
      const overheadTokens = tokenOverhead(stolz);
      const baselineTokens = comparableTokenTotal(baseline);
      const stolzTokens = comparableTokenTotal(stolz);
      usageDelta = availableDelta(
        'net_token_delta',
        'tokens',
        baselineTokens.value - stolzTokens.value - overheadTokens,
        `baseline.(${baselineTokens.expression}) - stolz.(${stolzTokens.expression}) - separately_attributed_stolz_token_overhead`,
        [
          ...baselineTokens.component_ids.map((id) => `baseline.${id}`),
          ...stolzTokens.component_ids.map((id) => `stolz.${id}`),
          ...BENCHMARK_V3_OVERHEAD_COMPONENTS.map((key) => `stolz_overhead.${key}`),
        ],
        sourceIdentity,
      );
      const baselineCost = providerCost(baseline);
      const stolzCost = providerCost(stolz);
      if (samePricing && baselineCost.available && stolzCost.available) {
        costDelta = availableDelta(
          'net_cost_delta',
          'currency_minor_units',
          baselineCost.value - stolzCost.value,
          'baseline_admitted_cost - stolz_admitted_cost',
          ['baseline.provider_cost', 'stolz.provider_cost'],
          sourceIdentity,
        );
      } else {
        costDelta = terminalDelta(
          'net_cost_delta',
          'currency_minor_units',
          'unknown',
          `Provider cost is explicitly unavailable for this token-comparable pair: ${samePricing ? (baselineCost.reason ?? stolzCost.reason) : 'pricing_identity_incomplete_or_mismatched'}.`,
          sourceIdentity,
        );
      }
    }
  } else if (track === 'runtime_measured' && admission === 'admitted_scoped') {
    runtimeDeltaRecords = runtimeDeltas(baseline, stolz, sourceIdentity);
    if (!runtimeDeltaRecords.some(({ availability }) => availability === 'available')) {
      admission = 'unknown';
      reasons.push('runtime_metrics_unavailable');
    }
  }

  const metricAvailability = availabilityForAdmission(admission);
  if (!usageDelta || admission !== 'admitted_scoped') {
    usageDelta = terminalDelta(
      'net_token_delta',
      'tokens',
      track === 'runtime_measured' ? 'withheld' : metricAvailability,
      track === 'runtime_measured'
        ? 'Runtime-measured evidence cannot yield provider token usage or savings.'
        : pairReason(admission, reasons),
      sourceIdentity,
    );
  }
  if (!costDelta || admission !== 'admitted_scoped') {
    costDelta = terminalDelta(
      'net_cost_delta',
      'currency_minor_units',
      track === 'runtime_measured' ? 'withheld' : metricAvailability,
      track === 'runtime_measured'
        ? 'Runtime-measured evidence cannot yield provider billing or cost savings.'
        : pairReason(admission, reasons),
      sourceIdentity,
    );
  }

  const pair = sealBenchmarkV3Record({
    schema_id: 'benchmark-pair',
    schema_version: '1.0.0',
    record_id: `pair-${sha256({ manifest: manifest.canonical_sha256, baseline: baseline.record_id, stolz: stolz.record_id }).slice(0, 24)}`,
    captured_at: [manifest.captured_at, baseline.captured_at, stolz.captured_at].sort().at(-1),
    track,
    scenario_id: manifest.scenario_id,
    cohort_id: manifest.cohort_id,
    baseline: recordReference(baseline, 'baseline'),
    stolz: recordReference(stolz, 'stolz'),
    equivalence,
    overhead_gate: gate(completeOverhead, 'All eight STOLZ overhead components and retry/fallback attribution must be available once.'),
    attempt_dispositions: { baseline: baseline.disposition, stolz: stolz.disposition },
    usage_delta: usageDelta,
    cost_delta: costDelta,
    runtime_deltas: runtimeDeltaRecords,
    admission,
    admission_reason: pairReason(admission, reasons),
  });
  await assertBenchmarkV3Record(pair);
  return { admission, reasons, pair };
}

function excludedAttemptReason(attempt) {
  if (['failed', 'partial', 'aborted'].includes(attempt.disposition)) return attempt.disposition;
  if (attempt.interventions.count > 0) return 'intervention';
  if (attempt.provenance.redaction.result !== 'passed') return 'redaction_failed';
  if (attempt.provenance.retention.disposal_status !== 'retained') return 'retention_unavailable';
  return 'identity_mismatch';
}

function excludedPairReason(decision) {
  if (decision.reasons.some((reason) => reason.includes('outcome'))) return 'unequal_outcome';
  if (decision.reasons.some((reason) => reason.includes('verification'))) return 'unequal_verification';
  if (decision.reasons.some((reason) => reason.includes('overhead'))) return 'incomplete_overhead';
  if (decision.reasons.some((reason) => reason.includes('pricing') || reason.includes('cost_unknown'))) return 'incomplete_pricing';
  if (decision.reasons.some((reason) => reason.includes('attempt_failed'))) return 'failed_attempt';
  return ['not_comparable', 'unknown', 'withheld', 'rejected'].includes(decision.admission)
    ? decision.admission
    : 'rejected';
}

function reportMetricFromPairs(pairs, name, unit) {
  const metrics = pairs.map((pair) => name === 'net_token_delta'
    ? pair.usage_delta
    : name === 'net_cost_delta'
      ? pair.cost_delta
      : pair.runtime_deltas.find((metric) => metric.name === name));
  const sourceIdentity = sha256(pairs.map(({ canonical_sha256: identity }) => identity));
  if (metrics.length === 0 || metrics.some((metric) => metric?.availability !== 'available')) {
    const availability = metrics.some((metric) => metric?.availability === 'unknown') ? 'unknown' : 'withheld';
    return terminalDelta(name, unit, availability, 'No complete admitted cohort metric is available.', sourceIdentity);
  }
  return availableDelta(
    name,
    unit,
    metrics.reduce((sum, { value }) => sum + value, 0),
    'sum(admitted_pair_deltas)',
    pairs.map(({ record_id: id }) => id),
    sourceIdentity,
  );
}

function aggregateOverhead(attempts, sourceIdentity) {
  return BENCHMARK_V3_OVERHEAD_COMPONENTS.map((componentId) => {
    const components = attempts.map((attempt) => attempt.stolz_overhead[componentId]);
    const units = new Set(components.map(({ unit }) => unit));
    if (components.length === 0 || components.some(({ availability }) => availability !== 'available') || units.size !== 1) {
      return {
        component_id: componentId,
        availability: 'unknown',
        source_identity: sourceIdentity,
        attribution_owner: `report-${componentId.replaceAll('_', '-')}`,
        unit: components[0]?.unit ?? 'count',
        reason: 'No complete single-unit STOLZ overhead attribution is available for the cohort.',
      };
    }
    return {
      component_id: componentId,
      availability: 'available',
      source_identity: sha256(components),
      attribution_owner: `report-${componentId.replaceAll('_', '-')}`,
      unit: components[0].unit,
      value: round(components.reduce((sum, { value }) => sum + value, 0)),
    };
  });
}

function evidenceRows(attempts) {
  return attempts.map((attempt) => ({
    attempt_id: attempt.record_id,
    raw_evidence_sha256: attempt.provenance.raw_evidence_sha256,
    retained_evidence_sha256: attempt.provenance.retained_evidence_sha256,
    retained_locator: attempt.provenance.retention.opaque_locator,
  }));
}

function reportScope(manifest, attempts) {
  const first = attempts[0];
  return {
    scenario_id: manifest.scenario_id,
    cohort_id: manifest.cohort_id,
    runtime_id: first.provenance.tuple.runtime_id,
    provider_id: first.provenance.tuple.provider_id,
    model_configuration: first.provenance.tuple.model_configuration,
    configuration_sha256: sha256(manifest.route_definitions),
    environment_sha256: manifest.environment.environment_sha256,
  };
}

function reportAdmissionStatus({ decisions, completeCohort, gates }) {
  if (decisions.some(({ admission }) => admission === 'rejected')) return 'rejected';
  if (decisions.some(({ admission }) => admission === 'not_comparable')) return 'not_comparable';
  if (decisions.some(({ admission }) => admission === 'unknown')) return 'unknown';
  if (decisions.some(({ admission }) => admission === 'withheld')) return 'withheld';
  if (!completeCohort || Object.entries(gates).some(([name, value]) => name !== 'release_publication' && value.status !== 'passed')) return 'withheld';
  if (gates.release_publication.status !== 'passed') return 'withheld';
  return 'admitted_scoped';
}

/** Build a deterministic report from complete benchmark-attempt records. */
export async function buildBenchmarkV3Report({
  manifest,
  attempts,
  manifestPath,
  outputPath,
  releasePublicationGate = { status: 'not_run', reason: 'Release/publication evidence is owned by downstream G6-G9 gates.' },
}) {
  await assertBenchmarkV3Record(manifest);
  if (!Array.isArray(attempts) || attempts.length === 0) throw new TypeError('benchmark_v3_report_requires_attempts');
  for (const attempt of attempts) await assertBenchmarkV3Record(attempt);
  if (!['passed', 'failed', 'unknown', 'withheld', 'not_run'].includes(releasePublicationGate.status)
    || (releasePublicationGate.status !== 'passed' && !releasePublicationGate.reason)) {
    throw new TypeError('benchmark_v3_release_publication_gate_invalid');
  }

  const tracks = new Set(attempts.map(({ track }) => track));
  if (tracks.size !== 1) throw new Error('benchmark_v3_report_rejected:mixed_tracks');
  const track = attempts[0].track;
  const decisions = [];
  const pairedAttemptIds = new Set();
  for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
    const candidates = attempts.filter((attempt) => attempt.execution_control.repetition === repetition);
    const baseline = candidates.filter(({ route_role: role }) => role === 'baseline');
    const stolz = candidates.filter(({ route_role: role }) => role === 'stolz');
    if (baseline.length !== 1 || stolz.length !== 1) continue;
    const decision = await assembleBenchmarkV3Pair({ manifest, baseline: baseline[0], stolz: stolz[0] });
    if (!decision.pair) throw new Error(`benchmark_v3_report_rejected:${decision.reasons.join(',')}`);
    decisions.push(decision);
    pairedAttemptIds.add(baseline[0].record_id);
    pairedAttemptIds.add(stolz[0].record_id);
  }

  const includedPairs = decisions.filter(({ admission }) => admission === 'admitted_scoped').map(({ pair }) => pair);
  const includedAttemptIds = new Set(includedPairs.flatMap((pair) => [pair.baseline.record_id, pair.stolz.record_id]));
  const includedAttempts = attempts.filter(({ record_id: id }) => includedAttemptIds.has(id));
  const excludedAttempts = attempts.filter(({ record_id: id }) => !includedAttemptIds.has(id));
  const completeCohort = includedPairs.length === manifest.repetitions
    && manifest.repetitions >= 5
    && decisions.length === manifest.repetitions
    && pairedAttemptIds.size === attempts.length;
  const allProvenance = attempts.every(provenanceAdmitted);
  const gates = {
    track_authority: gate(tracks.size === 1, 'The report contains mixed or unknown evidence tracks.'),
    provenance: gate(allProvenance, 'One or more attempt provenance records are not admitted.'),
    redaction_retention: gate(attempts.every((attempt) => attempt.provenance.redaction.result === 'passed'
      && attempt.provenance.retention.disposal_status === 'retained'), 'Redaction or retention is incomplete.'),
    pricing: gate(track === 'runtime_measured' || attempts.every((attempt) => pricingComplete(attempt) || pricingExplicitlyTerminal(attempt)), 'Provider pricing is neither complete nor explicitly unavailable.'),
    overhead: gate(decisions.length > 0 && decisions.every(({ pair }) => pair.overhead_gate.status === 'passed'), 'STOLZ overhead is incomplete.'),
    equal_outcome: gate(decisions.length > 0 && decisions.every(({ pair }) => pair.equivalence.outcome.status === 'passed'), 'Outcome equality failed.'),
    equal_verification: gate(decisions.length > 0 && decisions.every(({ pair }) => pair.equivalence.verification.status === 'passed'), 'Verification equality failed.'),
    release_publication: structuredClone(releasePublicationGate),
  };
  const admission = reportAdmissionStatus({ decisions, completeCohort, gates });
  const reportSourceIdentity = sha256([manifest.canonical_sha256, ...attempts.map(({ canonical_sha256: identity }) => identity)]);
  const metrics = track === 'provider_native'
    ? [
      reportMetricFromPairs(includedPairs, 'net_token_delta', 'tokens'),
      reportMetricFromPairs(includedPairs, 'net_cost_delta', 'currency_minor_units'),
    ]
    : BENCHMARK_V3_RUNTIME_DELTA_NAMES.map((name) => reportMetricFromPairs(
      includedPairs,
      name,
      {
        model_wakeups: 'count',
        tool_calls: 'count',
        tool_output_bytes: 'bytes',
        wall_time_ms: 'milliseconds',
        operator_interventions: 'count',
        compaction_events: 'count',
      }[name],
    ));
  const tokenMetric = metrics.find(({ name }) => name === 'net_token_delta');
  const baselineTokens = includedAttempts
    .filter(({ route_role: role }) => role === 'baseline')
    .map(comparableTokenTotal)
    .reduce((sum, metric) => sum + (metric.available ? metric.value : 0), 0);
  const publishProviderSaving = admission === 'admitted_scoped'
    && track === 'provider_native'
    && tokenMetric?.availability === 'available'
    && tokenMetric.value > 0
    && baselineTokens > 0;
  const publicClaim = publishProviderSaving
    ? { kind: 'provider_savings', disposition: 'allowed' }
    : {
      kind: track === 'provider_native' ? 'provider_savings' : 'runtime_observation',
      disposition: 'withheld',
      reason: admission === 'admitted_scoped'
        ? (track === 'provider_native'
          ? 'The admitted cohort does not show a positive provider token saving.'
          : 'Runtime facts remain scoped report metrics; they cannot become a provider or aggregate savings claim.')
        : 'No release-admitted complete scoped cohort is available; aggregate claims remain withheld.',
    };
  const admissionRecord = sealBenchmarkV3Record({
    schema_id: 'report-admission',
    schema_version: '1.0.0',
    record_id: `admission-${reportSourceIdentity.slice(0, 24)}`,
    captured_at: [manifest.captured_at, ...attempts.map(({ captured_at: capturedAt }) => capturedAt)].sort().at(-1),
    track,
    manifest: recordReference(manifest),
    included_attempts: includedAttempts.map((attempt) => recordReference(attempt)),
    excluded_attempts: excludedAttempts.map((attempt) => ({ attempt: recordReference(attempt), reason: excludedAttemptReason(attempt) })),
    included_pairs: includedPairs.map((pair) => recordReference(pair)),
    excluded_pairs: decisions.filter(({ admission: pairAdmission }) => pairAdmission !== 'admitted_scoped')
      .map((decision) => ({ pair: recordReference(decision.pair), reason: excludedPairReason(decision) })),
    gates,
    admission,
    admission_reason: admission === 'admitted_scoped'
      ? 'Complete scoped cohort passed evidence, pair, release, and publication gates.'
      : 'Aggregate admission is fail-closed until a complete cohort and every required gate pass.',
    public_claim: publicClaim,
  });
  await assertBenchmarkV3Record(admissionRecord);

  const completePricing = track === 'provider_native'
    && includedAttempts.length > 0
    && includedAttempts.every(pricingComplete)
    && includedAttempts.every((attempt) => equal(pricingTuple(attempt.pricing.record), pricingTuple(includedAttempts[0].pricing.record)));
  const pricing = completePricing
    ? { availability: 'available', record: recordReference(includedAttempts[0].pricing.record) }
    : { availability: track === 'runtime_measured' || (track === 'provider_native' && attempts.every(pricingExplicitlyTerminal)) ? 'unavailable' : 'unknown', reason: track === 'runtime_measured'
      ? 'Runtime reports never contain provider pricing.'
      : 'The Codex CLI stream provides no admissible billing price; token comparison remains available while cost is unavailable.' };
  const claim = publishProviderSaving
    ? {
      kind: 'provider_savings_percentage',
      disposition: 'published_scoped',
      value: round((tokenMetric.value / baselineTokens) * 100),
      scope_statement: `Exact ${manifest.scenario_id} cohort ${manifest.cohort_id}; no cross-provider, model, runtime, or scenario generalization.`,
    }
    : {
      kind: track === 'provider_native' ? 'provider_savings_percentage' : 'runtime_observation',
      disposition: 'withheld',
      scope_statement: `Exact ${manifest.scenario_id} cohort ${manifest.cohort_id}; aggregate claim not admitted.`,
      reason: publicClaim.reason ?? 'The scoped cohort does not admit a public claim.',
    };
  const report = sealBenchmarkV3Record({
    schema_id: 'benchmark-report',
    schema_version: '3.0.0',
    record_id: `report-${reportSourceIdentity.slice(0, 24)}`,
    captured_at: admissionRecord.captured_at,
    track,
    manifest: recordReference(manifest),
    scope: reportScope(manifest, attempts),
    admission: admissionRecord,
    attempts: {
      included: includedAttempts.map(({ record_id: id }) => id),
      excluded: excludedAttempts.map((attempt) => ({ record_id: attempt.record_id, reason: excludedAttemptReason(attempt) })),
    },
    pairs: {
      included: includedPairs.map(({ record_id: id }) => id),
      excluded: decisions.filter(({ admission: pairAdmission }) => pairAdmission !== 'admitted_scoped')
        .map((decision) => ({ record_id: decision.pair.record_id, reason: excludedPairReason(decision) })),
    },
    metrics,
    pricing,
    overhead_attribution: aggregateOverhead(includedAttempts.filter(({ route_role: role }) => role === 'stolz'), reportSourceIdentity),
    evidence: evidenceRows(attempts),
    claim,
    reproduce_command: `benchmark:v3 --report ${manifestPath} --output ${outputPath}`,
  });
  await assertBenchmarkV3Record(report);
  return report;
}

/**
 * Render the checked-in deterministic G3 corpus without relabeling it as G1 or
 * G2 evidence. No fake attempt/pair references are created; every provider
 * metric and aggregate claim is visibly withheld.
 */
export async function buildFixtureOnlyBenchmarkV3Report({ manifest, pilotRun, manifestPath, outputPath }) {
  await assertBenchmarkV3Record(manifest);
  if (pilotRun.evidence_class !== 'fixture_only' || pilotRun.provider_native !== false || pilotRun.runtime_measured !== false) {
    throw new Error('benchmark_v3_fixture_report_rejected:evidence_boundary');
  }
  const attempts = pilotRun.pairs.flatMap(({ baseline, stolz }) => [baseline, stolz]);
  const sourceIdentity = sha256([manifest.canonical_sha256, pilotRun.canonical_sha256]);
  const withheldReason = 'Deterministic fixture-only evidence is neither provider-native nor runtime-measured; provider deltas and aggregate claims remain withheld.';
  const admissionRecord = sealBenchmarkV3Record({
    schema_id: 'report-admission',
    schema_version: '1.0.0',
    record_id: `admission-fixture-${sourceIdentity.slice(0, 16)}`,
    captured_at: manifest.captured_at,
    track: 'provider_native',
    manifest: recordReference(manifest),
    included_attempts: [],
    excluded_attempts: [],
    included_pairs: [],
    excluded_pairs: [],
    gates: {
      track_authority: terminalGate('withheld', withheldReason),
      provenance: terminalGate('withheld', withheldReason),
      redaction_retention: { status: 'passed' },
      pricing: terminalGate('unknown', 'Fixture execution has no admitted provider pricing identity.'),
      overhead: terminalGate('unknown', 'Fixture execution has no benchmark-attempt STOLZ overhead ledger.'),
      equal_outcome: { status: 'passed' },
      equal_verification: { status: 'passed' },
      release_publication: terminalGate('not_run', 'Release/publication is downstream and fixture evidence cannot satisfy it.'),
    },
    admission: 'withheld',
    admission_reason: withheldReason,
    public_claim: { kind: 'none', disposition: 'withheld', reason: withheldReason },
  });
  const overheadAttribution = BENCHMARK_V3_OVERHEAD_COMPONENTS.map((componentId) => ({
    component_id: componentId,
    availability: 'withheld',
    source_identity: sourceIdentity,
    attribution_owner: `fixture-report-${componentId.replaceAll('_', '-')}`,
    unit: 'count',
    reason: 'Fixture execution does not emit an admitted STOLZ overhead ledger.',
  }));
  const report = sealBenchmarkV3Record({
    schema_id: 'benchmark-report',
    schema_version: '3.0.0',
    record_id: `report-fixture-${sourceIdentity.slice(0, 16)}`,
    captured_at: manifest.captured_at,
    track: 'provider_native',
    manifest: recordReference(manifest),
    scope: {
      scenario_id: manifest.scenario_id,
      cohort_id: manifest.cohort_id,
      runtime_id: 'fixture-runner',
      provider_id: 'not_observed',
      model_configuration: 'not_observed',
      configuration_sha256: sha256(manifest.route_definitions),
      environment_sha256: manifest.environment.environment_sha256,
    },
    admission: admissionRecord,
    attempts: {
      included: [],
      excluded: attempts.map(({ record_id: id }) => ({ record_id: id, reason: 'fixture_only_not_benchmark_attempt' })),
    },
    pairs: {
      included: [],
      excluded: pilotRun.pairs.map(({ record_id: id }) => ({ record_id: id, reason: 'fixture_only_not_benchmark_pair' })),
    },
    metrics: [
      terminalDelta('net_token_delta', 'tokens', 'withheld', withheldReason, sourceIdentity),
      terminalDelta('net_cost_delta', 'currency_minor_units', 'withheld', withheldReason, sourceIdentity),
    ],
    pricing: { availability: 'unknown', reason: 'Fixture execution has no admitted provider pricing identity.' },
    overhead_attribution: overheadAttribution,
    evidence: attempts.map((attempt) => ({
      attempt_id: attempt.record_id,
      raw_evidence_sha256: attempt.evidence.raw_evidence_sha256,
      retained_evidence_sha256: attempt.evidence.retained_evidence_sha256,
      retained_locator: `retained:fixture-${attempt.record_id}`,
    })),
    claim: {
      kind: 'provider_savings_percentage',
      disposition: 'withheld',
      scope_statement: `Deterministic fixture-only ${manifest.scenario_id} reproduction; no provider or runtime claim.`,
      reason: withheldReason,
    },
    reproduce_command: `benchmark:v3 --report ${manifestPath} --output ${outputPath}`,
  });
  await assertBenchmarkV3Record(report);
  return report;
}
