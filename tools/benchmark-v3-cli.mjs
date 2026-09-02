#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildBenchmarkV3Report,
  buildFixtureOnlyBenchmarkV3Report,
} from './benchmark-v3-admission.mjs';
import {
  assertBenchmarkV3Record,
  computeBenchmarkV3Identity,
} from './benchmark-v3-validator.mjs';

const CLI_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = dirname(dirname(CLI_PATH));
const SCENARIOS = new Set(['reads-navigation', 'build-check-invalidation', 'quiet-wait-transition']);
const SAFE_RELATIVE_PATH = /^[A-Za-z0-9][A-Za-z0-9./_-]*$/;

async function parseJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function repositoryRelative(path, label) {
  const normalized = relative(REPOSITORY_ROOT, resolve(path)).replaceAll('\\', '/');
  if (!SAFE_RELATIVE_PATH.test(normalized) || normalized.startsWith('../')) {
    throw new TypeError(`${label} must be a repository-relative safe path`);
  }
  return normalized;
}

function parseArguments(argv) {
  const options = { check: false };
  const valued = new Set(['--scenario', '--reproduce', '--report', '--verify-report', '--attempts', '--output']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (valued.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new TypeError(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new TypeError(`unknown benchmark-v3 argument: ${argument}`);
    }
  }
  const reproduceMode = options.scenario !== undefined || options.reproduce !== undefined;
  const reportMode = options.report !== undefined;
  const verifyMode = options['verify-report'] !== undefined;
  if (Number(reproduceMode) + Number(reportMode) + Number(verifyMode) !== 1) {
    throw new TypeError('choose exactly one of --scenario/--reproduce, --report, or --verify-report');
  }
  if (reproduceMode && (!SCENARIOS.has(options.scenario) || !options.reproduce)) {
    throw new TypeError('--scenario requires an approved family and --reproduce manifest');
  }
  if (reportMode && !options.output) throw new TypeError('--report requires --output');
  if (options.attempts && !reportMode) throw new TypeError('--attempts is legal only with --report');
  if (verifyMode && (options.scenario || options.reproduce || options.report || options.attempts || options.output)) {
    throw new TypeError('--verify-report accepts only a report path and optional --check');
  }
  return options;
}

async function writeJson(path, value) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function runPilotManifest(manifestPath, options) {
  const pilot = await import('../benchmarks/v3/pilot-runner.mjs');
  return pilot.runPilotManifest(manifestPath, options);
}

function identityRecords(value, records = []) {
  if (Array.isArray(value)) {
    for (const item of value) identityRecords(item, records);
  } else if (value && typeof value === 'object') {
    if (value.schema_id && value.schema_version && value.captured_at && value.canonical_sha256) records.push(value);
    for (const nested of Object.values(value)) identityRecords(nested, records);
  }
  return records;
}

async function verifyReport(options) {
  const reportPath = repositoryRelative(options['verify-report'], 'report path');
  const existing = await parseJson(resolve(REPOSITORY_ROOT, reportPath));
  if (existing.schema_id !== 'benchmark-report' || existing.schema_version !== '3.0.0') {
    throw new Error('benchmark_v3_cli_report_schema_mismatch');
  }
  const records = identityRecords(existing);
  if (records.length === 0 || records.some((record) => record.canonical_sha256 !== computeBenchmarkV3Identity(record))) {
    throw new Error('benchmark_v3_cli_report_identity_mismatch');
  }
  if (!existing.scope?.scenario_id || !existing.admission?.admission || !existing.claim?.disposition) {
    throw new Error('benchmark_v3_cli_report_boundary_missing');
  }
  const summary = {
    ok: true,
    mode: 'verify-report',
    scenario_id: existing.scope.scenario_id,
    track: existing.track,
    identity_records: records.length,
    admission: existing.admission.admission,
    public_claim: existing.claim.disposition,
  };
  return options.check ? summary : { ...summary, report: existing };
}

async function reproduce(options) {
  const manifestPath = repositoryRelative(options.reproduce, 'manifest path');
  const manifest = await parseJson(resolve(REPOSITORY_ROOT, manifestPath));
  if (manifest.scenario_id !== options.scenario) throw new Error('benchmark_v3_cli_scenario_manifest_mismatch');
  const run = await runPilotManifest(manifestPath, { repositoryRoot: REPOSITORY_ROOT });
  if (options.output) await writeJson(options.output, run);
  return options.check ? {
    ok: run.summary.excluded_pairs === 0,
    mode: 'reproduce',
    scenario_id: run.scenario_id,
    evidence_class: run.evidence_class,
    planned_pairs: run.summary.planned_pairs,
    included_fixture_pairs: run.summary.included_fixture_pairs,
    excluded_pairs: run.summary.excluded_pairs,
    provider_savings: run.claim_boundary.provider_savings,
  } : run;
}

async function report(options) {
  const manifestPath = repositoryRelative(options.report, 'manifest path');
  const outputPath = repositoryRelative(options.output, 'output path');
  const manifest = await parseJson(resolve(REPOSITORY_ROOT, manifestPath));
  let generated;
  let inputClass;
  if (options.attempts) {
    const input = await parseJson(resolve(options.attempts));
    const attempts = Array.isArray(input) ? input : input.attempts;
    generated = await buildBenchmarkV3Report({ manifest, attempts, manifestPath, outputPath });
    inputClass = generated.track;
  } else {
    const pilotRun = await runPilotManifest(manifestPath, { repositoryRoot: REPOSITORY_ROOT });
    generated = await buildFixtureOnlyBenchmarkV3Report({ manifest, pilotRun, manifestPath, outputPath });
    inputClass = 'fixture_only';
  }
  await assertBenchmarkV3Record(generated);
  await writeJson(resolve(REPOSITORY_ROOT, outputPath), generated);
  return options.check ? {
    ok: true,
    mode: 'report',
    scenario_id: generated.scope.scenario_id,
    input_class: inputClass,
    report_sha256: generated.canonical_sha256,
    admission: generated.admission.admission,
    provider_token_delta: generated.metrics.find(({ name }) => name === 'net_token_delta')?.availability ?? 'not_applicable',
    provider_cost_delta: generated.metrics.find(({ name }) => name === 'net_cost_delta')?.availability ?? 'not_applicable',
    public_claim: generated.claim.disposition,
  } : generated;
}

export async function runBenchmarkV3Cli(argv) {
  const options = parseArguments(argv);
  if (options['verify-report']) return verifyReport(options);
  return options.report ? report(options) : reproduce(options);
}

if (process.argv[1] && resolve(process.argv[1]) === CLI_PATH) {
  try {
    const result = await runBenchmarkV3Cli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, result.mode ? 0 : 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, admission: 'rejected', error: error.message })}\n`);
    process.exitCode = 1;
  }
}
