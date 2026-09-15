import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNNER_VERSION = '1.0.0';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CORPUS = resolve(REPOSITORY_ROOT, 'benchmarks/skill-selection-v012/corpus.json');
const GROUPS = new Set(['context', 'reuse', 'state', 'measurement', 'ordinary', 'ambiguous']);
const SPLITS = new Set(['development', 'heldout', 'heldout_b']);
const PRODUCT_SKILLS = new Set([
  'stolz-benchmark',
  'stolz-context',
  'stolz-quiet-state',
  'stolz-reuse',
  'stolz-route',
]);
const NEUTRAL_SKILLS = Object.freeze({
  'plain-code-review': `---
name: plain-code-review
description: Review a small code sample for concrete correctness defects. Use for ordinary code review, not routing, caching, polling, or efficiency claims.
---

# Plain code review

Read only the requested code and report the concrete defect. Do not load STOLZ
optimization skills unless the request independently triggers one.
`,
  'release-note-editor': `---
name: release-note-editor
description: Check release-note wording, version labels, and duplicated prose. Use for ordinary documentation edits or analysis.
---

# Release-note editor

Inspect the requested release text and return the specific correction. Do not
turn ordinary documentation work into an optimization or measurement task.
`,
  'test-triage': `---
name: test-triage
description: Read ordinary unit-test output and identify failures. Use for test triage, not benchmark or token-efficiency comparisons.
---

# Test triage

Report the failing test or pass status from the supplied output. A normal test
result is not benchmark evidence.
`,
});
const QUESTION = /(?:do you want|would you like|should i|may i|can i proceed|please confirm|need permission)[^\n?]*\?/iu;
const SKILL_ROOT = /\.agents[\\/]+skills[\\/]+([a-z0-9-]+)[\\/]+SKILL\.md\b/giu;
const REFERENCE = /(?:^|[\\/])references[\\/]+([a-z0-9-]+\.md)\b/giu;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(stable(value)));
}

function parseArgs(argv) {
  const options = { case_ids: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--case') {
      const value = argv[++index];
      if (!value) throw new TypeError('missing_case_id');
      options.case_ids.push(...value.split(',').filter(Boolean));
      continue;
    }
    const value = argv[++index];
    if (!value || !['--corpus', '--split', '--private-root', '--output', '--model', '--reasoning', '--candidate-sha', '--timeout-ms'].includes(key)) {
      throw new TypeError(`invalid_argument:${key}`);
    }
    options[key.slice(2).replaceAll('-', '_')] = value;
  }
  for (const required of ['private_root', 'output', 'model', 'reasoning', 'candidate_sha']) {
    if (!options[required]) throw new TypeError(`missing_${required}`);
  }
  options.corpus ??= DEFAULT_CORPUS;
  options.timeout_ms = Number(options.timeout_ms ?? 180000);
  if (!Number.isInteger(options.timeout_ms) || options.timeout_ms < 1000 || options.timeout_ms > 600000) {
    throw new TypeError('invalid_timeout_ms');
  }
  if (options.split && !SPLITS.has(options.split)) throw new TypeError('invalid_split');
  if (!isAbsolute(options.private_root) || !isAbsolute(options.output) || !isAbsolute(options.corpus)) {
    throw new TypeError('absolute_paths_required');
  }
  if (!/^[a-f0-9]{40}$/u.test(options.candidate_sha)) throw new TypeError('invalid_candidate_sha');
  return options;
}

