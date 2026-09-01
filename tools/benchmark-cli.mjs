#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildBenchmarkReport, renderBenchmarkMarkdown, reportContentMatches } from './benchmark.mjs';

function parseArgs(argv) {
  const options = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (['--suite', '--json', '--markdown'].includes(argument)) options[argument.slice(2)] = argv[++index];
    else throw new TypeError(`unknown argument: ${argument}`);
  }
  for (const key of ['suite', 'json', 'markdown']) if (!options[key]) throw new TypeError(`--${key} is required`);
  return options;
}

async function writeOrCheck(path, content, check, format) {
  const target = resolve(path);
  if (check) {
    const existing = await readFile(target, 'utf8');
    if (!reportContentMatches(existing, content, format)) throw new Error(`${path} is stale; run npm run benchmark`);
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

try {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildBenchmarkReport(options.suite);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderBenchmarkMarkdown(report);
  await writeOrCheck(options.json, json, options.check, 'json');
  await writeOrCheck(options.markdown, markdown, options.check, 'markdown');
  process.stdout.write(`${JSON.stringify({ ok: report.decision.accepted, claim_status: report.decision.claim_status, benchmark_id: report.benchmark_id, report: options.json, raw_evidence: [report.provenance.baseline_evidence.path, report.provenance.optimized_evidence.path] })}\n`);
  if (!report.decision.accepted || report.decision.claim_status === 'withheld') process.exitCode = 1;
} catch (caught) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: caught.message })}\n`);
  process.exitCode = 1;
}
