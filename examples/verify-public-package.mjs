#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { openCodexLocalState } from '../tools/codex-local-state.mjs';
import { applyUpdate, createInstallManifest } from '../tools/profile-lifecycle.mjs';
import { resolveProfile } from '../tools/profile-resolver.mjs';

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const profileCli = join(packageRoot, 'tools', 'profile-cli.mjs');

async function cli(args, expectedExitCode = 0) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [profileCli, ...args]);
    assert.equal(expectedExitCode, 0, `expected exit ${expectedExitCode}, command succeeded`);
    return JSON.parse(stdout);
  } catch (error) {
    assert.equal(error.code, expectedExitCode, error.stderr || error.message);
    return JSON.parse(error.stdout);
  }
}

async function main() {
  const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.14.0');
  for (const path of [
    'docs/architecture.md',
    'docs/benchmarking.md',
    'docs/installation.md',
    'docs/PILOT_JOURNAL_TEMPLATE.md',
  ]) await readFile(join(packageRoot, path), 'utf8');

  const root = await mkdtemp(join(tmpdir(), 'stolz-public-package-'));
  try {
    const destination = join(root, '.qwen', 'skills');
    const lockfile = join(root, 'stolz-profile.lock.json');
    const localStateWorkspace = join(root, 'codex-local-state');

    const installed = await cli(['install', '--runtime', 'qwen-code', '--destination', destination, '--scope', 'project']);
    assert.equal(installed.format_version, '1.0');
    assert.equal(installed.install.manifest.package.version, '0.14.0');

    const unknownEnvironment = await cli(['doctor', '--runtime', 'qwen-code', '--destination', destination]);
    assert.equal(unknownEnvironment.environment.runtime_version_state, 'runtime_version_not_reported');
    assert.match(unknownEnvironment.next_action, /--runtime-version/);
    assert.equal(unknownEnvironment.adapter.availability, 'declared_lazy');
    assert.equal(unknownEnvironment.compatibility.model_identity_used_as_evidence, false);

    const exactEnvironment = await cli(['doctor', '--runtime', 'qwen-code', '--runtime-version', '0.22.3', '--destination', destination]);
    assert.equal(exactEnvironment.compatibility.state, 'exact_profile_version');
    const changedEnvironment = await cli(['doctor', '--runtime', 'qwen-code', '--runtime-version', 'unknown', '--destination', destination]);
    assert.equal(changedEnvironment.compatibility.state, 'recheck_required');

    const lock = await cli(['lock', '--apply', '--runtime', 'qwen-code', '--lockfile', lockfile]);
    assert.equal(lock.applied, true);
    assert.equal((await cli(['verify-lock', '--runtime', 'qwen-code', '--lockfile', lockfile])).verification.state, 'healthy');
    const staleLock = JSON.parse(await readFile(lockfile, 'utf8'));
    staleLock.package.version = '0.13.0';
    await writeFile(lockfile, `${JSON.stringify(staleLock, null, 2)}\n`, 'utf8');
    const drift = await cli(['verify-lock', '--runtime', 'qwen-code', '--lockfile', lockfile], 2);
    assert.equal(drift.verification.state, 'drift');
    assert.deepEqual(drift.verification.differences, ['package']);
    await cli(['lock', '--apply', '--runtime', 'qwen-code', '--lockfile', lockfile]);

    const resolution = await resolveProfile({ runtime: 'qwen-code', capabilities: { command_execution: true } });
    const historical = await createInstallManifest(resolution, {
      scope: 'project',
      packageIdentity: { name: 'stolz-ai', version: '0.13.0' },
    });
    const interruptedOnlyPath = 'stolz-context/v013-interrupted-owned.txt';
    const interruptedOnlyContent = 'owned by the interrupted v0.13 installation';
    const { createHash } = await import('node:crypto');
    historical.install_id = 'stolz-v013-public-smoke';
    historical.managed_files.push({
      source_path: 'skills/stolz-context/v012-interrupted-owned.txt',
      destination_path: interruptedOnlyPath,
      sha256: createHash('sha256').update(interruptedOnlyContent).digest('hex'),
      bytes: Buffer.byteLength(interruptedOnlyContent),
    });
    await writeFile(join(destination, interruptedOnlyPath), interruptedOnlyContent, 'utf8');
    await writeFile(join(destination, 'install-manifest.json'), `${JSON.stringify(historical, null, 2)}\n`, 'utf8');

    const migration = await cli(['migrate', '--apply', '--legacy-version', '0.13.0', '--runtime', 'qwen-code', '--destination', destination]);
    assert.equal(migration.applied, false);
    assert.equal(migration.migrated.state, 'update_required');
    assert.equal((await cli(['update', '--runtime', 'qwen-code', '--destination', destination])).plan.state, 'ready');

    await assert.rejects(
      () => applyUpdate(destination, resolution, { faultAfterChanges: 1, leaveInterruptedState: true }),
      /injected update interruption/,
    );
    assert.equal((await cli(['doctor', '--runtime', 'qwen-code', '--destination', destination])).installation.state, 'recovery_required');
    assert.equal((await cli(['recover', '--runtime', 'qwen-code', '--destination', destination])).plan.state, 'ready');
    assert.equal((await cli(['recover', '--apply', '--runtime', 'qwen-code', '--destination', destination])).applied, true);
    assert.equal(await readFile(join(destination, interruptedOnlyPath), 'utf8'), interruptedOnlyContent);

    const updated = await cli(['update', '--apply', '--runtime', 'qwen-code', '--destination', destination]);
    assert.equal(updated.applied, true);
    assert.equal(updated.plan.current_package.version, '0.13.0');
    assert.equal(updated.plan.target_package.version, '0.14.0');

    const installedSkill = join(destination, 'stolz-context', 'SKILL.md');
    await writeFile(installedSkill, 'local change', 'utf8');
    assert.equal((await cli(['rollback', '--runtime', 'qwen-code', '--destination', destination])).plan.state, 'conflict');
    await copyFile(join(packageRoot, 'skills', 'stolz-context', 'SKILL.md'), installedSkill);
    assert.equal((await cli(['rollback', '--apply', '--runtime', 'qwen-code', '--destination', destination])).applied, true);
    assert.equal(JSON.parse(await readFile(join(destination, 'install-manifest.json'), 'utf8')).package.version, '0.13.0');

    const localState = openCodexLocalState({ enabled: true, workspace: localStateWorkspace });
    const initialized = await localState.initialize();
    const overhead = await localState.overhead();
    assert.equal(initialized.api_version, '1.0.0');
    assert.equal(overhead.automatic_model_invocations, 0);

    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      package_version: pkg.version,
      platform: process.platform,
      arch: process.arch,
      node_version: process.version,
      scenarios: [
        'clean_install',
        'doctor_environment_and_adapter',
        'team_lock_and_drift_exit',
        'v0.13_owned_update',
        'interrupted_update_recovery',
        'local_change_rollback_conflict',
        'rollback_to_v0.13',
        'explicit_codex_local_state',
      ],
    }, null, 2)}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
