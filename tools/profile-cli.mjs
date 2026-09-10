import { installProfile } from './profile-installer.mjs';
import { applyRollback, applyUninstall, applyUpdate, createRollbackPlan, createUninstallPlan, createUpdatePlan, inspectInstallation, migrateLegacyInstallation } from './profile-lifecycle.mjs';
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
    if (['resolve', 'install', 'status', 'doctor', 'update', 'rollback', 'uninstall', 'migrate'].includes(argument)) result.command = argument;
    else if (argument === '--runtime') result.runtime = readValue(argv, index++, argument);
    else if (argument === '--runtime-version') result.runtimeVersion = readValue(argv, index++, argument);
    else if (argument === '--provider') result.provider = readValue(argv, index++, argument);
    else if (argument === '--integration') result.requested_integrations.push(readValue(argv, index++, argument));
    else if (argument === '--destination') result.destination = readValue(argv, index++, argument);
    else if (argument === '--scope') result.scope = readValue(argv, index++, argument);
    else if (argument === '--legacy-version') result.legacyVersion = readValue(argv, index++, argument);
    else if (argument === '--dry-run') result.dryRun = true;
    else if (argument === '--apply') result.apply = true;
    else if (argument === '--deny-adapter') result.capabilities.command_execution = false;
    else throw new Error(`unknown argument: ${argument}`);
  }
  return result;
}

try {
  const options = parse(process.argv.slice(2));
  if (!options.command) throw new Error('usage: profile-cli.mjs <resolve|install|status|doctor|update|rollback|uninstall|migrate> [--runtime codex] [--runtime-version version] [--provider overlay-id] [--integration id] [--destination absolute-path] [--scope project|user] [--legacy-version 0.7.1] [--dry-run|--apply]');
  const resolution = await resolveProfile(options);
  if (options.command === 'resolve') process.stdout.write(`${JSON.stringify(resolution)}\n`);
  else if (options.command === 'install') {
    if (!options.destination) throw new Error('install requires --destination');
    process.stdout.write(`${JSON.stringify({ resolution, install: await installProfile(resolution, options) })}\n`);
  } else if (options.command === 'update') {
    if (!options.destination) throw new Error('update requires --destination');
    const plan = await createUpdatePlan(options.destination, resolution);
    const applied = options.apply ? await applyUpdate(options.destination, resolution) : null;
    process.stdout.write(`${JSON.stringify({ command: 'update', dry_run: !options.apply, plan: applied?.plan ?? plan, applied: applied?.applied ?? false })}\n`);
  } else if (options.command === 'rollback') {
    if (!options.destination) throw new Error('rollback requires --destination');
    const plan = await createRollbackPlan(options.destination);
    const applied = options.apply ? await applyRollback(options.destination) : null;
    process.stdout.write(`${JSON.stringify({ command: 'rollback', dry_run: !options.apply, plan: applied?.plan ?? plan, applied: applied?.applied ?? false })}\n`);
  } else if (options.command === 'uninstall') {
    if (!options.destination) throw new Error('uninstall requires --destination');
    const plan = await createUninstallPlan(options.destination);
    const applied = options.apply ? await applyUninstall(options.destination) : null;
    process.stdout.write(`${JSON.stringify({ command: 'uninstall', dry_run: !options.apply, plan: applied?.plan ?? plan, applied: applied?.applied ?? false })}\n`);
  } else if (options.command === 'migrate') {
    if (!options.destination) throw new Error('migrate requires --destination');
    if (!options.apply) throw new Error('migrate requires --apply after status confirms a legacy installation');
    const migrated = await migrateLegacyInstallation(options.destination, resolution, options);
    process.stdout.write(`${JSON.stringify({ command: 'migrate', applied: true, migrated })}\n`);
  } else {
    if (!options.destination) throw new Error(`${options.command} requires --destination`);
    const installation = await inspectInstallation(options.destination, resolution);
    const runtimeProfile = resolution.profile?.agent_runtime ?? null;
    const runtimeVersion = options.runtimeVersion ?? null;
    const versionState = runtimeProfile && runtimeVersion ? (runtimeProfile.version === runtimeVersion ? 'exact_profile_version' : 'recheck_required') : runtimeProfile ? 'runtime_version_not_reported' : 'not_certified';
    const report = {
      command: options.command,
      destination: options.destination,
      resolution: { resolution: resolution.resolution, certified: resolution.certified, reason: resolution.reason, runtime: resolution.runtime, profile_id: resolution.profile?.profile_id ?? null },
      installation: { state: installation.state, checked_files: installation.verification?.checked_files ?? 0, missing: installation.verification?.missing ?? [], modified: installation.verification?.modified ?? [], package: installation.manifest?.package ?? null },
      next_action: installation.next_action,
    };
    if (options.command === 'doctor') {
      report.environment = { platform: process.platform, arch: process.arch, node_version: process.version, runtime_version: runtimeVersion, expected_runtime_version: runtimeProfile?.version ?? null, runtime_version_state: versionState };
      report.evidence = { certification: resolution.profile?.certification ?? null, status: resolution.certified ? versionState : 'withheld', fallback_reason: resolution.resolution === 'profile' ? null : resolution.reason };
    }
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
