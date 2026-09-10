import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

export const CONTEXT_STATE_VERSION = '0.6.0';

const contractNames = Object.freeze({
  delta: 'delta-context.schema.json',
  fragment: 'read-fragment-ledger.schema.json',
  quiet: 'quiet-state.schema.json',
  route: 'runtime-route.schema.json',
  evidence: 'evidence-claim.schema.json',
});
const schemaRoot = new URL('../contracts/context-state-v0.6/', import.meta.url);
const schemas = Object.fromEntries(await Promise.all(Object.entries(contractNames).map(async ([name, filename]) => [
  name,
  JSON.parse(await readFile(new URL(filename, schemaRoot), 'utf8')),
])));
const validators = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [
  name,
  new Ajv2020({ allErrors: true, strict: false }).compile(schema),
]));
const SHA256 = /^[a-f0-9]{64}$/;

function canonical(value) {
  if (typeof value === 'string') return value.normalize('NFC').replace(/\r\n/g, '\n');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function validate(name, record, semantic = () => []) {
  const validator = validators[name];
  const schemaErrors = validator(record) ? [] : (validator.errors ?? []).map(({ instancePath, keyword }) => `schema:${instancePath || '/'}:${keyword}`);
  return { valid: schemaErrors.length === 0 && semantic(record).length === 0, errors: [...schemaErrors, ...semantic(record)] };
}

function rangeErrors(range) {
  if (!range || !Number.isInteger(range.start_byte) || !Number.isInteger(range.end_byte) || range.end_byte <= range.start_byte) return ['range_not_strictly_bounded'];
  return [];
}

/** Validate the no-full-reread delta envelope before any context acquisition. */
export function validateDeltaContext(record) {
  return validate('delta', record, (candidate) => {
    const errors = [];
    if (candidate?.base_git_object?.object_id === candidate?.head_git_object?.object_id) errors.push('base_and_head_must_differ');
    const ranges = candidate?.changed_ranges;
    if (Array.isArray(ranges)) {
      const keys = new Set();
      for (const range of ranges) {
        errors.push(...rangeErrors(range));
        const key = `${range.path}:${range.head_blob}:${range.start_byte}:${range.end_byte}`;
        if (keys.has(key)) errors.push('duplicate_changed_range');
        keys.add(key);
      }
      if (Number.isInteger(candidate?.retrieval?.max_fragments) && ranges.length > candidate.retrieval.max_fragments) errors.push('fragment_limit_exceeded');
    }
    return errors;
  });
}

export function deltaContextSha256(record) {
  const result = validateDeltaContext(record);
  if (!result.valid) throw new TypeError(`invalid delta context: ${result.errors.join(', ')}`);
  return createHash('sha256').update(JSON.stringify(canonical(record))).digest('hex');
}

/** Validate durable fragment identity and invalidation without reading the repository again. */
export function validateReadFragment(record) {
  return validate('fragment', record, (candidate) => {
    const errors = rangeErrors(candidate?.range);
    if (candidate?.invalidation?.state === 'valid' && candidate.invalidation.reasons.length > 0) errors.push('valid_fragment_has_invalidation_reason');
    if (candidate?.invalidation?.state !== 'valid' && candidate.invalidation?.reasons?.length === 0) errors.push('invalid_fragment_needs_reason');
    return errors;
  });
}

/**
 * Classify an external poll. Unchanged fingerprints are deliberately quiet and
 * can never invoke a model; only the three explicit wake conditions may wake.
 */
export function decideQuietPoll({ poll_identity, previous_material_state, next_material_state, signal = 'unchanged' } = {}) {
  if (![poll_identity, previous_material_state, next_material_state].every((value) => SHA256.test(value))) throw new TypeError('poll and material state identities must be SHA-256 values');
  const unchanged = previous_material_state === next_material_state;
  const wake = signal === 'failure' ? 'wake_failure'
    : signal === 'needs_decision' ? 'wake_needs_decision'
      : signal === 'terminal_material_change' && !unchanged ? 'wake_terminal_material_change'
        : 'quiet';
  return {
    schema_id: 'quiet-external-state', schema_version: CONTEXT_STATE_VERSION,
    poll_identity, previous_material_state, next_material_state,
    disposition: wake,
    model_invocations: 0,
    reason: wake === 'quiet' ? 'unchanged' : wake.replace('wake_', ''),
  };
}

export function validateQuietState(record) {
  return validate('quiet', record, (candidate) => {
    const unchanged = candidate?.previous_material_state === candidate?.next_material_state;
    if (unchanged && (candidate?.disposition !== 'quiet' || candidate?.model_invocations !== 0 || candidate?.reason !== 'unchanged')) return ['unchanged_poll_must_be_quiet'];
    if (!unchanged && candidate?.disposition === 'quiet') return ['changed_poll_requires_explicit_terminal_signal'];
    if (candidate?.model_invocations !== 0) return ['routing_or_poll_model_invocation_forbidden'];
    return [];
  });
}

const SUPPORTED_ROUTE_RUNTIMES = new Set(['codex', 'claude-code', 'qwen-code']);
const MAX_ROUTE_MECHANISMS = 4;
const PROVIDER_FIELDS = new Set(['provider', 'model', 'protocol', 'endpoint']);

function assertRuntimeOnlyRouteInput(candidate) {
  if (candidate && typeof candidate === 'object' && [...PROVIDER_FIELDS].some((field) => Object.hasOwn(candidate, field))) {
    throw new TypeError('route selection accepts runtime/profile evidence only, never provider or model fields');
  }
}

/**
 * Resolve a short, profile-declared mechanism sequence without model routing.
 * A candidate activates only when its measured benefit exceeds its complete
 * overhead; all examined candidates remain in the trace with their decision.
 */
export function resolveRuntimeRoute({ runtime, profile_identity, economic_evidence_identity, requested_capabilities = [], mechanisms = [], limit = 2, ...routeMetadata } = {}) {
  assertRuntimeOnlyRouteInput(routeMetadata);
  if (!SUPPORTED_ROUTE_RUNTIMES.has(runtime)) throw new TypeError('unsupported runtime: route selection fails closed');
  if (!SHA256.test(profile_identity)) throw new TypeError('profile_identity must be a SHA-256 value');
  if (!SHA256.test(economic_evidence_identity)) throw new TypeError('economic_evidence_identity must be a SHA-256 value');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROUTE_MECHANISMS) throw new TypeError(`limit must be an integer between 1 and ${MAX_ROUTE_MECHANISMS}`);
  const requested = [...new Set(requested_capabilities)].sort();
  if (!Array.isArray(mechanisms) || mechanisms.length > 16) throw new TypeError('mechanisms must be an array with at most 16 entries');
  for (const mechanism of mechanisms) {
    assertRuntimeOnlyRouteInput(mechanism);
    if (!mechanism || !Number.isInteger(mechanism.sequence_rank) || !Number.isInteger(mechanism.cost_rank) ||
      !Number.isInteger(mechanism.measured_benefit_units) || mechanism.measured_benefit_units < 0 ||
      !Number.isInteger(mechanism.total_overhead_units) || mechanism.total_overhead_units < 0 ||
      mechanism.economic_evidence_identity !== economic_evidence_identity) {
      throw new TypeError('mechanisms require bounded ranks and matching measured economic evidence');
    }
  }
  const ordered = [...mechanisms].sort((left, right) => left.sequence_rank - right.sequence_rank || left.cost_rank - right.cost_rank || left.mechanism_id.localeCompare(right.mechanism_id));
  let activated = 0;
  const trace = ordered.map((mechanism) => {
    const net_benefit_units = mechanism.measured_benefit_units - mechanism.total_overhead_units;
    let decision = 'activated';
    if (mechanism.runtime !== runtime) decision = 'runtime_mismatch';
    else if (mechanism.profile_identity !== profile_identity) decision = 'profile_mismatch';
    else if (!requested.every((capability) => mechanism.capabilities?.includes(capability))) decision = 'capability_missing';
    else if (mechanism.eligible !== true) decision = 'profile_ineligible';
    else if (net_benefit_units <= 0) decision = 'uneconomic_after_all_overhead';
    else if (activated >= limit) decision = 'mechanism_limit_reached';
    else activated += 1;
    return {
      mechanism_id: mechanism.mechanism_id, source: 'runtime_profile', eligible: mechanism.eligible === true,
      activated: decision === 'activated', sequence_rank: mechanism.sequence_rank, cost_rank: mechanism.cost_rank,
      measured_benefit_units: mechanism.measured_benefit_units, total_overhead_units: mechanism.total_overhead_units,
      net_benefit_units, decision,
    };
  });
  return {
    schema_id: 'runtime-profile-route', schema_version: CONTEXT_STATE_VERSION,
    runtime, profile_identity, economic_evidence_identity, requested_capabilities: requested,
    route_disposition: activated > 0 ? 'selected' : 'safe_baseline', mechanisms: trace,
    router_model_invocations: 0,
    bounded_mechanisms: limit,
  };
}

