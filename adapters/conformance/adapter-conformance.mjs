import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAdapterCapabilities } from '../../tools/foundation.mjs';

const literalArgv = Object.freeze({
  program: process.execPath,
  args: ['-e', 'process.stdout.write(process.argv[1])', 'literal;not-a-shell'],
});

function result(id, passed, detail) { return { id, passed, detail }; }

/**
 * Provider-neutral conformance checks.  A false capability is valid only when
 * its explicitly unavailable result is retained; it is never treated as zero
 * or as a passing implementation of that capability.
 */
export async function runAdapterConformance(adapter) {
  const declaration = adapter?.declaration;
  const checks = [];
  const declared = validateAdapterCapabilities(declaration);
  checks.push(result('declared-capabilities', declared.valid, declared.valid ? 'valid declaration' : declared.errors));

  if (declaration?.capabilities?.artifact_identity) {
    const directory = await mkdtemp(join(tmpdir(), 'stolz-adapter-conformance-'));
    const artifact = join(directory, 'artifact.txt');
    await writeFile(artifact, 'conformance-fixture');
    const identity = await adapter.identifyArtifact('conformance-fixture', artifact, '1.0.0');
    checks.push(result('evidence-provenance', typeof identity?.sha256 === 'string' && /^[a-f0-9]{64}$/.test(identity.sha256) && identity.id === 'conformance-fixture', identity));
  } else checks.push(result('evidence-provenance', false, 'artifact identity is unavailable'));

  if (declaration?.capabilities?.durable_state) {
    const directory = await mkdtemp(join(tmpdir(), 'stolz-adapter-state-'));
    const statePath = join(directory, 'state.json');
    const state = { operation_id: 'conformance', state: 'done' };
    await adapter.writeDurableState(statePath, state);
    const restored = await adapter.readDurableState(statePath);
    checks.push(result('durable-state', JSON.stringify(restored) === JSON.stringify(state), restored));
  } else checks.push(result('durable-state', true, 'not declared'));

  if (declaration?.capabilities?.command_execution) {
    const executed = await adapter.executeArgv(literalArgv);
    checks.push(result('literal-argv', executed?.ok === true && executed.stdout === literalArgv.args[2], executed));
  } else checks.push(result('literal-argv', true, 'not declared'));

  if (declaration?.resolution === 'lazy' && typeof adapter?.createLazyResolver === 'function') {
    let imports = 0;
    const resolver = adapter.createLazyResolver(async () => {
      imports += 1;
      return { codexAdapter: declaration };
    });
    const profile = { agent_runtime: { id: declaration.runtime.runtime_id }, adapter: { adapter_id: declaration.adapter_id, resolution: 'lazy' } };
    const before = await resolver({ concern: 'context', profile });
    const after = await resolver({ concern: 'context', profile, trigger: 'runtime-capability:artifact_identity' });
    await resolver({ concern: 'context', profile, trigger: 'runtime-capability:artifact_identity' });
    checks.push(result('lazy-resolution', before.reason === 'capability_trigger_required' && after.route === 'adapter' && imports === 1, { before, after, imports }));
  } else checks.push(result('lazy-resolution', false, 'adapter must expose a lazy resolver'));

  const evidence = typeof adapter?.captureEvidence === 'function' ? await adapter.captureEvidence() : null;
  const measurementDeclared = declaration?.capabilities?.measurement_capture === true;
  checks.push(result('explicit-unavailable-state', measurementDeclared
    ? evidence?.status === 'available'
    : evidence?.status === 'unavailable' && typeof evidence.reason === 'string' && evidence.reason.length > 0,
  evidence));

  return {
    adapter_id: declaration?.adapter_id ?? null,
    certified: checks.every(({ passed }) => passed),
    checks,
  };
}
