import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { evaluateBenchmark } from './foundation.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const METRICS = ['tokens', 'model_wakeups', 'tool_calls', 'wall_time_ms', 'interventions'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function reportContentMatches(existing, generated, format) {
  if (format === 'json') return isDeepStrictEqual(JSON.parse(existing), JSON.parse(generated));
  if (format === 'markdown') return existing.replace(/\r\n?/g, '\n') === generated.replace(/\r\n?/g, '\n');
  throw new TypeError(`unsupported benchmark report format: ${format}`);
}

function resolveInside(root, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path)) throw new TypeError('benchmark paths must be non-empty repository-relative strings');
  const target = resolve(root, path);
  const fromRoot = relative(resolve(root), target);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new TypeError(`benchmark path escapes repository root: ${path}`);
  return target;
}

async function readPinnedJson(root, descriptor, label) {
  if (!isObject(descriptor) || typeof descriptor.path !== 'string' || !SHA256.test(descriptor.sha256 ?? '')) throw new TypeError(`${label} must declare path and lowercase SHA-256`);
  const content = await readFile(resolveInside(root, descriptor.path), 'utf8');
  const value = JSON.parse(content);
  const actualSha256 = sha256(JSON.stringify(value));
  if (actualSha256 !== descriptor.sha256) throw new Error(`${label} SHA-256 mismatch for ${descriptor.path}: expected ${descriptor.sha256}, got ${actualSha256}`);
  return { path: descriptor.path, sha256: actualSha256, value };
}

function validateFixture(fixture) {
  const errors = [];
  if (!isObject(fixture) || fixture.schema !== 'stolz.benchmark-fixture.v1') errors.push('fixture.schema must be stolz.benchmark-fixture.v1');
  for (const field of ['fixture_id', 'fixture_version', 'required_outcome']) if (typeof fixture?.[field] !== 'string' || !fixture[field]) errors.push(`fixture.${field} is required`);
  if (fixture?.required_verification !== true) errors.push('fixture.required_verification must be true');
  if (!isObject(fixture?.expected_result)) errors.push('fixture.expected_result is required');
  if (!Array.isArray(fixture?.verification_checks) || fixture.verification_checks.length === 0 || fixture.verification_checks.some((check) => typeof check !== 'string' || !check)) errors.push('fixture.verification_checks must contain non-empty check IDs');
  if (!isObject(fixture?.measurement) || typeof fixture.measurement.token_source !== 'string' || !fixture.measurement.token_source) errors.push('fixture.measurement.token_source is required');
  if (typeof fixture?.claim_scope !== 'string' || !fixture.claim_scope) errors.push('fixture.claim_scope is required');
  return errors;
}

function validateRoute(route, fixture, role) {
  const errors = [];
  if (!isObject(route) || route.schema !== 'stolz.benchmark-route.v1') errors.push(`${role}.schema must be stolz.benchmark-route.v1`);
  if (typeof route?.route_id !== 'string' || !route.route_id) errors.push(`${role}.route_id is required`);
  if (route?.fixture_id !== fixture?.fixture_id || route?.fixture_version !== fixture?.fixture_version) errors.push(`${role} fixture identity does not match the suite fixture`);
  if (!isObject(route?.evidence) || typeof route.evidence.path !== 'string' || !SHA256.test(route.evidence.sha256 ?? '')) errors.push(`${role}.evidence must declare path and SHA-256`);
  return errors;
}

