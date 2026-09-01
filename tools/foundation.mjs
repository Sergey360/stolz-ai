const SHA256 = /^[a-f0-9]{64}$/;
const STATES = new Set(['started', 'progressed', 'waiting', 'needs_decision', 'failed', 'done']);
const BENCHMARK_METRICS = ['tokens', 'model_wakeups', 'tool_calls', 'wall_time_ms', 'interventions'];

function error(path, message) { return { path, message }; }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function identityMap(identities) { return new Map(identities.map(({ id, sha256, version }) => [id, `${sha256}:${version ?? ''}`])); }
function matchingIdentitySets(recorded, requested) {
  const recordedMap = identityMap(recorded ?? []);
  const requestedMap = identityMap(requested ?? []);
  if (recordedMap.size !== requestedMap.size) return false;
  return [...requestedMap].every(([id, value]) => recordedMap.get(id) === value);
}

export function validateIdentities(identities, path = 'identities') {
  const errors = [];
  if (!Array.isArray(identities)) return [error(path, 'must be an array')];
  const seen = new Set();
  identities.forEach((identity, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(identity)) return errors.push(error(itemPath, 'must be an object'));
    if (typeof identity.id !== 'string' || !identity.id) errors.push(error(`${itemPath}.id`, 'must be a non-empty string'));
    if (typeof identity.sha256 !== 'string' || !SHA256.test(identity.sha256)) errors.push(error(`${itemPath}.sha256`, 'must be a lowercase SHA-256'));
    if (identity.version !== undefined && (typeof identity.version !== 'string' || !identity.version)) errors.push(error(`${itemPath}.version`, 'must be a non-empty string when present'));
    if (seen.has(identity.id)) errors.push(error(`${itemPath}.id`, 'must be unique'));
    seen.add(identity.id);
  });
  return errors;
}

export function validateManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) return { valid: false, errors: [error('manifest', 'must be an object')] };
  for (const key of ['task_id', 'selected_route']) if (typeof manifest[key] !== 'string' || !manifest[key]) errors.push(error(key, 'must be a non-empty string'));
  for (const key of ['source_artifacts', 'invalidation_inputs']) errors.push(...validateIdentities(manifest[key], key));
  if (Array.isArray(manifest.source_artifacts) && manifest.source_artifacts.length === 0) errors.push(error('source_artifacts', 'must contain at least one identity'));
  if (manifest.conditional_references !== undefined) errors.push(...validateIdentities(manifest.conditional_references, 'conditional_references'));
  if (manifest.adapter_id !== undefined && manifest.adapter_id !== null && (typeof manifest.adapter_id !== 'string' || !manifest.adapter_id)) errors.push(error('adapter_id', 'must be null or a non-empty string'));
  return { valid: errors.length === 0, errors };
}

export function validateLedgerEntry(entry) {
  const errors = [];
  if (!isObject(entry)) return { valid: false, errors: [error('entry', 'must be an object')] };
  if (typeof entry.key !== 'string' || !entry.key) errors.push(error('key', 'must be a non-empty string'));
  try { commandIdentity(entry.command); } catch (caught) { errors.push(error('command', caught.message)); }
  for (const key of ['input_identities', 'invalidation_inputs']) errors.push(...validateIdentities(entry[key], key));
  if (typeof entry.tool_version !== 'string' || !entry.tool_version) errors.push(error('tool_version', 'must be a non-empty string'));
  if (Number.isNaN(Date.parse(entry.recorded_at))) errors.push(error('recorded_at', 'must be an ISO date-time'));
  if (entry.expires_at !== undefined && entry.expires_at !== null && Number.isNaN(Date.parse(entry.expires_at))) errors.push(error('expires_at', 'must be an ISO date-time or null'));
  if (!isObject(entry.verification) || typeof entry.verification.passed !== 'boolean') errors.push(error('verification.passed', 'must be boolean'));
  return { valid: errors.length === 0, errors };
}

export function validateAdapterCapabilities(adapter) {
  const errors = [];
  if (!isObject(adapter)) return { valid: false, errors: [error('adapter', 'must be an object')] };
  for (const key of ['adapter_id', 'provider']) if (typeof adapter[key] !== 'string' || !adapter[key]) errors.push(error(key, 'must be a non-empty string'));
  if (!isObject(adapter.capabilities)) errors.push(error('capabilities', 'must be an object'));
  else for (const name of ['artifact_identity', 'command_execution', 'durable_state', 'measurement_capture']) if (typeof adapter.capabilities[name] !== 'boolean') errors.push(error(`capabilities.${name}`, 'must be boolean'));
  return { valid: errors.length === 0, errors };
}