export function validateRuntimeRoute(record) {
  return validate('route', record, (candidate) => {
    const mechanisms = candidate?.mechanisms;
    if (!Array.isArray(mechanisms)) return [];
    const ids = mechanisms.map(({ mechanism_id }) => mechanism_id);
    if (new Set(ids).size !== ids.length) return ['duplicate_mechanism'];
    if (mechanisms.filter(({ activated }) => activated).length > candidate.bounded_mechanisms) return ['mechanism_limit_exceeded'];
    if (mechanisms.some(({ eligible, activated }) => activated && !eligible)) return ['ineligible_mechanism_activated'];
    if (mechanisms.some(({ activated, net_benefit_units, decision }) => activated !== (decision === 'activated') || (activated && net_benefit_units <= 0))) return ['activation_must_have_positive_net_benefit'];
    if (candidate?.route_disposition === 'selected' && !mechanisms.some(({ activated }) => activated)) return ['selected_route_needs_activation'];
    if (candidate?.route_disposition === 'safe_baseline' && mechanisms.some(({ activated }) => activated)) return ['safe_baseline_cannot_activate'];
    const sorted = [...mechanisms].sort((left, right) => left.sequence_rank - right.sequence_rank || left.cost_rank - right.cost_rank || left.mechanism_id.localeCompare(right.mechanism_id));
    if (JSON.stringify(sorted) !== JSON.stringify(mechanisms)) return ['mechanisms_not_deterministically_ordered'];
    return [];
  });
}

