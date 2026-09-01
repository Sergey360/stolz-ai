import assert from 'node:assert/strict';
import { access, cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildBenchmarkReport, evaluateEvidencePair, renderBenchmarkMarkdown, reportContentMatches } from '../tools/benchmark.mjs';

const suitePath = 'benchmarks/suites/context-selection-v1.json';

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function benchmarkInputs() {
  const fixture = await json('benchmarks/fixtures/context-selection/v1.0.0.json');
  const baselineRoute = await json('benchmarks/routes/context-selection-v1/baseline.json');
  const optimizedRoute = await json('benchmarks/routes/context-selection-v1/optimized.json');
  const baselineEvidence = await json(baselineRoute.evidence.path);
  const optimizedEvidence = await json(optimizedRoute.evidence.path);
  const provenance = {
    baseline_evidence: { path: baselineRoute.evidence.path },
    optimized_evidence: { path: optimizedRoute.evidence.path },
  };
  return { benchmarkId: 'negative-gate-test', fixture, baselineRoute, optimizedRoute, baselineEvidence, optimizedEvidence, provenance };
}

test('checked-in benchmark report is reproducible from pinned fixtures, routes, and raw evidence', async () => {
  const generated = await buildBenchmarkReport(suitePath);
  const checkedIn = await json('benchmarks/reports/context-selection-v1.json');
  assert.deepEqual(generated, checkedIn);
  const markdown = await readFile('benchmarks/reports/context-selection-v1.md', 'utf8');
  assert.equal(reportContentMatches(markdown, renderBenchmarkMarkdown(generated), 'markdown'), true);
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) await access(resolve('benchmarks/reports', match[1]));
  assert.deepEqual(generated.decision, {
    accepted: true,
    token_delta: -550,
    token_saving: true,
    claim_status: 'fixture_only',
    reason: 'quality_gates_passed',
    saved_tokens: 550,
    saving_percent: 35.95,
  });
  assert.deepEqual(generated.record.baseline, {
    tokens: 1530,
    token_source: 'synthetic-fixture-token-units-v1',
    model_wakeups: 4,
    tool_calls: 8,
    wall_time_ms: 195,
    interventions: 0,
    outcome: 'validated-context-plan-v1',
    verification: true,
    evidence: ['benchmarks/raw/context-selection-v1/baseline.json'],
  });

});

test('report checks accept CRLF checkout conversion but reject semantic changes', async () => {
  const generated = await buildBenchmarkReport(suitePath);
  const jsonReport = `${JSON.stringify(generated, null, 2)}\n`;
  const markdownReport = renderBenchmarkMarkdown(generated);
  assert.equal(reportContentMatches(jsonReport.replace(/\n/g, '\r\n'), jsonReport, 'json'), true);
  assert.equal(reportContentMatches(markdownReport.replace(/\n/g, '\r\n'), markdownReport, 'markdown'), true);
  assert.equal(reportContentMatches(jsonReport.replace('fixture_only', 'withheld'), jsonReport, 'json'), false);
  assert.equal(reportContentMatches(markdownReport.replace('quality_gates_passed', 'withheld'), markdownReport, 'markdown'), false);
});

test('a lower-token route with a weaker outcome is withheld', async () => {
  const inputs = await benchmarkInputs();
  inputs.optimizedEvidence.outcome = 'incomplete-context-plan';
  const report = evaluateEvidencePair(inputs);
  assert.equal(report.record.optimized.tokens < report.record.baseline.tokens, true);
  assert.deepEqual(report.decision, { accepted: false, reason: 'outcome_mismatch', claim_status: 'withheld' });
});

test('a falsely accepted label cannot hide a weaker result', async () => {
  const inputs = await benchmarkInputs();
  inputs.optimizedEvidence.result.selected_artifact_ids = ['task-brief'];
  const report = evaluateEvidencePair(inputs);
  assert.equal(report.record, null);
  assert.equal(report.decision.claim_status, 'withheld');
  assert.ok(report.decision.errors.includes('optimized outcome result does not match the fixture expectation'));
});

test('a lower-token route with failed verification is withheld', async () => {
  const inputs = await benchmarkInputs();
  inputs.optimizedEvidence.verification.passed = false;
  const report = evaluateEvidencePair(inputs);
  assert.equal(report.record.optimized.tokens < report.record.baseline.tokens, true);
  assert.deepEqual(report.decision, { accepted: false, reason: 'verification_failed', claim_status: 'withheld' });
});

test('missing measurements withhold a claim instead of manufacturing a number', async () => {
  const inputs = await benchmarkInputs();
  delete inputs.optimizedEvidence.events[0].tokens;
  const report = evaluateEvidencePair(inputs);
  assert.equal(report.record, null);
  assert.equal(report.decision.accepted, false);
  assert.equal(report.decision.claim_status, 'withheld');
  assert.equal(report.decision.reason, 'missing_or_invalid_measurement');
  assert.ok(report.decision.errors.some((message) => message.includes('optimized event 0.tokens')));
});

test('pinned SHA identities reject changed raw evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stolz-benchmark-'));
  await cp('benchmarks', join(root, 'benchmarks'), { recursive: true });
  const rawPath = join(root, 'benchmarks/raw/context-selection-v1/optimized.json');
  const changed = await json(rawPath);
  changed.events[0].tokens -= 1;
  await writeFile(rawPath, `${JSON.stringify(changed, null, 2)}\n`);
  await assert.rejects(buildBenchmarkReport(suitePath, { root }), /optimized evidence SHA-256 mismatch/);
});