function captureMeasurement(evidence, fixture, route, evidencePath, role) {
  const errors = [];
  if (!isObject(evidence) || evidence.schema !== 'stolz.benchmark-evidence.v1') errors.push(`${role} evidence schema is invalid`);
  if (evidence?.fixture_id !== fixture?.fixture_id || evidence?.fixture_version !== fixture?.fixture_version) errors.push(`${role} evidence fixture identity does not match`);
  if (evidence?.route_id !== route?.route_id) errors.push(`${role} evidence route identity does not match`);
  if (!isObject(evidence?.collector) || evidence.collector.token_source !== fixture?.measurement?.token_source) errors.push(`${role} token source does not match the fixture`);
  if (!Array.isArray(evidence?.events) || evidence.events.length === 0) errors.push(`${role} evidence events are required`);
  if (typeof evidence?.outcome !== 'string' || !evidence.outcome) errors.push(`${role} outcome is required`);
  if (!isDeepStrictEqual(evidence?.result, fixture?.expected_result)) errors.push(`${role} outcome result does not match the fixture expectation`);
  if (!isObject(evidence?.verification) || typeof evidence.verification.passed !== 'boolean' || !Array.isArray(evidence.verification.checks) || evidence.verification.checks.length === 0) errors.push(`${role} verification result and checks are required`);
  else for (const check of fixture?.verification_checks ?? []) if (!evidence.verification.checks.includes(check)) errors.push(`${role} verification is missing required check: ${check}`);

  const totals = Object.fromEntries(METRICS.map((metric) => [metric, 0]));
  if (Array.isArray(evidence?.events)) evidence.events.forEach((event, index) => {
    if (!isObject(event)) {
      errors.push(`${role} event ${index} must be an object`);
      return;
    }
    if (!Number.isInteger(event.sequence) || event.sequence !== index + 1) errors.push(`${role} event ${index} has a non-contiguous sequence`);
    if (typeof event.event !== 'string' || !event.event) errors.push(`${role} event ${index} name is required`);
    for (const metric of METRICS) {
      if (!Number.isInteger(event[metric]) || event[metric] < 0) errors.push(`${role} event ${index}.${metric} must be a non-negative integer`);
      else totals[metric] += event[metric];
    }
  });

  if (errors.length) return { errors };
  return {
    errors,
    measurement: {
      tokens: totals.tokens,
      token_source: evidence.collector.token_source,
      model_wakeups: totals.model_wakeups,
      tool_calls: totals.tool_calls,
      wall_time_ms: totals.wall_time_ms,
      interventions: totals.interventions,
      outcome: evidence.outcome,
      verification: evidence.verification.passed,
      evidence: [evidencePath],
    },
  };
}

function decisionFor(record, errors = []) {
  if (errors.length) return { accepted: false, claim_status: 'withheld', reason: 'missing_or_invalid_measurement', errors };
  const gate = evaluateBenchmark(record);
  if (!gate.accepted) return { ...gate, claim_status: 'withheld' };
  if (!gate.token_saving) return { ...gate, claim_status: 'withheld', reason: 'no_token_saving' };
  const savedTokens = record.baseline.tokens - record.optimized.tokens;
  return {
    ...gate,
    claim_status: 'fixture_only',
    reason: 'quality_gates_passed',
    saved_tokens: savedTokens,
    saving_percent: Number(((savedTokens / record.baseline.tokens) * 100).toFixed(2)),
  };
}

export function evaluateEvidencePair({ benchmarkId, fixture, baselineRoute, optimizedRoute, baselineEvidence, optimizedEvidence, provenance }) {
  const errors = [
    ...validateFixture(fixture),
    ...validateRoute(baselineRoute, fixture, 'baseline_route'),
    ...validateRoute(optimizedRoute, fixture, 'optimized_route'),
  ];
  if (baselineRoute?.route_id && baselineRoute.route_id === optimizedRoute?.route_id) errors.push('baseline and optimized route IDs must differ');
  const baselineCapture = captureMeasurement(baselineEvidence, fixture, baselineRoute, provenance?.baseline_evidence?.path ?? baselineRoute?.evidence?.path, 'baseline');
  const optimizedCapture = captureMeasurement(optimizedEvidence, fixture, optimizedRoute, provenance?.optimized_evidence?.path ?? optimizedRoute?.evidence?.path, 'optimized');
  errors.push(...baselineCapture.errors, ...optimizedCapture.errors);

  const record = errors.length ? null : {
    fixture_id: fixture.fixture_id,
    fixture_version: fixture.fixture_version,
    required_outcome: fixture.required_outcome,
    baseline_route: baselineRoute.route_id,
    optimized_route: optimizedRoute.route_id,
    baseline: baselineCapture.measurement,
    optimized: optimizedCapture.measurement,
  };
  const decision = decisionFor(record, errors);
  return {
    schema: 'stolz.benchmark-report.v1',
    benchmark_id: benchmarkId,
    fixture: {
      id: fixture?.fixture_id ?? null,
      version: fixture?.fixture_version ?? null,
      claim_scope: fixture?.claim_scope ?? null,
      limitations: fixture?.limitations ?? [],
    },
    provenance,
    record,
    decision,
  };
}