/**
 * Admit only a scenario-scoped claim whose provider-native and runtime records
 * are independently present, remain disjoint, and report the same outcome and
 * verification identities. Otherwise produce a withheld record.
 */
export function admitSeparatedEvidenceClaim({ scenario_id, provider_native_evidence, runtime_evidence } = {}) {
  const evidence = { provider_native_evidence, runtime_evidence };
  const outcome_identity = provider_native_evidence?.outcome_identity ?? runtime_evidence?.outcome_identity;
  const verification_identity = provider_native_evidence?.verification_identity ?? runtime_evidence?.verification_identity;
  const complete = provider_native_evidence?.kind === 'provider_native' && runtime_evidence?.kind === 'runtime_measured' &&
    provider_native_evidence?.available === true && runtime_evidence?.available === true &&
    provider_native_evidence?.record_sha256 !== runtime_evidence?.record_sha256 &&
    provider_native_evidence?.outcome_identity === runtime_evidence?.outcome_identity &&
    provider_native_evidence?.verification_identity === runtime_evidence?.verification_identity;
  return {
    schema_id: 'separated-evidence-claim', schema_version: CONTEXT_STATE_VERSION, scenario_id,
    ...evidence, outcome_identity, verification_identity,
    admission: complete ? 'admitted_scenario' : 'withheld',
    ...(complete ? {} : { withheld_reason: 'evidence_separation_or_equality_not_satisfied' }),
  };
}

export function validateSeparatedEvidenceClaim(record) {
  return validate('evidence', record, (candidate) => {
    const provider = candidate?.provider_native_evidence;
    const runtime = candidate?.runtime_evidence;
    if (provider?.kind !== 'provider_native' || runtime?.kind !== 'runtime_measured') return ['evidence_tracks_must_remain_separate'];
    const equal = provider?.outcome_identity === runtime?.outcome_identity && provider?.verification_identity === runtime?.verification_identity && provider?.record_sha256 !== runtime?.record_sha256;
    if (candidate?.admission === 'admitted_scenario' && (!equal || !provider?.available || !runtime?.available || candidate.outcome_identity !== provider.outcome_identity || candidate.verification_identity !== provider.verification_identity)) return ['admitted_claim_requires_equal_distinct_evidence'];
    if (candidate?.admission === 'withheld' && !candidate?.withheld_reason) return ['withheld_claim_requires_reason'];
    return [];
  });
}