export function validateCorpus(corpus) {
  const primary = corpus?.schema === 'stolz.skill-selection-corpus.v1';
  const replacement = corpus?.schema === 'stolz.skill-selection-heldout.v1';
  if ((!primary && !replacement) || corpus.version !== '0.12.0' || !Array.isArray(corpus.cases)) {
    throw new TypeError('invalid_corpus_header');
  }
  if (primary && corpus.cases.length !== 36) throw new TypeError('corpus_must_have_36_cases');
  if (replacement && corpus.cases.length !== 24) throw new TypeError('replacement_corpus_must_have_24_cases');
  const ids = new Set();
  const counts = {};
  for (const split of SPLITS) for (const group of GROUPS) counts[`${split}:${group}`] = 0;
  for (const item of corpus.cases) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || ids.has(item.id)) throw new TypeError('invalid_or_duplicate_case_id');
    ids.add(item.id);
    if (!SPLITS.has(item.split) || !GROUPS.has(item.group)) throw new TypeError(`invalid_case_partition:${item.id}`);
    counts[`${item.split}:${item.group}`] += 1;
    if (typeof item.prompt !== 'string' || item.prompt.length < 20 || item.prompt.length > 1000) throw new TypeError(`invalid_prompt:${item.id}`);
    if (!item.files || Array.isArray(item.files) || typeof item.files !== 'object') throw new TypeError(`invalid_files:${item.id}`);
    for (const [path, content] of Object.entries(item.files)) {
      if (basename(path) !== path || typeof content !== 'string' || path === 'AGENTS.md') throw new TypeError(`unsafe_fixture:${item.id}`);
    }
    const oracle = item.oracle;
    if (!oracle || typeof oracle.decision !== 'string' || !Array.isArray(oracle.allowed_skills)
      || !Array.isArray(oracle.allowed_references) || !Number.isInteger(oracle.minimum_reference_reads)
      || typeof oracle.permission_question_allowed !== 'boolean') throw new TypeError(`invalid_oracle:${item.id}`);
    for (const skill of oracle.allowed_skills) {
      if (!PRODUCT_SKILLS.has(skill) && !Object.hasOwn(NEUTRAL_SKILLS, skill)) throw new TypeError(`unknown_skill:${item.id}`);
    }
    if (oracle.required_root !== null && !PRODUCT_SKILLS.has(oracle.required_root)) throw new TypeError(`invalid_required_root:${item.id}`);
  }
  for (const group of GROUPS) {
    if (primary && (counts[`development:${group}`] !== 2 || counts[`heldout:${group}`] !== 4 || counts[`heldout_b:${group}`] !== 0)) {
      throw new TypeError(`unbalanced_group:${group}`);
    }
    if (replacement && (counts[`development:${group}`] !== 0 || counts[`heldout:${group}`] !== 0 || counts[`heldout_b:${group}`] !== 4)) {
      throw new TypeError(`unbalanced_replacement_group:${group}`);
    }
  }
  return corpus;
}

async function runCommand(command, args, { cwd, stdin, timeoutMs }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', rejectPromise);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        code,
        signal,
        timed_out: timedOut,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
    child.stdin.end(stdin);
  });
}

function parseEvents(raw) {
  const events = [];
  for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
    try { events.push(JSON.parse(line)); } catch { /* Raw evidence retains malformed lines. */ }
  }
  return events;
}

function uniqueMatches(text, pattern) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[1]))].sort();
}