export async function buildBenchmarkReport(suitePath, { root = process.cwd() } = {}) {
  const suiteContent = await readFile(resolveInside(root, suitePath), 'utf8');
  const suite = JSON.parse(suiteContent);
  if (!isObject(suite) || suite.schema !== 'stolz.benchmark-suite.v1' || typeof suite.benchmark_id !== 'string' || !suite.benchmark_id) throw new TypeError('benchmark suite schema and benchmark_id are required');

  const fixture = await readPinnedJson(root, suite.fixture, 'fixture');
  const baselineRoute = await readPinnedJson(root, suite.baseline_route, 'baseline route');
  const optimizedRoute = await readPinnedJson(root, suite.optimized_route, 'optimized route');
  const baselineEvidence = await readPinnedJson(root, baselineRoute.value.evidence, 'baseline evidence');
  const optimizedEvidence = await readPinnedJson(root, optimizedRoute.value.evidence, 'optimized evidence');
  const provenance = {
    suite: { path: suitePath, sha256: sha256(JSON.stringify(suite)) },
    fixture: { path: fixture.path, sha256: fixture.sha256 },
    baseline_route: { path: baselineRoute.path, sha256: baselineRoute.sha256 },
    optimized_route: { path: optimizedRoute.path, sha256: optimizedRoute.sha256 },
    baseline_evidence: { path: baselineEvidence.path, sha256: baselineEvidence.sha256 },
    optimized_evidence: { path: optimizedEvidence.path, sha256: optimizedEvidence.sha256 },
  };
  return evaluateEvidencePair({
    benchmarkId: suite.benchmark_id,
    fixture: fixture.value,
    baselineRoute: baselineRoute.value,
    optimizedRoute: optimizedRoute.value,
    baselineEvidence: baselineEvidence.value,
    optimizedEvidence: optimizedEvidence.value,
    provenance,
  });
}

export function renderBenchmarkMarkdown(report) {
  const { record, decision, fixture, provenance } = report;
  const lines = [
    `# Benchmark report: ${report.benchmark_id}`,
    '',
    `- Fixture: \`${fixture.id}@${fixture.version}\``,
    `- Claim scope: ${fixture.claim_scope}`,
    `- Gate: \`${decision.claim_status}\` (${decision.reason})`,
    '',
  ];
  if (record) {
    lines.push(
      '| Route | Token units | Model wakeups | Tool calls | Wall time (ms) | Interventions | Outcome | Verification |',
      '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
      `| \`${record.baseline_route}\` | ${record.baseline.tokens} | ${record.baseline.model_wakeups} | ${record.baseline.tool_calls} | ${record.baseline.wall_time_ms} | ${record.baseline.interventions} | \`${record.baseline.outcome}\` | ${record.baseline.verification ? 'pass' : 'fail'} |`,
      `| \`${record.optimized_route}\` | ${record.optimized.tokens} | ${record.optimized.model_wakeups} | ${record.optimized.tool_calls} | ${record.optimized.wall_time_ms} | ${record.optimized.interventions} | \`${record.optimized.outcome}\` | ${record.optimized.verification ? 'pass' : 'fail'} |`,
      '',
    );
    if (decision.claim_status === 'fixture_only') lines.push(`The optimized route used ${decision.saved_tokens} fewer synthetic token units on this fixture (${decision.saving_percent}%), using the declared source \`${record.baseline.token_source}\`. Both routes produced the required outcome and passed verification.`, '');
    else lines.push(`No token saving is reportable: ${decision.reason}.`, '');
  }
  lines.push('## Raw evidence', '');
  for (const key of ['suite', 'fixture', 'baseline_route', 'optimized_route', 'baseline_evidence', 'optimized_evidence']) {
    if (provenance?.[key]) lines.push(`- ${key}: [\`${provenance[key].path}\`](../${provenance[key].path.replace(/^benchmarks\//, '')}) — \`${provenance[key].sha256}\``);
  }
  lines.push('', '## Interpretation boundary', '');
  for (const limitation of fixture.limitations) lines.push(`- ${limitation}`);
  lines.push('- A weaker outcome, failed verification, missing metric, or changed pinned SHA withholds the saving claim.');
  return `${lines.join('\n')}\n`;
}
