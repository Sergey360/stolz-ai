#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { benchmarkV2ContentMatches, buildBenchmarkV2, sha256Json } from './benchmark-v2.mjs';

function parseArgs(argv) {
  const options = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--fixture') options.fixture = argv[++index];
    else throw new TypeError(`unknown argument: ${argument}`);
  }
  if (!options.fixture) throw new TypeError('--fixture is required');
  return options;
}

async function writeOrCheck(path, value, check) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const target = resolve(path);
  if (check) {
    const existing = await readFile(target, 'utf8');
    if (!benchmarkV2ContentMatches(existing, value)) throw new Error(`${path} is stale; run npm run benchmark:v2`);
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = await buildBenchmarkV2(options.fixture);
  for (const artifact of result.artifacts) await writeOrCheck(artifact.path, artifact.value, options.check);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    fixture: `${result.fixture.fixture_id}@${result.fixture.fixture_version}`,
    evidence_class: result.fixture.evidence_class,
    evidence_records: result.evidenceRecords.length,
    aggregate_record: result.fixture.outputs.aggregate_record,
    aggregate_sha256: sha256Json(result.aggregateRecord),
    provider_token_saving: result.aggregateRecord.claim_boundary.provider_token_saving,
  })}\n`);
} catch (caught) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: caught.message })}\n`);
  process.exitCode = 1;
}