export function summarizeEvents({ raw, stderr = '', oracle, exitCode = 0, signal = null, timedOut = false }) {
  const events = parseEvents(raw);
  const agentMessages = events
    .filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')
    .map((event) => event.item.text ?? '');
  const finalAnswer = agentMessages.at(-1)?.trim() ?? '';
  const toolEvents = events.filter((event) => event.type === 'item.completed' && event.item?.type === 'command_execution');
  const toolText = toolEvents.map((event) => `${event.item.command ?? ''}\n${event.item.aggregated_output ?? ''}`).join('\n');
  const selectedSkills = uniqueMatches(toolText, SKILL_ROOT);
  const referenceFiles = uniqueMatches(toolText, REFERENCE);
  const evaluatedSkills = selectedSkills.filter((skill) => PRODUCT_SKILLS.has(skill) || Object.hasOwn(NEUTRAL_SKILLS, skill));
  const externalSkills = selectedSkills.filter((skill) => !evaluatedSkills.includes(skill));
  const decision = finalAnswer.match(/(?:^|\b)DECISION=([A-Za-z0-9._-]+)/u)?.[1] ?? null;
  const disallowedSkills = evaluatedSkills.filter((skill) => !oracle.allowed_skills.includes(skill));
  const disallowedReferences = referenceFiles.filter((file) => !oracle.allowed_references.includes(file));
  const requiredRootPresent = oracle.required_root === null || selectedSkills.includes(oracle.required_root);
  const productRoots = selectedSkills.filter((skill) => PRODUCT_SKILLS.has(skill));
  const noProductExpected = oracle.required_root === null && !oracle.allowed_skills.some((skill) => PRODUCT_SKILLS.has(skill));
  const routeCorrect = requiredRootPresent
    && disallowedSkills.length === 0
    && disallowedReferences.length === 0
    && referenceFiles.length >= oracle.minimum_reference_reads
    && (!noProductExpected || productRoots.length === 0);
  const askedPermission = agentMessages.some((message) => QUESTION.test(message));
  const usage = events.findLast((event) => event.type === 'turn.completed')?.usage ?? null;
  const commandFailures = toolEvents.filter((event) => event.item.exit_code !== 0).length;
  const executionCompleted = exitCode === 0 && signal === null && !timedOut;
  const outcomeCorrect = executionCompleted && decision === oracle.decision;
  const permissionCorrect = oracle.permission_question_allowed || !askedPermission;
  return {
    execution_completed: executionCompleted,
    timed_out: timedOut,
    process_exit_code: exitCode,
    process_signal: signal,
    decision,
    expected_decision: oracle.decision,
    outcome_correct: outcomeCorrect,
    route_correct: routeCorrect,
    permission_correct: permissionCorrect,
    asked_permission: askedPermission,
    selected_skills: selectedSkills,
    evaluated_skills: evaluatedSkills,
    external_skills: externalSkills,
    read_references: referenceFiles,
    disallowed_skills: disallowedSkills,
    disallowed_references: disallowedReferences,
    tool_calls: toolEvents.length,
    failed_tool_calls: commandFailures,
    usage,
    final_answer: finalAnswer,
    stderr_present: stderr.trim().length > 0,
  };
}

async function prepareWorkspace({ root, item }) {
  await mkdir(root, { recursive: true });
  for (const [path, content] of Object.entries(item.files)) await writeFile(join(root, path), content, { encoding: 'utf8', flag: 'wx' });
  const skillRoot = join(root, '.agents', 'skills');
  await mkdir(skillRoot, { recursive: true });
  for (const skill of PRODUCT_SKILLS) await cp(resolve(REPOSITORY_ROOT, 'skills', skill), join(skillRoot, skill), { recursive: true, errorOnExist: true });
  for (const [skill, content] of Object.entries(NEUTRAL_SKILLS)) {
    const directory = join(skillRoot, skill);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'SKILL.md'), content, { encoding: 'utf8', flag: 'wx' });
  }
}

function buildPrompt(item) {
  return [
    item.prompt,
    'Work only in the current isolated workspace. Use an available project skill when its description matches the request.',
    'Do not inspect parent directories or hidden evaluation data. Complete the requested read or analysis, then give the requested DECISION line.',
  ].join('\n\n');
}

async function runCase({ item, runRoot, model, reasoning, candidateSha, timeoutMs }) {
  const attemptRoot = join(runRoot, item.id);
  const workspace = join(attemptRoot, 'workspace');
  await prepareWorkspace({ root: workspace, item });
  const startedAt = new Date().toISOString();
  const execution = await runCommand('codex', [
    'exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
    '--approve-for-me', '-m', model, '-c', `model_reasoning_effort="${reasoning}"`,
    '-C', workspace, '-',
  ], { cwd: workspace, stdin: buildPrompt(item), timeoutMs });
  const endedAt = new Date().toISOString();
  const rawPath = join(attemptRoot, 'events.jsonl');
  const stderrPath = join(attemptRoot, 'stderr.log');
  await Promise.all([
    writeFile(rawPath, execution.stdout, { encoding: 'utf8', flag: 'wx' }),
    writeFile(stderrPath, execution.stderr, { encoding: 'utf8', flag: 'wx' }),
  ]);
  const summary = summarizeEvents({
    raw: execution.stdout,
    stderr: execution.stderr,
    oracle: item.oracle,
    exitCode: execution.code,
    signal: execution.signal,
    timedOut: execution.timed_out,
  });
  return {
    case_id: item.id,
    split: item.split,
    group: item.group,
    traits: item.traits,
    prompt: item.prompt,
    candidate_sha: candidateSha,
    started_at: startedAt,
    ended_at: endedAt,
    raw_evidence_sha256: sha256(execution.stdout),
    stderr_sha256: sha256(execution.stderr),
    private_locator: `private_retained:${basename(runRoot)}:${item.id}`,
    ...summary,
  };
}

