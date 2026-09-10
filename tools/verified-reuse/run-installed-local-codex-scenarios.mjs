import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { validateInstalledLocalCodexScenarioRecord } from './scenario-record.mjs';

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const utcNow = () => new Date().toISOString();
const runDir = process.cwd();

function execCodex(args, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = execFile('codex', args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        rejectPromise(error);
      } else resolvePromise({ stdout, stderr });
    });
    child.stdin?.end();
  });
}

const SCENARIOS = Object.freeze([
  { scenario_id: 'literal-canary-a-v1', expected: 'STOLZ_VR_CANARY_A' },
  { scenario_id: 'literal-canary-b-v1', expected: 'STOLZ_VR_CANARY_B' },
]);

function optionsFromArgs(args) {
  const index = args.indexOf('--output');
  const timeoutIndex = args.indexOf('--timeout-ms');
  if (index === -1 || !args[index + 1] || new Set(args.filter((value) => value.startsWith('--'))).size !== (timeoutIndex === -1 ? 1 : 2)) throw new TypeError('usage: node tools/verified-reuse/run-installed-local-codex-scenarios.mjs --output <path> [--timeout-ms <positive integer>]');
  const timeoutMs = timeoutIndex === -1 ? 300_000 : Number(args[timeoutIndex + 1]);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) throw new TypeError('--timeout-ms must be a positive integer up to 300000');
  return { output: resolve(runDir, args[index + 1]), timeoutMs };
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args, { cwd: runDir });
  return stdout.trim();
}

async function codexCapability() {
  try {
    const binaryLookup = process.platform === 'win32'
      ? execFileAsync('where.exe', ['codex'])
      : execFileAsync('sh', ['-c', 'command -v codex']);
    const [binary, version, login] = await Promise.all([
      binaryLookup,
      execFileAsync('codex', ['--version']),
      execFileAsync('codex', ['login', 'status']),
    ]);
    if (!/logged in/i.test(`${login.stdout}\n${login.stderr}`)) throw new Error('Codex CLI is not logged in');
    const binaryPaths = binary.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const binaryPath = process.platform === 'win32'
      ? binaryPaths.find((value) => value.toLowerCase().endsWith('.exe')) ?? binaryPaths[0]
      : binaryPaths[0];
    if (!binaryPath) throw new Error('Codex CLI binary path could not be resolved');
    return {
      availability: 'available',
      authorization: 'operator_authorized',
      version: version.stdout.trim(),
      binary_sha256: sha256(await readFile(binaryPath)),
    };
  } catch (error) {
    throw new Error(`installed local Codex CLI capability is unavailable or unauthorized: ${error.message}`);
  }
}

function promptFor(expected) {
  return `Return exactly this single line and nothing else: ${expected}. Do not use tools. Do not explain.`;
}

async function runCli({ role, expected, temporaryRoot, timeoutMs }) {
  const output = resolve(temporaryRoot, `${role}-${expected}.txt`);
  const started_at = utcNow();
  await execCodex([
    'exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check',
    '--sandbox', 'read-only', '-c', 'model_reasoning_effort="low"',
    '--output-last-message', output, promptFor(expected),
  ], { cwd: temporaryRoot, timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  const ended_at = utcNow();
  const message = (await readFile(output, 'utf8')).trim();
  if (message !== expected) throw new Error(`Codex ${role} outcome did not satisfy the deterministic oracle`);
  const output_sha256 = sha256(message);
  return {
    route_role: role,
    execution: 'installed_local_codex_cli',
    terminal_status: 'passed',
    started_at,
    ended_at,
    output_sha256,
    verification_sha256: sha256(`exact-literal-oracle@1:${expected}`),
  };
}

async function main() {
  const { output, timeoutMs } = optionsFromArgs(process.argv.slice(2));
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'stolz-verified-reuse-codex-'));
  try {
    const [cli, feature_sha, dev_sha, feature_tree_git_sha, dev_tree_git_sha] = await Promise.all([
      codexCapability(), git(['rev-parse', 'HEAD']), git(['rev-parse', 'dev']), git(['rev-parse', 'HEAD^{tree}']), git(['rev-parse', 'dev^{tree}']),
    ]);
    const withheld = (reason) => ({ admission: 'withheld', reason });
    const common = {
      schema_id: 'verified-reuse-installed-local-codex-scenarios', schema_version: '1.0.0', generated_at: utcNow(),
      candidate: { feature_sha, dev_sha, feature_tree_git_sha, dev_tree_git_sha }, cli,
      redaction_retention: { raw_content_committed: false, raw_output_retention: 'ephemeral_deleted', record_content: 'hashes_and_terminal_status_only' },
      claims: {
        savings: withheld('paired canaries verify equivalence only; they do not measure reusable work'),
        aggregate: withheld('cross-scenario aggregation is outside this evidence'),
        percentage: withheld('no qualifying aggregate measurement exists'),
        cost: withheld('no cost evidence is captured'),
        provider_wide: withheld('two local canaries do not establish provider-wide behavior'),
        release: withheld('verification evidence is not release evidence'),
        public_publication: withheld('no publication action was performed'),
      },
    };
    const started_at = utcNow();
    let scenarios;
    try {
      scenarios = [];
      for (const scenario of SCENARIOS) {
        const baseline = await runCli({ role: 'baseline', expected: scenario.expected, temporaryRoot, timeoutMs });
        const reuse = await runCli({ role: 'reuse', expected: scenario.expected, temporaryRoot, timeoutMs });
        scenarios.push({ scenario_id: scenario.scenario_id, prompt_sha256: sha256(promptFor(scenario.expected)), baseline, reuse });
      }
    } catch {
      const record = { ...common, scenario_execution: { status: 'unavailable', reason: 'installed_local_codex_execution_timeout_or_failure', started_at, ended_at: utcNow() }, scenarios: [] };
      validateInstalledLocalCodexScenarioRecord(record);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      process.stdout.write(`${JSON.stringify({ output, scenario_execution: record.scenario_execution, feature_sha, dev_sha })}\n`);
      return;
    }
    const record = { ...common, scenario_execution: { status: 'passed' }, scenarios };
    validateInstalledLocalCodexScenarioRecord(record);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ output, scenarios: scenarios.map(({ scenario_id }) => scenario_id), feature_sha, dev_sha })}\n`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