export function selectSafeRoute(adapter, requiredCapabilities) {
  const checked = validateAdapterCapabilities(adapter);
  if (!checked.valid) return { route: 'provider-neutral', reason: 'invalid_adapter_declaration' };
  const missing = requiredCapabilities.filter((capability) => adapter.capabilities[capability] !== true);
  return missing.length ? { route: 'provider-neutral', reason: 'missing_capabilities', missing } : { route: 'adapter', adapter_id: adapter.adapter_id };
}

export function canReuseLedgerEntry(entry, requested, now = new Date()) {
  if (!entry || entry.verification?.passed !== true) return { reusable: false, reason: 'verification_failed' };
  if (entry.expires_at && Date.parse(entry.expires_at) <= now.getTime()) return { reusable: false, reason: 'expired' };
  if (!matchingIdentitySets(entry.input_identities, requested.input_identities)) return { reusable: false, reason: 'input_identity_mismatch' };
  if (!matchingIdentitySets(entry.invalidation_inputs, requested.invalidation_inputs)) return { reusable: false, reason: 'invalidation_identity_mismatch' };
  return { reusable: true, entry };
}

export function commandIdentity(command) {
  if (!isObject(command) || typeof command.program !== 'string' || !command.program || !Array.isArray(command.args) || command.args.some((arg) => typeof arg !== 'string')) throw new TypeError('command must use a program and string argv array');
  return JSON.stringify([command.program, command.args]);
}

export function deduplicateCommand(command, activeCommands = new Map()) {
  const key = commandIdentity(command);
  const owner = activeCommands.get(key);
  return owner ? { execute: false, key, owner } : { execute: true, key };
}

export function createStateEvent({ operation_id, state, cursor = null, retry = 0, reason, at = new Date().toISOString() }) {
  if (typeof operation_id !== 'string' || !operation_id) throw new TypeError('operation_id is required');
  if (!STATES.has(state)) throw new TypeError('state is invalid');
  if (!Number.isInteger(retry) || retry < 0) throw new TypeError('retry must be a non-negative integer');
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 240)) throw new TypeError('reason must be a string no longer than 240 characters');
  return Object.fromEntries(Object.entries({ operation_id, state, at, cursor, retry, reason }).filter(([, value]) => value !== undefined));
}

export function nextStateEvent(previous, next) {
  const event = createStateEvent(next);
  if (previous && ['state', 'cursor', 'retry', 'reason'].every((key) => previous[key] === event[key])) return null;
  return event;
}

export function evaluateBenchmark(record) {
  const baseline = record?.baseline;
  const optimized = record?.optimized;
  const identityFields = ['fixture_id', 'fixture_version', 'required_outcome', 'baseline_route', 'optimized_route'];
  if (identityFields.some((field) => typeof record?.[field] !== 'string' || !record[field])) return { accepted: false, reason: 'missing_identity' };
  if (!baseline || !optimized) return { accepted: false, reason: 'missing_measurement' };
  for (const measurement of [baseline, optimized]) {
    if (BENCHMARK_METRICS.some((metric) => !Number.isInteger(measurement[metric]) || measurement[metric] < 0)) return { accepted: false, reason: 'missing_measurement' };
    if (typeof measurement.outcome !== 'string' || !measurement.outcome || typeof measurement.verification !== 'boolean') return { accepted: false, reason: 'missing_measurement' };
    if (typeof measurement.token_source !== 'string' || !measurement.token_source || !Array.isArray(measurement.evidence) || measurement.evidence.length === 0) return { accepted: false, reason: 'missing_measurement' };
  }
  if (baseline.token_source !== optimized.token_source) return { accepted: false, reason: 'token_source_mismatch' };
  if (!baseline.verification || !optimized.verification) return { accepted: false, reason: 'verification_failed' };
  if (baseline.outcome !== optimized.outcome) return { accepted: false, reason: 'outcome_mismatch' };
  if (baseline.outcome !== record.required_outcome) return { accepted: false, reason: 'required_outcome_failed' };
  return { accepted: true, token_delta: optimized.tokens - baseline.tokens, token_saving: optimized.tokens < baseline.tokens };
}
