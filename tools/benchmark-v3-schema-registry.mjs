import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const BENCHMARK_V3_SCHEMA_BASE = 'https://stolz-ai.dev/contracts/benchmark-v3/';

const definitions = [
  ['common', '1.0.0', 'common.schema.json', false],
  ['evidence-provenance', '1.0.0', 'evidence-provenance.schema.json', true],
  ['evidence-provenance', '1.1.0', 'evidence-provenance-codex.schema.json', true],
  ['responses-usage', '1.0.0', 'responses-usage.schema.json', true],
  ['codex-jsonl-usage', '1.0.0', 'codex-jsonl-usage.schema.json', true],
  ['runtime-measurement', '1.0.0', 'runtime-measurement.schema.json', true],
  ['pricing-identity', '1.0.0', 'pricing-identity.schema.json', true],
  ['benchmark-attempt', '3.0.0', 'attempt.schema.json', true],
  ['benchmark-pair', '1.0.0', 'pair.schema.json', true],
  ['pilot-manifest', '1.0.0', 'pilot-manifest.schema.json', true],
  ['report-admission', '1.0.0', 'report-admission.schema.json', true],
  ['benchmark-report', '3.0.0', 'report.schema.json', true],
];

export const BENCHMARK_V3_SCHEMA_REGISTRY = Object.freeze(Object.fromEntries(definitions.map(([schemaId, schemaVersion, filename, record]) => [
  `${schemaId}@${schemaVersion}`,
  Object.freeze({
    schema_id: schemaId,
    schema_version: schemaVersion,
    filename,
    record,
    uri: `${BENCHMARK_V3_SCHEMA_BASE}${filename}`,
  }),
])));

export const BENCHMARK_V3_RECORD_KEYS = Object.freeze(definitions
  .filter(([, , , record]) => record)
  .map(([schemaId, schemaVersion]) => `${schemaId}@${schemaVersion}`));

export function resolveBenchmarkV3Schema(schemaId, schemaVersion) {
  return BENCHMARK_V3_SCHEMA_REGISTRY[`${schemaId}@${schemaVersion}`] ?? null;
}

export async function loadBenchmarkV3Schemas() {
  return Promise.all(Object.values(BENCHMARK_V3_SCHEMA_REGISTRY).map(async (entry) => {
    const path = fileURLToPath(new URL(`../contracts/benchmark-v3/${entry.filename}`, import.meta.url));
    const schema = JSON.parse(await readFile(path, 'utf8'));
    if (schema.$id !== entry.uri) throw new Error(`benchmark_v3_registry_uri_mismatch:${entry.filename}`);
    return { ...entry, path, schema };
  }));
}
