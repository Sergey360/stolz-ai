const AVAILABILITY = new Set(['available', 'unknown', 'unavailable', 'withheld', 'not_comparable']);

export const REQUIRED_MEASUREMENT_COMPONENTS = Object.freeze([
  'hit', 'miss', 'invalidation_reasons', 'controller', 'follower', 'coalesced_verified',
  'gross_avoided_work', 'admission_classification', 'canonicalization_hash', 'lookup', 'lease_wait', 'execution_coordination', 'verification', 'artifact_write_read', 'ledger_persistence_index', 'projection_fragment_retrieval', 'retry_fallback',
  'net_delta', 'wall_latency', 'queue_wait_latency', 'output_bytes', 'artifact_bytes', 'outcome_identity', 'outcome_status', 'verification_identity', 'verification_status',
]);

/** The complete STOLZ cost of reuse. Lifecycle/result fields are not overhead. */
export const STOLZ_OVERHEAD_COMPONENTS = Object.freeze([
  'admission_classification', 'canonicalization_hash', 'lookup', 'lease_wait', 'execution_coordination', 'verification',
  'artifact_write_read', 'ledger_persistence_index', 'projection_fragment_retrieval', 'retry_fallback',
]);

function terminal(reason) { return { schema_id: 'reuse-measurement', schema_version: '1.0.0', admission: 'withheld', reason, components: {} }; }

/** A value is never implied: unavailable components retain their terminal state without a value. */
export function metric(availability, { value, unit = null, source = null } = {}) {
  if (!AVAILABILITY.has(availability)) throw new TypeError('invalid metric availability');
  if (availability !== 'available' && value !== undefined) throw new TypeError('only available metrics may have values');
  if (availability === 'available' && value === undefined) throw new TypeError('available metrics require a value');
  return { availability, ...(value === undefined ? {} : { value }), unit, source };
}

export function createMeasurement({ scenario, route_role, terminal_outcome, verification, components, provenance } = {}) {
  if (!scenario || typeof scenario.tuple_identity !== 'string' || !scenario.tuple_identity) return terminal('scenario_incomplete');
  if (!['baseline', 'reuse', 'controller', 'follower'].includes(route_role)) return terminal('route_role_invalid');
  if (!terminal_outcome || typeof terminal_outcome.identity !== 'string' || !['passed', 'failed', 'invalidated', 'timeout', 'unavailable'].includes(terminal_outcome.status)) return terminal('outcome_incomplete');
  if (!verification || typeof verification.identity !== 'string' || !['passed', 'failed', 'unavailable', 'withheld'].includes(verification.status)) return terminal('verification_incomplete');
  if (!provenance || provenance.admission !== 'admitted' || provenance.artifacts_reconstructable !== true || provenance.retention_status !== 'retained') return terminal('evidence_not_admitted');
  if (!components || typeof components !== 'object' || REQUIRED_MEASUREMENT_COMPONENTS.some((key) => !Object.hasOwn(components, key))) return terminal('components_incomplete');
  for (const value of Object.values(components)) if (!value || !AVAILABILITY.has(value.availability) || (value.availability !== 'available' && Object.hasOwn(value, 'value')) || (value.availability === 'available' && !Object.hasOwn(value, 'value'))) return terminal('component_invalid');
  return { schema_id: 'reuse-measurement', schema_version: '1.0.0', admission: 'recorded', scenario: structuredClone(scenario), route_role, terminal_outcome: structuredClone(terminal_outcome), verification: structuredClone(verification), components: structuredClone(components), provenance: structuredClone(provenance) };
}

export function comparisonCompleteness(measurement) {
  if (!measurement || measurement.admission !== 'recorded') return false;
  return REQUIRED_MEASUREMENT_COMPONENTS.every((component) => measurement.components[component]?.availability === 'available');
}