function aggregate(attempts) {
  const byGroup = {};
  for (const group of GROUPS) {
    const selected = attempts.filter((attempt) => attempt.group === group);
    byGroup[group] = {
      attempts: selected.length,
      route_correct: selected.filter((attempt) => attempt.route_correct).length,
      outcome_correct: selected.filter((attempt) => attempt.outcome_correct).length,
    };
  }
  return {
    attempts: attempts.length,
    execution_completed: attempts.filter((attempt) => attempt.execution_completed).length,
    route_correct: attempts.filter((attempt) => attempt.route_correct).length,
    outcome_correct: attempts.filter((attempt) => attempt.outcome_correct).length,
    permission_correct: attempts.filter((attempt) => attempt.permission_correct).length,
    failures: attempts.filter((attempt) => !attempt.execution_completed || !attempt.route_correct || !attempt.outcome_correct || !attempt.permission_correct).map((attempt) => attempt.case_id),
    by_group: byGroup,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const corpusText = await readFile(options.corpus, 'utf8');
  const corpus = validateCorpus(JSON.parse(corpusText));
  let cases = corpus.cases;
  if (options.split) cases = cases.filter((item) => item.split === options.split);
  if (options.case_ids.length) {
    const requested = new Set(options.case_ids);
    cases = cases.filter((item) => requested.has(item.id));
    if (cases.length !== requested.size) throw new TypeError('unknown_case_id');
  }
  if (cases.length === 0) throw new TypeError('no_cases_selected');
  const runId = `skill-selection-${new Date().toISOString().replaceAll(/[:.]/gu, '')}-${randomUUID().slice(0, 8)}`;
  const runRoot = join(options.private_root, runId);
  await mkdir(runRoot, { recursive: true });
  const attempts = [];
  for (const item of cases) {
    const attempt = await runCase({
      item,
      runRoot,
      model: options.model,
      reasoning: options.reasoning,
      candidateSha: options.candidate_sha,
      timeoutMs: options.timeout_ms,
    });
    attempts.push(attempt);
    process.stdout.write(`${JSON.stringify({ type: 'attempt.completed', case_id: item.id, route_correct: attempt.route_correct, outcome_correct: attempt.outcome_correct, permission_correct: attempt.permission_correct })}\n`);
  }
  const record = {
    schema: 'stolz.skill-selection-run.v1',
    runner_version: RUNNER_VERSION,
    run_id: runId,
    captured_at: new Date().toISOString(),
    corpus_sha256: sha256(corpusText),
    corpus_version: corpus.version,
    candidate_sha: options.candidate_sha,
    environment: {
      codex_cli_version: '0.153.4',
      model: options.model,
      reasoning_effort: options.reasoning,
      authentication_mode: 'chatgpt_managed',
      session: 'ephemeral',
      sandbox: 'workspace-write-auto-approved (--approve-for-me)',
      timeout_ms: options.timeout_ms,
      automatic_retries: 0,
    },
    attempts,
    aggregate: aggregate(attempts),
  };
  record.canonical_sha256 = canonicalSha256(record);
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ type: 'run.completed', output: options.output, private_root: runRoot, aggregate: record.aggregate, canonical_sha256: record.canonical_sha256 })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
