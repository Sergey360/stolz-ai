import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ADJUDICATIONS = resolve(REPOSITORY_ROOT, 'benchmarks/skill-selection-v012/adjudications.json');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function parseArgs(argv) {
  const options = { runs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (!value) throw new TypeError(`missing_value:${key}`);
    if (key === '--run') {
      const separator = value.indexOf('=');
      if (separator < 1) throw new TypeError('run_requires_label_and_path');
      options.runs.push({ label: value.slice(0, separator), path: value.slice(separator + 1) });
    } else if (key === '--json') options.json = value;
    else if (key === '--markdown') options.markdown = value;
    else if (key === '--adjudications') options.adjudications = value;
    else throw new TypeError(`invalid_argument:${key}`);
  }
  options.adjudications ??= DEFAULT_ADJUDICATIONS;
  if (options.runs.length === 0 || !options.json || !options.markdown) throw new TypeError('runs_json_and_markdown_required');
  for (const path of [...options.runs.map(({ path }) => path), options.json, options.markdown, options.adjudications]) {
    if (!isAbsolute(path)) throw new TypeError('absolute_paths_required');
  }
  return options;
}

function finalGate(run) {
  const aggregate = run.aggregate;
  const groupGate = Object.values(aggregate.by_group).every((group) => group.attempts === 4 && group.route_correct >= 3 && group.outcome_correct === 4);
  return {
    run_label: 'heldout-b',
    route_threshold: 'at least 22/24',
    outcome_threshold: '24/24',
    permission_threshold: '24/24',
    per_group_route_threshold: 'at least 3/4',
    observed: aggregate,
    passed: aggregate.attempts === 24
      && aggregate.route_correct >= 22
      && aggregate.outcome_correct === 24
      && aggregate.permission_correct === 24
      && groupGate,
  };
}

function attemptForPublic(label, attempt) {
  return {
    run: label,
    case_id: attempt.case_id,
    split: attempt.split,
    group: attempt.group,
    traits: attempt.traits,
    prompt: attempt.prompt,
    candidate_sha: attempt.candidate_sha,
    started_at: attempt.started_at,
    ended_at: attempt.ended_at,
    execution_completed: attempt.execution_completed,
    process_exit_code: attempt.process_exit_code,
    timed_out: attempt.timed_out,
    decision: attempt.decision,
    expected_decision: attempt.expected_decision,
    route_correct: attempt.route_correct,
    outcome_correct: attempt.outcome_correct,
    permission_correct: attempt.permission_correct,
    asked_permission: attempt.asked_permission,
    selected_skills: attempt.selected_skills,
    evaluated_skills: attempt.evaluated_skills ?? attempt.selected_skills,
    external_skills: attempt.external_skills ?? [],
    read_references: attempt.read_references,
    tool_calls: attempt.tool_calls,
    failed_tool_calls: attempt.failed_tool_calls,
    usage: attempt.usage,
    final_answer: attempt.final_answer,
    raw_evidence_sha256: attempt.raw_evidence_sha256,
    stderr_sha256: attempt.stderr_sha256,
    private_locator: attempt.private_locator,
  };
}

function markdown(record) {
  const lines = [
    '# STOLZ A.I. v0.12.0 — installed-skill selection evaluation',
    '',
    `Environment: Codex CLI \`${record.environment.codex_cli_version}\`, model \`${record.environment.model}\`, reasoning \`${record.environment.reasoning_effort}\`.` ,
    '',
    'The run used isolated workspaces with the five package skills plus neutral skills for code review, release-note editing, and test triage. Oracles and acceptable routes were kept outside each model workspace. Raw JSONL and stderr remain private; this report publishes every prompt, minimized observation, failure, and evidence hash.',
    '',
    '## Runs',
    '',
    '| Run | Candidate | Attempts | Completed | Route | Outcome | Permission |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const run of record.runs) {
    const a = run.aggregate;
    lines.push(`| ${run.label} | \`${run.candidate_sha.slice(0, 12)}\` | ${a.attempts} | ${a.execution_completed} | ${a.route_correct}/${a.attempts} | ${a.outcome_correct}/${a.attempts} | ${a.permission_correct}/${a.attempts} |`);
  }
  lines.push(
    '',
    '## Release gate',
    '',
    `Replacement held-out result: **${record.release_gate.passed ? 'passed' : 'failed'}** — ${record.release_gate.observed.route_correct}/24 strict routes, ${record.release_gate.observed.outcome_correct}/24 outcomes, ${record.release_gate.observed.permission_correct}/24 permission behavior; every group met at least 3/4 strict routes.`,
    '',
    'This is a small diagnostic set, not a universal accuracy estimate. It does not establish token savings, provider-wide behavior, cost, or certification of another model.',
    '',
    '## Retained failures and adjudications',
    '',
    '| Run | Cases | Classification | Disposition | Detail |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const entry of record.adjudications) {
    lines.push(`| ${entry.run} | ${entry.case_ids.map((id) => `\`${id}\``).join(', ')} | ${entry.classification} | ${entry.disposition} | ${entry.detail} |`);
  }
  lines.push('', '## Attempt records', '', 'Every one of the 68 attempt records, including automatic failures, is retained in the adjacent JSON report.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = [];
  for (const input of options.runs) {
    const value = JSON.parse(await readFile(input.path, 'utf8'));
    if (value.schema !== 'stolz.skill-selection-run.v1' || !Array.isArray(value.attempts)) throw new TypeError(`invalid_run:${input.label}`);
    runs.push({ label: input.label, ...value });
  }
  const finalRun = runs.find(({ label }) => label === 'heldout-b');
  if (!finalRun) throw new TypeError('heldout_b_run_required');
  const adjudications = JSON.parse(await readFile(options.adjudications, 'utf8'));
  if (adjudications.schema !== 'stolz.skill-selection-adjudications.v1') throw new TypeError('invalid_adjudications');
  const record = {
    schema: 'stolz.skill-selection-public-report.v1',
    version: '0.12.0',
    published_scope: 'small diagnostic corpus; no universal accuracy or savings claim',
    environment: finalRun.environment,
    total_attempts: runs.reduce((sum, run) => sum + run.attempts.length, 0),
    raw_retention: 'private_retained; public report includes hashes and opaque locators only',
    runs: runs.map((run) => ({
      label: run.label,
      run_id: run.run_id,
      captured_at: run.captured_at,
      corpus_sha256: run.corpus_sha256,
      candidate_sha: run.candidate_sha,
      canonical_sha256: run.canonical_sha256,
      aggregate: run.aggregate,
    })),
    release_gate: finalGate(finalRun),
    adjudications: adjudications.entries,
    attempts: runs.flatMap((run) => run.attempts.map((attempt) => attemptForPublic(run.label, attempt))),
  };
  if (record.total_attempts !== 68 || record.attempts.length !== 68) throw new TypeError('all_68_attempts_required');
  record.canonical_sha256 = sha256(JSON.stringify(stable(record)));
  await Promise.all([mkdir(dirname(options.json), { recursive: true }), mkdir(dirname(options.markdown), { recursive: true })]);
  await Promise.all([
    writeFile(options.json, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }),
    writeFile(options.markdown, markdown(record), { encoding: 'utf8', flag: 'wx' }),
  ]);
  process.stdout.write(`${JSON.stringify({ status: 'written', attempts: record.total_attempts, gate: record.release_gate.passed, canonical_sha256: record.canonical_sha256 })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
