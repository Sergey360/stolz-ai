import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { resolveOptionalIntegration } from './integrations/registry.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const ROUTE_ROLES = ['baseline', 'optimized'];
const EVIDENCE_CLASSES = new Set(['fixture_only', 'runtime_telemetry', 'provider_native']);
const AVAILABILITY = new Set(['available', 'unavailable', 'not_comparable']);
const PROVENANCE = new Set(['provider_observed', 'runtime_observed', 'derived', 'fixture_authored', 'unavailable']);
const HASH_METHOD = 'sha256-canonical-json-v1';

const FORBIDDEN_KEYS = [
  /(?:^|_)(?:credential|credentials|secret|secrets|api_key|access_token|refresh_token)(?:$|_)/i,
  /(?:^|_)(?:authorization|proxy_authorization|cookie|set_cookie)(?:$|_)/i,
  /(?:^|_)(?:private_hostname|hostname|host_name)(?:$|_)/i,
  /(?:^|_)(?:user_task_content|task_content|prompt|user_message|conversation|request_body)(?:$|_)/i,
  /(?:^|_)(?:provider_internal|provider_operational|internal_operation)(?:$|_)/i,
];
const FORBIDDEN_VALUES = [
  /\b(?:bearer|basic)\s+[a-z0-9._~+/=:-]+/i,
  /\b(?:sk|ghp|glpat)-[a-z0-9_-]{8,}\b/i,
  /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/,
  /(?:https?:\/\/)?[a-z0-9.-]+\.(?:internal|local)(?::\d+)?(?:\/|$)/i,
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('benchmark values must be finite');
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Json(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function assertObject(value, label) {
  if (!isObject(value)) throw new TypeError(`${label} must be an object`);
}

function assertExactKeys(value, allowed, label) {
  assertObject(value, label);
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new TypeError(`${label} contains unsupported fields: ${extras.join(', ')}`);
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
}

function assertIdentity(identity, label) {
  assertExactKeys(identity, ['id', 'version', 'sha256'], label);
  assertString(identity.id, `${label}.id`);
  assertString(identity.version, `${label}.version`);
  if (!SHA256.test(identity.sha256 ?? '')) throw new TypeError(`${label}.sha256 must be a lowercase SHA-256`);
}

function assertRelativePath(path, label) {
  if (typeof path !== 'string' || path.length === 0 || isAbsolute(path) || /^[a-z][a-z0-9+.-]*:/i.test(path)) throw new TypeError(`${label} must be a repository-relative path`);
  const normalized = relative('.', resolve('.', path));
  if (normalized.startsWith('..') || isAbsolute(normalized)) throw new TypeError(`${label} escapes the repository root`);
}

function resolveInside(root, path) {
  assertRelativePath(path, 'benchmark path');
  const target = resolve(root, path);
  const fromRoot = relative(resolve(root), target);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new TypeError(`benchmark path escapes repository root: ${path}`);
  return target;
}

function walk(value, path = '$') {
  if (Array.isArray(value)) return value.flatMap((item, index) => walk(item, `${path}[${index}]`));
  if (isObject(value)) return Object.entries(value).flatMap(([key, item]) => [
    { path: `${path}.${key}`, kind: 'key', value: key },
    ...walk(item, `${path}.${key}`),
  ]);
  return typeof value === 'string' ? [{ path, kind: 'value', value }] : [];
}

export function assertPublishableEvidence(value, label = 'benchmark evidence') {
  for (const entry of walk(value)) {
    const patterns = entry.kind === 'key' ? FORBIDDEN_KEYS : FORBIDDEN_VALUES;
    if (patterns.some((pattern) => pattern.test(entry.value))) {
      throw new Error(`sanitization rejected ${label} at ${entry.path}`);
    }
  }
  return true;
}

function assertConfiguredIdentity(spec, label) {
  assertExactKeys(spec, ['id', 'version', 'configuration'], label);
  assertString(spec.id, `${label}.id`);
  assertString(spec.version, `${label}.version`);
  assertObject(spec.configuration, `${label}.configuration`);
}

function identityFromSpec(spec, label) {
  assertConfiguredIdentity(spec, label);
  return { id: spec.id, version: spec.version, sha256: sha256Json(spec.configuration) };
}

function componentFromSpec(spec, label, { unavailable = false } = {}) {
  if (unavailable && spec?.status === 'unavailable') {
    assertExactKeys(spec, ['status', 'reason', 'configuration'], label);
    assertString(spec.reason, `${label}.reason`);
    assertObject(spec.configuration, `${label}.configuration`);
    return {
      status: 'unavailable',
      reason: spec.reason,
      configuration_identity: {
        id: `${label}/unavailable-configuration`,
        version: '1.0.0',
        sha256: sha256Json(spec.configuration),
      },
    };
  }
  assertConfiguredIdentity(spec, label);
  return {
    id: spec.id,
    version: spec.version,
    configuration_identity: {
      id: `${spec.id}/configuration`,
      version: spec.version,
      sha256: sha256Json(spec.configuration),
    },
  };
}

function validateFixture(fixture) {
  assertPublishableEvidence(fixture, 'benchmark fixture');
  assertExactKeys(fixture, [
    'schema', 'fixture_id', 'fixture_version', 'title', 'task', 'routes', 'required_outcome',
    'verification', 'execution', 'evidence_class', 'environment', 'metric_contracts',
    'regression_budgets', 'raw_repetitions', 'outputs',
  ], 'fixture');
  if (fixture.schema !== 'stolz.benchmark-fixture.v2') throw new TypeError('fixture.schema must be stolz.benchmark-fixture.v2');
  assertString(fixture.fixture_id, 'fixture.fixture_id');
  assertString(fixture.fixture_version, 'fixture.fixture_version');
  assertString(fixture.title, 'fixture.title');
  identityFromSpec(fixture.task, 'fixture.task');
  if (!EVIDENCE_CLASSES.has(fixture.evidence_class)) throw new TypeError('fixture.evidence_class is invalid');

  if (!Array.isArray(fixture.routes) || fixture.routes.length !== 2) throw new TypeError('fixture.routes must contain baseline and optimized routes');
  const routeRoles = fixture.routes.map((route, index) => {
    assertExactKeys(route, ['route_role', 'id', 'version', 'configuration'], `fixture.routes[${index}]`);
    if (!ROUTE_ROLES.includes(route.route_role)) throw new TypeError(`fixture.routes[${index}].route_role is invalid`);
    identityFromSpec({ id: route.id, version: route.version, configuration: route.configuration }, `fixture.routes[${index}]`);
    return route.route_role;
  });
  if (!ROUTE_ROLES.every((role) => routeRoles.includes(role))) throw new TypeError('fixture.routes must contain one baseline and one optimized route');

  assertExactKeys(fixture.required_outcome, ['id', 'evaluator'], 'fixture.required_outcome');
  assertString(fixture.required_outcome.id, 'fixture.required_outcome.id');
  identityFromSpec(fixture.required_outcome.evaluator, 'fixture.required_outcome.evaluator');
  assertExactKeys(fixture.verification, ['procedure', 'evaluator'], 'fixture.verification');
  identityFromSpec(fixture.verification.procedure, 'fixture.verification.procedure');
  identityFromSpec(fixture.verification.evaluator, 'fixture.verification.evaluator');

  assertExactKeys(fixture.execution, ['planned_repetitions_per_route', 'seed', 'ordering_policy'], 'fixture.execution');
  if (!Number.isInteger(fixture.execution.planned_repetitions_per_route) || fixture.execution.planned_repetitions_per_route < 5) throw new TypeError('fixture.execution.planned_repetitions_per_route must be at least five');
  assertString(fixture.execution.seed, 'fixture.execution.seed');
  if (fixture.execution.ordering_policy !== 'alternating-baseline-first-v1') throw new TypeError('fixture.execution.ordering_policy must be alternating-baseline-first-v1');

  assertExactKeys(fixture.environment, ['agent_runtime', 'adapter', 'provider', 'model', 'collector', 'optional_integrations', 'capture_method'], 'fixture.environment');
  componentFromSpec(fixture.environment.agent_runtime, 'agent-runtime');
  componentFromSpec(fixture.environment.adapter, 'adapter', { unavailable: true });
  componentFromSpec(fixture.environment.provider, 'provider', { unavailable: true });
  componentFromSpec(fixture.environment.model, 'model', { unavailable: true });
  componentFromSpec(fixture.environment.collector, 'collector');
  componentFromSpec(fixture.environment.capture_method, 'capture-method');
  if (!Array.isArray(fixture.environment.optional_integrations)) throw new TypeError('fixture.environment.optional_integrations must be an array');
  const integrations = fixture.environment.optional_integrations.map((integration, index) => componentFromSpec(integration, `integration-${index}`));
  if (new Set(integrations.map(({ id }) => id)).size !== integrations.length) throw new TypeError('fixture optional integrations must be unique');
  const captureIntegration = fixture.environment.optional_integrations.find(({ id }) => id === 'benchmark-capture');
  if (!captureIntegration) throw new TypeError('fixture must record the benchmark-capture integration');
  const integrationResolution = resolveOptionalIntegration({
    profile: {
      optional_integrations: [{
        integration_id: captureIntegration.id,
        version: captureIntegration.version,
        capabilities: [captureIntegration.configuration.capability],
      }],
    },
    integration_id: captureIntegration.id,
    trigger_id: captureIntegration.configuration.trigger,
  });
  if (integrationResolution.resolution !== 'resolved') throw new TypeError(`fixture benchmark-capture integration is invalid: ${integrationResolution.reason}`);

  if (!Array.isArray(fixture.metric_contracts) || fixture.metric_contracts.length === 0) throw new TypeError('fixture.metric_contracts must not be empty');
  const metricNames = fixture.metric_contracts.map((metric, index) => {
    assertExactKeys(metric, ['name', 'unit', 'expected_availability', 'provenance'], `fixture.metric_contracts[${index}]`);
    assertString(metric.name, `fixture.metric_contracts[${index}].name`);
    assertString(metric.unit, `fixture.metric_contracts[${index}].unit`);
    if (!AVAILABILITY.has(metric.expected_availability)) throw new TypeError(`fixture.metric_contracts[${index}].expected_availability is invalid`);
    if (!PROVENANCE.has(metric.provenance)) throw new TypeError(`fixture.metric_contracts[${index}].provenance is invalid`);
    if (metric.expected_availability === 'available' && metric.provenance === 'unavailable') throw new TypeError(`${metric.name} cannot be available with unavailable provenance`);
    if (metric.expected_availability !== 'available' && metric.provenance !== 'unavailable') throw new TypeError(`${metric.name} unavailable states must use unavailable provenance`);
    if (fixture.evidence_class === 'fixture_only' && metric.expected_availability === 'available' && !['fixture_authored', 'derived'].includes(metric.provenance)) throw new TypeError(`${metric.name} exceeds fixture_only provenance`);
    return metric.name;
  });
  if (new Set(metricNames).size !== metricNames.length) throw new TypeError('fixture metric contracts must be unique');
  for (const required of ['fixture_token_units', 'provider_input_tokens', 'runtime_elapsed_ms']) {
    if (!metricNames.includes(required)) throw new TypeError(`fixture.metric_contracts must include ${required}`);
  }
  if (metricNames.includes('intervention_count')) throw new TypeError('intervention_count is recorded separately from metric_contracts');

  if (!Array.isArray(fixture.regression_budgets) || fixture.regression_budgets.length === 0) throw new TypeError('fixture.regression_budgets must not be empty');
  fixture.regression_budgets.forEach((budget, index) => {
    assertExactKeys(budget, ['metric', 'unit', 'direction', 'threshold'], `fixture.regression_budgets[${index}]`);
    if (!metricNames.includes(budget.metric)) throw new TypeError(`regression budget metric is undeclared: ${budget.metric}`);
    assertString(budget.unit, `fixture.regression_budgets[${index}].unit`);
    if (!['must_not_increase', 'must_not_decrease', 'exact_match'].includes(budget.direction)) throw new TypeError(`fixture.regression_budgets[${index}].direction is invalid`);
    if (typeof budget.threshold !== 'number' || !Number.isFinite(budget.threshold) || budget.threshold < 0) throw new TypeError(`fixture.regression_budgets[${index}].threshold must be non-negative`);
  });

  if (!Array.isArray(fixture.raw_repetitions)) throw new TypeError('fixture.raw_repetitions must be an array');
  const expectedRawCount = fixture.execution.planned_repetitions_per_route * ROUTE_ROLES.length;
  if (fixture.raw_repetitions.length !== expectedRawCount) throw new TypeError(`fixture.raw_repetitions must contain ${expectedRawCount} entries`);
  const rawPaths = new Set();
  for (const [index, descriptor] of fixture.raw_repetitions.entries()) {
    assertExactKeys(descriptor, ['route_role', 'path', 'sha256'], `fixture.raw_repetitions[${index}]`);
    if (!ROUTE_ROLES.includes(descriptor.route_role)) throw new TypeError(`fixture.raw_repetitions[${index}].route_role is invalid`);
    assertRelativePath(descriptor.path, `fixture.raw_repetitions[${index}].path`);
    if (!SHA256.test(descriptor.sha256 ?? '')) throw new TypeError(`fixture.raw_repetitions[${index}].sha256 is invalid`);
    if (rawPaths.has(descriptor.path)) throw new TypeError(`duplicate raw evidence path: ${descriptor.path}`);
    rawPaths.add(descriptor.path);
  }
  for (const role of ROUTE_ROLES) {
    if (fixture.raw_repetitions.filter((entry) => entry.route_role === role).length !== fixture.execution.planned_repetitions_per_route) throw new TypeError(`fixture must contain the planned ${role} repetitions`);
  }

  assertExactKeys(fixture.outputs, ['evidence_directory', 'sanitization_manifest', 'aggregate_record'], 'fixture.outputs');
  for (const [key, path] of Object.entries(fixture.outputs)) assertRelativePath(path, `fixture.outputs.${key}`);
  return fixture;
}

function expectedSeed(fixture, role, index) {
  return `${fixture.execution.seed}:${role}:${String(index).padStart(3, '0')}`;
}

function expectedOrderingIndex(role, repetitionIndex) {
  return ((repetitionIndex - 1) * ROUTE_ROLES.length) + ROUTE_ROLES.indexOf(role) + 1;
}

function validateMetric(metric, contract, label) {
  if (metric?.availability === 'available') {
    assertExactKeys(metric, ['name', 'availability', 'value', 'unit', 'provenance', 'formula'], label);
    if (typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0) throw new TypeError(`${label}.value must be a non-negative finite number`);
    if (metric.formula !== undefined) assertString(metric.formula, `${label}.formula`);
    if (metric.provenance === 'derived' && metric.formula === undefined) throw new TypeError(`${label}.formula is required for derived metrics`);
    if (metric.provenance !== 'derived' && metric.formula !== undefined) throw new TypeError(`${label}.formula is allowed only for derived metrics`);
  } else {
    assertExactKeys(metric, ['name', 'availability', 'unit', 'provenance', 'unavailable_reason'], label);
    assertString(metric.unavailable_reason, `${label}.unavailable_reason`);
  }
  if (metric.name !== contract.name || metric.unit !== contract.unit || metric.availability !== contract.expected_availability || metric.provenance !== contract.provenance) throw new TypeError(`${label} does not match its metric contract`);
  if (!AVAILABILITY.has(metric.availability) || !PROVENANCE.has(metric.provenance)) throw new TypeError(`${label} has invalid availability or provenance`);
  if (metric.availability !== 'available' && Object.hasOwn(metric, 'value')) throw new TypeError(`${label} unavailable telemetry must not contain a value`);
}

function validateRawRepetition(raw, fixture, descriptor, label) {
  assertPublishableEvidence(raw, label);
  assertExactKeys(raw, [
    'schema', 'fixture_id', 'task_id', 'route_role', 'route_id', 'repetition_index',
    'ordering_index', 'seed', 'started_at', 'completed_at', 'capture_method_id',
    'metrics', 'intervention_count', 'outcome', 'verification',
  ], label);
  if (raw.schema !== 'stolz.benchmark-raw-fixture.v2') throw new TypeError(`${label}.schema is invalid`);
  if (raw.fixture_id !== fixture.fixture_id || raw.task_id !== fixture.task.id) throw new TypeError(`${label} fixture/task identity does not match`);
  if (raw.route_role !== descriptor.route_role) throw new TypeError(`${label}.route_role does not match its descriptor`);
  const route = fixture.routes.find(({ route_role }) => route_role === raw.route_role);
  if (raw.route_id !== route.id) throw new TypeError(`${label}.route_id does not match the fixture route`);
  if (!Number.isInteger(raw.repetition_index) || raw.repetition_index < 1 || raw.repetition_index > fixture.execution.planned_repetitions_per_route) throw new TypeError(`${label}.repetition_index is outside the execution plan`);
  const order = expectedOrderingIndex(raw.route_role, raw.repetition_index);
  if (raw.ordering_index !== order) throw new TypeError(`${label}.ordering_index must be ${order}`);
  const seed = expectedSeed(fixture, raw.route_role, raw.repetition_index);
  if (raw.seed !== seed) throw new TypeError(`${label}.seed must be ${seed}`);
  for (const field of ['started_at', 'completed_at']) {
    if (typeof raw[field] !== 'string' || Number.isNaN(Date.parse(raw[field]))) throw new TypeError(`${label}.${field} must be an ISO date-time`);
  }
  if (Date.parse(raw.completed_at) < Date.parse(raw.started_at)) throw new TypeError(`${label}.completed_at precedes started_at`);
  if (raw.capture_method_id !== fixture.environment.capture_method.id) throw new TypeError(`${label}.capture_method_id does not match the fixture`);

  if (!Array.isArray(raw.metrics) || raw.metrics.length !== fixture.metric_contracts.length) throw new TypeError(`${label}.metrics must match the fixture metric contracts`);
  const rawMetricNames = raw.metrics.map(({ name }) => name);
  if (new Set(rawMetricNames).size !== rawMetricNames.length) throw new TypeError(`${label}.metrics must be unique`);
  for (const contract of fixture.metric_contracts) {
    const metric = raw.metrics.find(({ name }) => name === contract.name);
    if (!metric) throw new TypeError(`${label} is missing metric ${contract.name}`);
    validateMetric(metric, contract, `${label}.metrics.${contract.name}`);
  }

  if (!Number.isInteger(raw.intervention_count) || raw.intervention_count < 0) throw new TypeError(`${label}.intervention_count must be a non-negative integer`);
  assertExactKeys(raw.outcome, ['required_outcome', 'passed', 'evaluator_id'], `${label}.outcome`);
  if (raw.outcome.required_outcome !== fixture.required_outcome.id || raw.outcome.passed !== true || raw.outcome.evaluator_id !== fixture.required_outcome.evaluator.id) throw new TypeError(`${label}.outcome must pass the required evaluator`);
  assertExactKeys(raw.verification, ['procedure_id', 'passed', 'evaluator_id'], `${label}.verification`);
  if (raw.verification.procedure_id !== fixture.verification.procedure.id || raw.verification.passed !== true || raw.verification.evaluator_id !== fixture.verification.evaluator.id) throw new TypeError(`${label}.verification must pass the required procedure and evaluator`);
  return raw;
}

function environmentFromFixture(fixture) {
  return {
    agent_runtime: componentFromSpec(fixture.environment.agent_runtime, 'agent-runtime'),
    adapter: componentFromSpec(fixture.environment.adapter, 'adapter', { unavailable: true }),
    provider: componentFromSpec(fixture.environment.provider, 'provider', { unavailable: true }),
    model: componentFromSpec(fixture.environment.model, 'model', { unavailable: true }),
    collector: componentFromSpec(fixture.environment.collector, 'collector'),
    optional_integrations: fixture.environment.optional_integrations.map((integration, index) => componentFromSpec(integration, `integration-${index}`)),
  };
}

function routeIdentity(fixture, role) {
  const route = fixture.routes.find(({ route_role }) => route_role === role);
  return identityFromSpec({ id: route.id, version: route.version, configuration: route.configuration }, `route.${role}`);
}

function evidencePath(fixture, raw) {
  return `${fixture.outputs.evidence_directory}/${raw.route_role}-${String(raw.repetition_index).padStart(3, '0')}.json`;
}

function attachEvidenceIdentity(record, fixture, raw) {
  const identity = {
    id: `${fixture.fixture_id}/${raw.route_role}/${String(raw.repetition_index).padStart(3, '0')}`,
    version: fixture.fixture_version,
  };
  const evidenceId = { ...identity, sha256: sha256Json({ evidence_id: identity, ...record }) };
  return { evidence_id: evidenceId, ...record };
}

export function verifyEvidenceIdentity(record) {
  assertObject(record, 'evidence record');
  assertIdentity(record.evidence_id, 'evidence.evidence_id');
  const basis = clone(record);
  basis.evidence_id = { id: record.evidence_id.id, version: record.evidence_id.version };
  const actual = sha256Json(basis);
  if (actual !== record.evidence_id.sha256) throw new Error(`evidence identity SHA-256 mismatch: expected ${record.evidence_id.sha256}, got ${actual}`);
  assertPublishableEvidence(record, 'generated evidence record');
  return true;
}

function makeSanitizationManifest(fixture, rawCount) {
  const policyConfiguration = {
    scope: 'fixture-and-generated-evidence',
    categories: ['auth_material', 'private_network_identity', 'task_payload', 'vendor_operations'],
  };
  return {
    schema: 'stolz.benchmark-sanitization-manifest.v2',
    status: 'passed',
    policy: {
      id: 'stolz-public-evidence-sanitization',
      version: '1.0.0',
      configuration_identity: {
        id: 'stolz-public-evidence-sanitization/configuration',
        version: '1.0.0',
        sha256: sha256Json(policyConfiguration),
      },
    },
    hash_method: HASH_METHOD,
    records_scanned: rawCount + 1,
    rejected_records: 0,
  };
}

function makeEvidenceRecord({ fixture, raw, descriptor, manifestLink }) {
  const rawLink = { uri: descriptor.path, sha256: descriptor.sha256 };
  const captureMethod = componentFromSpec(fixture.environment.capture_method, 'capture-method');
  const body = {
    evidence_version: '2.0',
    fixture: { id: fixture.fixture_id, version: fixture.fixture_version, sha256: sha256Json(fixture) },
    task: identityFromSpec(fixture.task, 'fixture.task'),
    route: routeIdentity(fixture, raw.route_role),
    environment: environmentFromFixture(fixture),
    repetition: {
      index: raw.repetition_index,
      planned_count: fixture.execution.planned_repetitions_per_route,
      seed: raw.seed,
      ordering_index: raw.ordering_index,
      ordering_identity: {
        id: `${fixture.execution.ordering_policy}/${String(raw.ordering_index).padStart(3, '0')}`,
        version: '1.0.0',
        sha256: sha256Json({
          policy: fixture.execution.ordering_policy,
          seed: raw.seed,
          route_role: raw.route_role,
          repetition_index: raw.repetition_index,
          ordering_index: raw.ordering_index,
        }),
      },
      started_at: raw.started_at,
      completed_at: raw.completed_at,
    },
    evidence_class: fixture.evidence_class,
    capture: {
      method: captureMethod,
      captured_at: raw.completed_at,
      raw_evidence: rawLink,
      hash_method: HASH_METHOD,
    },
    intervention_count: raw.intervention_count,
    metrics: raw.metrics.map((metric) => metric.availability === 'available' ? {
      ...metric,
      source_links: [rawLink],
    } : { ...metric }),
    outcome: {
      required_outcome: raw.outcome.required_outcome,
      passed: raw.outcome.passed,
      evaluator: identityFromSpec(fixture.required_outcome.evaluator, 'fixture.required_outcome.evaluator'),
    },
    verification: {
      procedure: identityFromSpec(fixture.verification.procedure, 'fixture.verification.procedure'),
      passed: raw.verification.passed,
      evaluator: identityFromSpec(fixture.verification.evaluator, 'fixture.verification.evaluator'),
    },
    evidence_links: [rawLink],
    sanitization: { status: 'passed', manifest: manifestLink, withheld_fields: [] },
  };
  const record = attachEvidenceIdentity(body, fixture, raw);
  verifyEvidenceIdentity(record);
  return record;
}

function round(value) {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function statisticState(status, valueOrReason) {
  return status === 'available'
    ? { status, value: round(valueOrReason) }
    : { status, reason: valueOrReason };
}

function summarizeMetric(records, contract, role) {
  const observations = contract.name === 'intervention_count'
    ? records.map(({ intervention_count }) => ({ availability: 'available', value: intervention_count, provenance: 'fixture_authored' }))
    : records.map((record) => record.metrics.find(({ name }) => name === contract.name));
  const available = observations.filter(({ availability }) => availability === 'available');
  const base = { route_role: role, metric: contract.name, unit: contract.unit, count: available.length, provenance: contract.provenance };
  const names = ['minimum', 'maximum', 'median', 'mean', 'standard_deviation', 'coefficient_of_variation'];
  if (available.length !== observations.length) {
    const status = available.length === 0 && observations.every(({ availability }) => availability === 'unavailable') ? 'unavailable' : 'not_comparable';
    const reason = status === 'unavailable'
      ? observations[0]?.unavailable_reason ?? 'metric unavailable for every repetition'
      : 'not every repetition contains a comparable observation';
    return { ...base, availability: status, ...Object.fromEntries(names.map((name) => [name, statisticState(status, reason)])), unavailable_reason: reason };
  }
  const values = available.map(({ value }) => value).sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
  const standardDeviation = Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length);
  return {
    ...base,
    availability: 'available',
    minimum: statisticState('available', values[0]),
    maximum: statisticState('available', values.at(-1)),
    median: statisticState('available', median),
    mean: statisticState('available', mean),
    standard_deviation: statisticState('available', standardDeviation),
    coefficient_of_variation: mean === 0
      ? statisticState('not_comparable', 'coefficient of variation is undefined when the mean is zero')
      : statisticState('available', standardDeviation / Math.abs(mean)),
  };
}

function statisticMean(statistics, role, metric) {
  const statistic = statistics.find((entry) => entry.route_role === role && entry.metric === metric);
  return statistic?.mean?.status === 'available' ? statistic.mean.value : null;
}

function budgetPassed(direction, baseline, optimized, threshold) {
  if (baseline === null || optimized === null) return false;
  if (direction === 'must_not_increase') return optimized <= baseline + threshold;
  if (direction === 'must_not_decrease') return optimized >= baseline - threshold;
  return Math.abs(optimized - baseline) <= threshold;
}

function aggregateRoute(records, paths) {
  const first = records[0];
  return {
    route: first.route,
    environment: first.environment,
    capture_method: first.capture.method,
    intervention_count: records.reduce((sum, record) => sum + record.intervention_count, 0),
    evidence: records.map((record) => ({ uri: paths.get(record), sha256: sha256Json(record) })),
  };
}

function environmentComparable(records) {
  const first = records[0];
  return records.every((record) =>
    isDeepStrictEqual(record.fixture, first.fixture) &&
    isDeepStrictEqual(record.task, first.task) &&
    isDeepStrictEqual(record.environment, first.environment) &&
    isDeepStrictEqual(record.capture.method, first.capture.method) &&
    isDeepStrictEqual(record.outcome.evaluator, first.outcome.evaluator) &&
    isDeepStrictEqual(record.verification.procedure, first.verification.procedure) &&
    isDeepStrictEqual(record.verification.evaluator, first.verification.evaluator));
}

function attachRecordIdentity(record, fixture) {
  const identity = {
    id: `${fixture.fixture_id}/aggregate`,
    version: fixture.fixture_version,
  };
  return {
    record_id: { ...identity, sha256: sha256Json({ record_id: identity, ...record }) },
    ...record,
  };
}

export function verifyAggregateIdentity(record) {
  assertObject(record, 'aggregate record');
  assertIdentity(record.record_id, 'aggregate.record_id');
  const basis = clone(record);
  basis.record_id = { id: record.record_id.id, version: record.record_id.version };
  const actual = sha256Json(basis);
  if (actual !== record.record_id.sha256) throw new Error(`aggregate identity SHA-256 mismatch: expected ${record.record_id.sha256}, got ${actual}`);
  assertPublishableEvidence(record, 'generated aggregate record');
  return true;
}

export function collectBenchmarkV2({ fixture, rawRepetitions }) {
  validateFixture(fixture);
  if (!Array.isArray(rawRepetitions) || rawRepetitions.length !== fixture.raw_repetitions.length) throw new TypeError('rawRepetitions must match fixture.raw_repetitions');
  const manifest = makeSanitizationManifest(fixture, rawRepetitions.length);
  assertPublishableEvidence(manifest, 'sanitization manifest');
  const manifestLink = { uri: fixture.outputs.sanitization_manifest, sha256: sha256Json(manifest) };
  const records = [];
  const recordPaths = new Map();

  for (const descriptor of fixture.raw_repetitions) {
    const source = rawRepetitions.find(({ path }) => path === descriptor.path);
    if (!source) throw new TypeError(`raw repetition is missing: ${descriptor.path}`);
    if (source.sha256 !== descriptor.sha256) throw new Error(`raw repetition descriptor SHA-256 mismatch for ${descriptor.path}`);
    const actualSha = sha256Json(source.value);
    if (actualSha !== descriptor.sha256) throw new Error(`raw evidence SHA-256 mismatch for ${descriptor.path}: expected ${descriptor.sha256}, got ${actualSha}`);
    const raw = validateRawRepetition(source.value, fixture, descriptor, `raw repetition ${descriptor.path}`);
    const record = makeEvidenceRecord({ fixture, raw, descriptor, manifestLink });
    records.push(record);
    recordPaths.set(record, evidencePath(fixture, raw));
  }

  const ordering = [...records].sort((left, right) => left.repetition.ordering_index - right.repetition.ordering_index);
  if (ordering.some((record, index) => record.repetition.ordering_index !== index + 1)) throw new TypeError('raw repetitions do not form a deterministic contiguous ordering');
  const byRole = Object.fromEntries(ROUTE_ROLES.map((role) => [role, records.filter((record) => record.route.id === fixture.routes.find((route) => route.route_role === role).id)]));
  for (const role of ROUTE_ROLES) {
    if (byRole[role].length < 5 || byRole[role].some(({ outcome, verification }) => !outcome.passed || !verification.passed)) throw new TypeError(`${role} requires at least five successful repetitions`);
  }

  const interventionContract = { name: 'intervention_count', unit: 'count', provenance: 'fixture_authored' };
  const statistics = ROUTE_ROLES.flatMap((role) => [
    ...fixture.metric_contracts.map((contract) => summarizeMetric(byRole[role], contract, role)),
    summarizeMetric(byRole[role], interventionContract, role),
  ]);
  const regressionBudgets = fixture.regression_budgets.map((budget) => ({
    ...budget,
    baseline_reference: { uri: recordPaths.get(byRole.baseline[0]), sha256: sha256Json(byRole.baseline[0]) },
    passed: budgetPassed(
      budget.direction,
      statisticMean(statistics, 'baseline', budget.metric),
      statisticMean(statistics, 'optimized', budget.metric),
      budget.threshold,
    ),
  }));
  const completedPerRoute = Object.fromEntries(ROUTE_ROLES.map((role) => [role, byRole[role].length]));
  const outcome = records.every((record) => record.outcome.passed);
  const verification = records.every((record) => record.verification.passed);
  const comparability = environmentComparable(records);
  const regression = regressionBudgets.every(({ passed }) => passed);
  const sanitization = records.every((record) => record.sanitization.status === 'passed') && manifest.status === 'passed';
  const publicationEligibility = outcome && verification && comparability && regression && sanitization && ROUTE_ROLES.every((role) => completedPerRoute[role] >= 5);
  const providerMetricAvailable = records.every((record) =>
    record.evidence_class === 'provider_native' &&
    record.environment.provider.status !== 'unavailable' &&
    record.environment.model.status !== 'unavailable' &&
    record.metrics.some((metric) => metric.name === 'provider_input_tokens' && metric.availability === 'available' && metric.provenance === 'provider_observed'));
  const runtimeMetricAvailable = records.every((record) =>
    ['runtime_telemetry', 'provider_native'].includes(record.evidence_class) &&
    record.metrics.some((metric) => metric.name === 'runtime_elapsed_ms' && metric.availability === 'available' && metric.provenance === 'runtime_observed'));
  const body = {
    record_version: '2.0',
    fixture: records[0].fixture,
    task: records[0].task,
    evidence_class: fixture.evidence_class,
    baseline: aggregateRoute(byRole.baseline, recordPaths),
    optimized: aggregateRoute(byRole.optimized, recordPaths),
    repetitions: {
      planned_per_route: fixture.execution.planned_repetitions_per_route,
      completed_per_route: completedPerRoute,
      classification: ROUTE_ROLES.every((role) => completedPerRoute[role] >= 5) ? 'publishable' : 'exploratory',
      ordering_identity: {
        id: fixture.execution.ordering_policy,
        version: '1.0.0',
        sha256: sha256Json({ policy: fixture.execution.ordering_policy, seed: fixture.execution.seed, order: ordering.map(({ evidence_id }) => evidence_id.id) }),
      },
    },
    statistics,
    regression_budgets: regressionBudgets,
    gates: { outcome, verification, comparability, regression, sanitization, publication_eligibility: publicationEligibility },
    claim_boundary: {
      fixture_result: publicationEligibility ? 'eligible' : 'withheld',
      runtime_telemetry: runtimeMetricAvailable && publicationEligibility ? 'eligible' : 'withheld',
      provider_token_saving: providerMetricAvailable && publicationEligibility ? 'eligible' : 'withheld',
      reasons: [
        ...(!runtimeMetricAvailable ? ['runtime telemetry is unavailable and is not inferred'] : []),
        ...(!providerMetricAvailable ? ['provider-native token telemetry is unavailable and is not zero or estimated'] : []),
        ...(fixture.evidence_class === 'fixture_only' ? ['fixture-authored measurements permit only a fixture-scoped result'] : []),
      ],
    },
  };
  const aggregateRecord = attachRecordIdentity(body, fixture);
  verifyAggregateIdentity(aggregateRecord);

  const artifacts = [
    { path: fixture.outputs.sanitization_manifest, value: manifest, kind: 'sanitization_manifest' },
    ...records.map((record) => ({ path: recordPaths.get(record), value: record, kind: 'evidence' })),
    { path: fixture.outputs.aggregate_record, value: aggregateRecord, kind: 'aggregate_record' },
  ];
  return { fixture, manifest, evidenceRecords: records, aggregateRecord, artifacts };
}

export async function buildBenchmarkV2(fixturePath, { root = process.cwd() } = {}) {
  assertRelativePath(fixturePath, 'fixture path');
  const fixture = JSON.parse(await readFile(resolveInside(root, fixturePath), 'utf8'));
  const rawRepetitions = [];
  for (const descriptor of fixture.raw_repetitions ?? []) {
    const value = JSON.parse(await readFile(resolveInside(root, descriptor.path), 'utf8'));
    rawRepetitions.push({ path: descriptor.path, sha256: descriptor.sha256, value });
  }
  return collectBenchmarkV2({ fixture, rawRepetitions });
}

export function benchmarkV2ContentMatches(existing, generated) {
  return isDeepStrictEqual(JSON.parse(existing), generated);
}
