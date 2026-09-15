#!/usr/bin/env node

import { installProfile } from './profile-installer.mjs';
import {
  applyRecovery,
  applyRollback,
  applyUninstall,
  applyUpdate,
  createProfileLock,
  createRecoveryPlan,
  createRollbackPlan,
  createUninstallPlan,
  createUpdatePlan,
  inspectInstallation,
  migrateLegacyInstallation,
  readProfileLock,
  verifyProfileLock,
  writeProfileLock,
} from './profile-lifecycle.mjs';
import { resolveProfile } from './profile-resolver.mjs';

function readValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function parse(argv) {
  const result = { requested_integrations: [], capabilities: { command_execution: true } };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (['resolve', 'install', 'status', 'doctor', 'update', 'recover', 'rollback', 'uninstall', 'migrate', 'lock', 'verify-lock'].includes(argument)) result.command = argument;
    else if (argument === '--runtime') result.runtime = readValue(argv, index++, argument);
    else if (argument === '--runtime-version') result.runtimeVersion = readValue(argv, index++, argument);
    else if (argument === '--provider') result.provider = readValue(argv, index++, argument);
    else if (argument === '--integration') result.requested_integrations.push(readValue(argv, index++, argument));
    else if (argument === '--destination') result.destination = readValue(argv, index++, argument);
    else if (argument === '--scope') result.scope = readValue(argv, index++, argument);
    else if (argument === '--legacy-version') result.legacyVersion = readValue(argv, index++, argument);
    else if (argument === '--lockfile') result.lockfile = readValue(argv, index++, argument);
    else if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--apply') result.apply = true;
    else if (argument === '--deny-adapter') result.capabilities.command_execution = false;
    else throw new Error(`unknown argument: ${argument}`);
  }
  return result;
}

function output(payload) {
  return `${JSON.stringify({ format_version: '1.0', ...payload })}\n`;
}

function runtimeVersionState(resolution, runtimeVersion) {
  const expected = resolution.profile?.agent_runtime?.version ?? null;
  if (!expected) return 'not_certified';
  if (!runtimeVersion) return 'runtime_version_not_reported';
  return expected === runtimeVersion ? 'exact_profile_version' : 'recheck_required';
}

function diagnosticNextAction(installation, resolution, versionState) {
  if (resolution.resolution !== 'profile') return `profile resolution is unavailable (${resolution.reason}); use the five provider-neutral skills without claiming adapter compatibility`;
  if (versionState === 'runtime_version_not_reported') return 'report --runtime-version to check the exact declared compatibility tuple';
  if (versionState === 'recheck_required') return 'use the provider-neutral skills and recheck this exact runtime and adapter tuple before claiming compatibility';
  return installation.next_action;
}

