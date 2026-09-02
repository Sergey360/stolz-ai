import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { commandIdentity } from '../../tools/foundation.mjs';
import { createLazyCodexResolver } from '../../tools/routed-skills.mjs';

const execFileAsync = promisify(execFile);

export const codexAdapter = Object.freeze({
  adapter_id: 'codex-local',
  provider: 'openai-codex',
  adapter_version: '1.0.0',
  runtime: Object.freeze({ runtime_id: 'codex', runtime_version: '1.0.0' }),
  resolution: 'lazy',
  capabilities: Object.freeze({
    artifact_identity: true,
    command_execution: true,
    durable_state: true,
    measurement_capture: false,
  }),
});

/** Preserve an observable absence instead of fabricating runtime telemetry. */
export async function captureEvidence() {
  return {
    status: 'unavailable',
    reason: 'codex-local does not expose an authoritative measurement capture',
  };
}

export const codexConformanceAdapter = Object.freeze({
  declaration: codexAdapter,
  identifyArtifact,
  executeArgv,
  readDurableState,
  writeDurableState,
  captureEvidence,
  createLazyResolver: createLazyCodexResolver,
});

export async function identifyArtifact(id, filePath, version) {
  if (typeof id !== 'string' || !id) throw new TypeError('artifact id is required');
  const content = await readFile(filePath);
  return Object.fromEntries(Object.entries({
    id,
    sha256: createHash('sha256').update(content).digest('hex'),
    version,
  }).filter(([, value]) => value !== undefined));
}

export async function executeArgv(command, { cwd, env, timeout = 60_000, maxBuffer = 1_048_576 } = {}) {
  commandIdentity(command);
  try {
    const { stdout, stderr } = await execFileAsync(command.program, command.args, {
      cwd,
      env,
      timeout,
      maxBuffer,
      windowsHide: true,
    });
    return { ok: true, exit_code: 0, stdout, stderr };
  } catch (caught) {
    return {
      ok: false,
      exit_code: Number.isInteger(caught.code) ? caught.code : null,
      error_code: typeof caught.code === 'string' ? caught.code : null,
      stdout: caught.stdout ?? '',
      stderr: caught.stderr ?? '',
    };
  }
}

export async function readDurableState(filePath) {
  try {
    return JSON.parse(await readFile(resolve(filePath), 'utf8'));
  } catch (caught) {
    if (caught.code === 'ENOENT') return null;
    throw caught;
  }
}

export async function writeDurableState(filePath, state) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('state must be an object');
  const target = resolve(filePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(state)}\n`, 'utf8');
  return target;
}
