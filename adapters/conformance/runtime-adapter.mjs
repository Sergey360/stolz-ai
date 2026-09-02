import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { commandIdentity, selectSafeRoute } from '../../tools/foundation.mjs';

const execFileAsync = promisify(execFile);

export function createRuntimeAdapter({ adapter_id, runtime_id, runtime_version, destination }) {
  const declaration = Object.freeze({
    adapter_id,
    provider: 'provider-neutral',
    adapter_version: '1.0.0',
    runtime: Object.freeze({ runtime_id, runtime_version }),
    resolution: 'lazy',
    runtime_contract: Object.freeze({ runtime_id, destination, activation: 'lazy', settings_provenance: 'required', hooks: 'explicit_opt_in', mcp: 'explicit_opt_in', fallback: 'provider-neutral' }),
    capabilities: Object.freeze({ artifact_identity: true, command_execution: true, durable_state: true, measurement_capture: false }),
  });

  async function identifyArtifact(id, filePath, version) {
    if (typeof id !== 'string' || !id) throw new TypeError('artifact id is required');
    return { id, sha256: createHash('sha256').update(await readFile(filePath)).digest('hex'), ...(version ? { version } : {}) };
  }
  async function executeArgv(command, { cwd, env, timeout = 60_000, maxBuffer = 1_048_576 } = {}) {
    commandIdentity(command);
    try {
      const { stdout, stderr } = await execFileAsync(command.program, command.args, { cwd, env, timeout, maxBuffer, windowsHide: true });
      return { ok: true, exit_code: 0, stdout, stderr };
    } catch (caught) {
      return { ok: false, exit_code: Number.isInteger(caught.code) ? caught.code : null, error_code: typeof caught.code === 'string' ? caught.code : null, stdout: caught.stdout ?? '', stderr: caught.stderr ?? '' };
    }
  }
  async function readDurableState(filePath) {
    try { return JSON.parse(await readFile(resolve(filePath), 'utf8')); }
    catch (caught) { if (caught.code === 'ENOENT') return null; throw caught; }
  }
  async function writeDurableState(filePath, state) {
    if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('state must be an object');
    const target = resolve(filePath); await mkdir(dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(state)}\n`, 'utf8'); return target;
  }
  function createLazyResolver(loadAdapter = () => Promise.resolve({ declaration })) {
    let adapterPromise = null;
    return async function resolveAdapter({ concern, profile, trigger } = {}) {
      const expectedTrigger = 'runtime-capability:artifact_identity';
      if (concern !== 'context') return { route: 'provider-neutral', reason: 'unknown_concern' };
      if (profile?.agent_runtime?.id !== runtime_id || profile?.adapter?.adapter_id !== adapter_id || profile?.adapter?.resolution !== 'lazy') return { route: 'provider-neutral', reason: 'adapter_unavailable' };
      if (trigger !== expectedTrigger) return { route: 'provider-neutral', reason: 'capability_trigger_required', trigger: expectedTrigger };
      try {
        adapterPromise ??= Promise.resolve().then(loadAdapter);
        const module = await adapterPromise;
        const selected = selectSafeRoute(module.declaration ?? module.codexAdapter ?? module, ['artifact_identity']);
        return selected.route === 'adapter' ? { ...selected, adapter_version: declaration.adapter_version } : selected;
      } catch { return { route: 'provider-neutral', reason: 'adapter_unavailable' }; }
    };
  }
  async function captureEvidence() {
    return { status: 'unavailable', reason: `${adapter_id} runtime telemetry is withheld until G5` };
  }
  return Object.freeze({ declaration, identifyArtifact, executeArgv, readDurableState, writeDurableState, createLazyResolver, captureEvidence });
}