try {
  const options = parse(process.argv.slice(2));
  if (!options.command) throw new Error('usage: stolz-profile <resolve|install|status|doctor|update|recover|rollback|uninstall|migrate|lock|verify-lock> [--runtime codex] [--runtime-version version] [--provider overlay-id] [--integration id] [--destination absolute-path] [--lockfile absolute-path] [--scope project|user] [--legacy-version version] [--dry-run|--apply]');
  const resolution = await resolveProfile(options);
  if (options.command === 'resolve') process.stdout.write(output({ command: 'resolve', ...resolution }));
  else if (options.command === 'install') {
    if (!options.destination) throw new Error('install requires --destination');
    process.stdout.write(output({ command: 'install', resolution, install: await installProfile(resolution, options) }));
  } else if (options.command === 'lock') {
    if (!options.lockfile) throw new Error('lock requires --lockfile');
    const lock = await createProfileLock(resolution);
    if (options.apply) await writeProfileLock(options.lockfile, lock);
    process.stdout.write(output({ command: 'lock', dry_run: !options.apply, applied: Boolean(options.apply), lockfile: options.lockfile, lock }));
  } else if (options.command === 'verify-lock') {
    if (!options.lockfile) throw new Error('verify-lock requires --lockfile');
    const verification = await verifyProfileLock(await readProfileLock(options.lockfile), resolution, { runtimeVersion: options.runtimeVersion });
    process.stdout.write(output({ command: 'verify-lock', lockfile: options.lockfile, verification }));
    if (verification.state !== 'healthy') process.exitCode = 2;
  } else if (options.command === 'update') {
    if (!options.destination) throw new Error('update requires --destination');
    const plan = await createUpdatePlan(options.destination, resolution);
    const applied = options.apply ? await applyUpdate(options.destination, resolution) : null;
    process.stdout.write(output({ command: 'update', dry_run: !options.apply, plan: applied?.plan ?? plan, applied: applied?.applied ?? false }));
  } else if (options.command === 'recover') {
    if (!options.destination) throw new Error('recover requires --destination');
    const plan = await createRecoveryPlan(options.destination);
    const applied = options.apply ? await applyRecovery(options.destination) : null;
    process.stdout.write(output({ command: 'recover', dry_run: !options.apply, plan: applied?.plan ?? plan, applied: applied?.applied ?? false }));
  } else if (options.command === 'rollback') {
    if (!options.destination) throw new Error('rollback requires --destination');
    const plan = await createRollbackPlan(options.destination);
    const applied = options.apply ? await applyRollback(options.destination) : null;
    process.stdout.write(output({ command: 'rollback', dry_run: !options.apply, plan: applied?.plan ?? plan, applied: applied?.applied ?? false }));
  } else if (options.command === 'uninstall') {
    if (!options.destination) throw new Error('uninstall requires --destination');
    const plan = await createUninstallPlan(options.destination);
    const applied = options.apply ? await applyUninstall(options.destination) : null;
    process.stdout.write(output({ command: 'uninstall', dry_run: !options.apply, plan: applied?.plan ?? plan, applied: applied?.applied ?? false }));
  } else if (options.command === 'migrate') {
    if (!options.destination) throw new Error('migrate requires --destination');
    if (!options.apply) throw new Error('migrate requires --apply after status confirms a legacy installation');
    const migrated = await migrateLegacyInstallation(options.destination, resolution, options);
    process.stdout.write(output({ command: 'migrate', applied: migrated.migrated, migrated }));
  } else {
    if (!options.destination) throw new Error(`${options.command} requires --destination`);
    const installation = await inspectInstallation(options.destination, resolution);
    const runtimeProfile = resolution.profile?.agent_runtime ?? null;
    const runtimeVersion = options.runtimeVersion ?? null;
    const versionState = runtimeVersionState(resolution, runtimeVersion);
    const report = {
      command: options.command,
      destination: options.destination,
      resolution: { resolution: resolution.resolution, certified: resolution.certified, reason: resolution.reason, runtime: resolution.runtime, profile_id: resolution.profile?.profile_id ?? null },
      installation: { state: installation.state, checked_files: installation.verification?.checked_files ?? 0, missing: installation.verification?.missing ?? [], modified: installation.verification?.modified ?? [], package: installation.manifest?.package ?? null },
      next_action: options.command === 'doctor' ? diagnosticNextAction(installation, resolution, versionState) : installation.next_action,
    };
    if (options.command === 'doctor') {
      report.environment = { platform: process.platform, arch: process.arch, node_version: process.version, runtime_version: runtimeVersion, expected_runtime_version: runtimeProfile?.version ?? null, runtime_version_state: versionState };
      report.adapter = {
        adapter_id: resolution.adapter.adapter_id,
        version: resolution.adapter.adapter_version ?? null,
        availability: resolution.resolution === 'profile' && resolution.adapter.adapter_id !== 'none' ? 'declared_lazy' : 'unavailable',
        reason: resolution.resolution === 'profile' ? 'selected profile declaration' : resolution.reason,
      };
      report.compatibility = {
        state: resolution.certified ? versionState : 'withheld',
        basis: resolution.profile?.certification ?? null,
        model_identity_used_as_evidence: false,
        fallback_reason: resolution.resolution === 'profile' ? null : resolution.reason,
      };
      report.evidence = {
        certification: resolution.profile?.certification ?? null,
        status: report.compatibility.state,
        fallback_reason: report.compatibility.fallback_reason,
      };
    }
    process.stdout.write(output(report));
  }
} catch (error) {
  process.stderr.write(output({ error: { code: 'command_failed', message: error.message } }));
  process.exitCode = 1;
}
