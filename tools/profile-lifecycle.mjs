import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestName = 'install-manifest.json';
const transactionName = '.stolz-transaction.json';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isSafeRelativePath(path) {
  return typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.split(/[\\/]/).includes('..');
}

function destinationPath(resolution, sourcePath) {
  return resolution.runtime === 'codex' ? sourcePath : sourcePath.slice('skills/'.length);
}

async function managedFilesForDirectory(sourceDirectory, sourcePrefix, resolution) {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const source = join(sourceDirectory, entry.name);
    const sourcePath = `${sourcePrefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await managedFilesForDirectory(source, sourcePath, resolution));
    else if (entry.isFile()) {
      const content = await readFile(source);
      files.push({ source_path: sourcePath, destination_path: destinationPath(resolution, sourcePath), sha256: sha256(content), bytes: content.length });
    } else {
      throw new Error(`managed source must be a regular file or directory: ${sourcePath}`);
    }
  }
  return files;
}

export async function managedFilesFor(resolution) {
  const roots = [...resolution.core_skills].map((skill) => `skills/${skill}`).sort();
  const files = [];
  for (const sourcePath of roots) {
    const source = resolve(root, sourcePath);
    const sourceInfo = await lstat(source);
    if (!sourceInfo.isDirectory()) throw new Error(`managed skill directory is missing: ${sourcePath}`);
    files.push(...await managedFilesForDirectory(source, sourcePath, resolution));
  }
  return files.sort((left, right) => left.destination_path.localeCompare(right.destination_path));
}

async function sourcePackage() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  return { name: pkg.name, version: pkg.version };
}

export async function createInstallManifest(resolution, { scope = 'project', packageIdentity = null } = {}) {
  if (!['project', 'user'].includes(scope)) throw new TypeError('scope must be project or user');
  const installedPackage = packageIdentity ?? await sourcePackage();
  const managed_files = await managedFilesFor(resolution);
  const profile_installations = resolution.resolution === 'profile'
    ? [{
      profile_id: resolution.profile.profile_id,
      profile_kind: resolution.profile.profile_kind,
      core_skills: [...resolution.core_skills].sort(),
      adapter: resolution.adapter.adapter_id === 'none' ? { adapter_id: 'none' } : { adapter_id: resolution.adapter.adapter_id, version: resolution.adapter.adapter_version },
      optional_integrations: [...resolution.optional_integrations].sort().map((integration_id) => ({ integration_id, trigger_id: integrationTrigger(integration_id), resolution: 'lazy' })),
      resolution: 'lazy',
    }]
    : [{ profile_id: 'provider-neutral-fallback', profile_kind: 'minimal', core_skills: [...resolution.core_skills].sort(), adapter: { adapter_id: 'none' }, optional_integrations: [], resolution: 'lazy' }];
  const installation = {
    scope,
    runtime_id: resolution.runtime,
    destination_layout: resolution.runtime === 'codex' ? 'nested-skills' : 'runtime-skills-root',
  };
  const runtime_installations = resolution.profile?.runtime_install
    ? [{ profile_id: resolution.profile.profile_id, runtime_id: resolution.profile.runtime_install.runtime_id, adapter_id: resolution.adapter.adapter_id, destination: resolution.profile.runtime_install.destination, selected_only: true, adapter_activation: 'lazy', hooks: 'not_installed', mcp: 'not_installed', fallback: resolution.profile.runtime_install.fallback }]
    : null;
  const identity = { package: installedPackage, installation, profile_installations, runtime_installations, managed_files };
  const manifest = {
    manifest_version: '4.0',
    install_id: `stolz-${sha256(JSON.stringify(identity)).slice(0, 16)}`,
    package: installedPackage,
    installation,
    profile_installations,
    managed_files,
  };
  if (runtime_installations) manifest.runtime_installations = runtime_installations;
  return manifest;
}

function profileLockProjection(resolution, packageIdentity) {
  const profile = resolution.profile;
  return {
    lock_version: '1.0',
    package: packageIdentity,
    runtime: {
      id: resolution.runtime,
      profile_id: profile?.profile_id ?? 'provider-neutral-fallback',
      profile_version: profile?.profile_version ?? null,
      declared_version: profile?.agent_runtime?.version ?? null,
      configuration_identity: profile?.configuration_identity ?? null,
    },
    selection: {
      resolution: resolution.resolution,
      core_skills: [...resolution.core_skills].sort(),
      adapter: resolution.adapter.adapter_id === 'none'
        ? { adapter_id: 'none' }
        : { adapter_id: resolution.adapter.adapter_id, version: resolution.adapter.adapter_version },
      optional_integrations: [...resolution.optional_integrations].sort(),
      provider_overlay: resolution.provider_overlay?.overlay_id ?? 'none',
    },
    compatibility: {
      cli_output_format: '1.0',
      unknown_lock_version: 'deny',
      configuration_drift: 'deny',
      model_identity_is_compatibility_evidence: false,
    },
  };
}

function hasSecretLikeKey(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => (
    /(?:token|secret|password|credential|authorization|api[_-]?key)/i.test(key)
    || hasSecretLikeKey(nested)
  ));
}

export async function createProfileLock(resolution, { packageIdentity = null } = {}) {
  const installedPackage = packageIdentity ?? await sourcePackage();
  const lock = profileLockProjection(resolution, installedPackage);
  if (hasSecretLikeKey(lock)) throw new Error('profile lock must not contain secret-like fields');
  return lock;
}

export async function writeProfileLock(lockPath, lock) {
  if (typeof lockPath !== 'string' || !isAbsolute(lockPath)) throw new TypeError('lockfile must be an absolute path');
  if (hasSecretLikeKey(lock)) throw new Error('profile lock must not contain secret-like fields');
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

export async function readProfileLock(lockPath) {
  if (typeof lockPath !== 'string' || !isAbsolute(lockPath)) throw new TypeError('lockfile must be an absolute path');
  try {
    return JSON.parse(await readFile(lockPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('profile lockfile is missing');
    throw new Error(`cannot read profile lockfile: ${error.message}`);
  }
}

function runtimeVersionReport(resolution, runtimeVersion) {
  const declared = resolution.profile?.agent_runtime?.version ?? null;
  const state = declared === null
    ? 'not_certified'
    : runtimeVersion === null || runtimeVersion === undefined
      ? 'runtime_version_not_reported'
      : runtimeVersion === declared
        ? 'exact_profile_version'
        : 'recheck_required';
  return { reported: runtimeVersion ?? null, declared, state };
}

export async function verifyProfileLock(lock, resolution, { runtimeVersion = null } = {}) {
  const environment = runtimeVersionReport(resolution, runtimeVersion);
  if (!lock || lock.lock_version !== '1.0') {
    return {
      state: 'unsupported_lock_version',
      differences: ['lock_version'],
      environment,
      next_action: 'regenerate the lock with the current STOLZ profile CLI',
    };
  }
  if (hasSecretLikeKey(lock)) {
    return {
      state: 'invalid_lock',
      differences: ['secret-like field'],
      environment,
      next_action: 'remove the secret-like field and regenerate the lock',
    };
  }
  const expected = await createProfileLock(resolution);
  const differences = [];
  for (const section of ['package', 'runtime', 'selection', 'compatibility']) {
    if (!isDeepStrictEqual(lock[section], expected[section])) differences.push(section);
  }
  if (differences.length > 0) {
    return {
      state: 'drift',
      differences,
      environment,
      next_action: 'review the resolved profile, then regenerate and commit the lock intentionally',
    };
  }
  if (environment.state === 'recheck_required') {
    return {
      state: 'environment_mismatch',
      differences: ['environment.runtime_version'],
      environment,
      next_action: 'use the provider-neutral skills and recheck this exact runtime and adapter tuple before claiming compatibility',
    };
  }
  return {
    state: 'healthy',
    differences: [],
    environment,
    next_action: environment.state === 'runtime_version_not_reported'
      ? 'configuration matches; report the runtime version separately before claiming exact compatibility'
      : 'no_action_required',
  };
}

function integrationTrigger(integrationId) {
  return {
    filesystem: 'integration:filesystem:approved-file-access',
    gitlab: 'integration:gitlab:approved-project-access',
    'benchmark-capture': 'integration:benchmark-capture:raw-evidence',
  }[integrationId];
}

export async function readInstallManifest(destination) {
  try {
    return JSON.parse(await readFile(join(destination, manifestName), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`cannot read ${manifestName}: ${error.message}`);
  }
}

export async function verifyInstallManifest(destination, manifest) {
  if (!manifest || manifest.manifest_version !== '4.0' || !Array.isArray(manifest.managed_files)) {
    return { state: manifest ? 'legacy_manifest' : 'missing_manifest', checked_files: 0, missing: [], modified: [] };
  }
  const target = resolve(destination);
  const missing = [];
  const modified = [];
  for (const file of manifest.managed_files) {
    if (!isSafeRelativePath(file.destination_path) || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      return { state: 'invalid_manifest', checked_files: 0, missing: [], modified: [] };
    }
    const candidate = resolve(target, file.destination_path);
    if (!candidate.startsWith(`${target}${sep}`)) return { state: 'invalid_manifest', checked_files: 0, missing: [], modified: [] };
    try {
      const info = await lstat(candidate);
      if (!info.isFile()) missing.push(file.destination_path);
      else if (sha256(await readFile(candidate)) !== file.sha256) modified.push(file.destination_path);
    } catch (error) {
      if (error?.code === 'ENOENT') missing.push(file.destination_path);
      else throw error;
    }
  }
  const state = missing.length > 0 ? 'partial' : modified.length > 0 ? 'modified' : 'healthy';
  return { state, checked_files: manifest.managed_files.length, missing, modified };
}

function nextAction(state) {
  return {
    healthy: 'no_action_required',
    modified: 'run update --dry-run after reviewing local modifications',
    partial: 'run doctor, then update --dry-run or restore from rollback evidence',
    outdated: 'run update --dry-run to review the replacement plan',
    legacy_manifest: 'identify a supported historical installation, then migrate explicitly before update',
    missing: 'run install --dry-run and review the selected profile',
    unmanaged_destination: 'choose an empty destination or remove only files you own',
    invalid_manifest: 'do not mutate the destination; inspect or restore the manifest first',
  }[state] ?? 'inspect the reported state before changing files';
}

export async function inspectInstallation(destination, resolution) {
  if (await fileExists(join(destination, transactionName))) {
    return { state: 'recovery_required', manifest: await readInstallManifest(destination), verification: null, next_action: 'run rollback --dry-run, then rollback --apply to restore the recorded pre-update installation' };
  }
  const manifest = await readInstallManifest(destination);
  if (!manifest) {
    try {
      const entries = await readdir(destination);
      const state = entries.length === 0 ? 'missing' : 'unmanaged_destination';
      return { state, manifest: null, verification: null, next_action: nextAction(state) };
    } catch (error) {
      if (error?.code === 'ENOENT') return { state: 'missing', manifest: null, verification: null, next_action: nextAction('missing') };
      throw error;
    }
  }
  const verification = await verifyInstallManifest(destination, manifest);
  if (verification.state !== 'healthy') return { state: verification.state, manifest, verification, next_action: nextAction(verification.state) };
  const expected = await createInstallManifest(resolution, { scope: manifest.installation.scope });
  const state = manifest.install_id === expected.install_id ? 'healthy' : 'outdated';
  return { state, manifest, verification, next_action: nextAction(state) };
}

async function fileExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function createUpdatePlan(destination, resolution) {
  const inspection = await inspectInstallation(destination, resolution);
  if (inspection.state === 'legacy_manifest') {
    return { state: 'migration_required', destination, changes: [], conflicts: [], next_action: 'run migrate with an explicitly identified supported historical installation before update' };
  }
  if (inspection.state !== 'healthy' && inspection.state !== 'outdated') {
    return { state: inspection.state, destination, changes: [], conflicts: [...(inspection.verification?.missing ?? []), ...(inspection.verification?.modified ?? [])], next_action: inspection.next_action };
  }
  const current = inspection.manifest;
  const next = await createInstallManifest(resolution, { scope: current.installation.scope });
  const target = resolve(destination);
  const previousByPath = new Map(current.managed_files.map((file) => [file.destination_path, file]));
  const nextByPath = new Map(next.managed_files.map((file) => [file.destination_path, file]));
  const changes = [];
  const conflicts = [];

  for (const [path, file] of nextByPath) {
    const previous = previousByPath.get(path);
    if (!previous) {
      if (await fileExists(resolve(target, path))) conflicts.push({ path, reason: 'foreign_file_exists' });
      else changes.push({ action: 'create', path, sha256: file.sha256 });
    } else if (previous.sha256 !== file.sha256) {
      changes.push({ action: 'replace', path, from_sha256: previous.sha256, sha256: file.sha256 });
    }
  }
  for (const [path, previous] of previousByPath) {
    if (!nextByPath.has(path)) changes.push({ action: 'remove', path, sha256: previous.sha256 });
  }
  if (current.install_id !== next.install_id) changes.push({ action: 'replace_manifest', path: manifestName });
  const state = conflicts.length > 0 ? 'conflict' : changes.length > 0 ? 'ready' : 'noop';
  return { state, destination, current_package: current.package, target_package: next.package, changes, conflicts, manifest: next, next_action: state === 'ready' ? 'review this plan, then run update --apply' : state === 'noop' ? 'no_action_required' : 'resolve every conflict before update' };
}

function safeBackupDirectory(path) {
  return typeof path === 'string' && /^\.stolz-backups\/[a-zA-Z0-9._-]+$/.test(path);
}

async function writeOwnedFile(destination, file) {
  const source = resolve(root, file.source_path);
  const target = resolve(destination, file.destination_path);
  if (!target.startsWith(`${resolve(destination)}${sep}`)) throw new Error(`refusing to write outside destination: ${file.destination_path}`);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function makeBackup(destination, manifest) {
  const relativeDirectory = `.stolz-backups/${manifest.install_id}-${randomUUID()}`;
  const backup = resolve(destination, relativeDirectory);
  await mkdir(backup, { recursive: true });
  for (const file of manifest.managed_files) {
    const source = resolve(destination, file.destination_path);
    const target = resolve(backup, 'files', file.destination_path);
    if (!target.startsWith(`${backup}${sep}`)) throw new Error(`unsafe backup path: ${file.destination_path}`);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  await writeFile(join(backup, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return relativeDirectory;
}

async function restoreBackup(destination, backupDirectory) {
  if (!safeBackupDirectory(backupDirectory)) throw new Error('backup directory is not a STOLZ-owned backup path');
  const backup = resolve(destination, backupDirectory);
  const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8'));
  const verified = await verifyInstallManifest(backup, { ...manifest, managed_files: manifest.managed_files.map((file) => ({ ...file, destination_path: `files/${file.destination_path}` })) });
  if (verified.state !== 'healthy') throw new Error(`backup is ${verified.state}; refusing rollback`);
  return { backup, manifest };
}

async function restoreManifest(destination, previousManifest, backupDirectory, { removePaths = [] } = {}) {
  const { backup } = await restoreBackup(destination, backupDirectory);
  const current = await readInstallManifest(destination);
  const previousPaths = new Set(previousManifest.managed_files.map((file) => file.destination_path));
  for (const path of removePaths) {
    if (!previousPaths.has(path)) await rm(resolve(destination, path), { force: true });
  }
  for (const file of current?.managed_files ?? []) {
    if (!previousPaths.has(file.destination_path)) await rm(resolve(destination, file.destination_path), { force: true });
  }
  for (const file of previousManifest.managed_files) {
    const source = resolve(backup, 'files', file.destination_path);
    const target = resolve(destination, file.destination_path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  await writeFile(join(destination, manifestName), `${JSON.stringify(previousManifest, null, 2)}\n`, 'utf8');
}

export async function applyUpdate(destination, resolution, { faultAfterChanges = null, leaveInterruptedState = false } = {}) {
  const plan = await createUpdatePlan(destination, resolution);
  if (plan.state === 'noop') return { applied: false, plan };
  if (plan.state !== 'ready') throw new Error(`update cannot apply while installation is ${plan.state}`);
  const current = await readInstallManifest(destination);
  const target = resolve(destination);
  const backup_directory = await makeBackup(target, current);
  const journal = {
    transaction_version: '2.0',
    operation: 'update',
    backup_directory,
    previous_install_id: current.install_id,
    target_install_id: plan.manifest.install_id,
    target_managed_files: plan.manifest.managed_files.map((file) => ({ path: file.destination_path, sha256: file.sha256 })),
  };
  await writeFile(join(target, transactionName), `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  let mutations = 0;
  try {
    const nextByPath = new Map(plan.manifest.managed_files.map((file) => [file.destination_path, file]));
    for (const change of plan.changes) {
      if (change.action === 'create' || change.action === 'replace') {
        await writeOwnedFile(target, nextByPath.get(change.path));
        mutations += 1;
      } else if (change.action === 'remove') {
        await rm(resolve(target, change.path), { force: true });
        mutations += 1;
      }
      if (faultAfterChanges !== null && mutations >= faultAfterChanges) throw new Error('injected update interruption');
    }
    const appliedManifest = { ...plan.manifest, rollback: { previous_install_id: current.install_id, backup_directory } };
    await writeFile(join(target, manifestName), `${JSON.stringify(appliedManifest, null, 2)}\n`, 'utf8');
    await rm(join(target, transactionName), { force: true });
    return { applied: true, plan, manifest: appliedManifest };
  } catch (error) {
    if (leaveInterruptedState) throw error;
    try {
      await applyRecovery(target);
    } catch (recoveryError) {
      throw new Error(`${error.message}; automatic recovery failed: ${recoveryError.message}`);
    }
    throw error;
  }
}

async function currentOwnedFile(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile()) return { state: 'not_a_file', sha256: null };
    return { state: 'file', sha256: sha256(await readFile(path)) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'missing', sha256: null };
    throw error;
  }
}

function validTransactionTargetFiles(value) {
  return Array.isArray(value) && value.every((file) => (
    file && isSafeRelativePath(file.path) && /^[a-f0-9]{64}$/.test(file.sha256)
  ));
}

export async function createRecoveryPlan(destination) {
  const target = resolve(destination);
  const journal = await readJsonIfPresent(join(target, transactionName));
  if (!journal) {
    return { state: 'unavailable', destination: target, changes: [], conflicts: [], next_action: 'no interrupted STOLZ update is recorded' };
  }
  if (
    journal.transaction_version !== '2.0'
    || journal.operation !== 'update'
    || !safeBackupDirectory(journal.backup_directory)
    || !validTransactionTargetFiles(journal.target_managed_files)
  ) {
    return { state: 'invalid_transaction', destination: target, changes: [], conflicts: [], next_action: 'preserve the destination and inspect the transaction journal before changing files' };
  }
  let previous;
  try {
    ({ manifest: previous } = await restoreBackup(target, journal.backup_directory));
  } catch (error) {
    return { state: 'invalid_backup', destination: target, changes: [], conflicts: [], next_action: `preserve the destination; the recorded rollback snapshot cannot be verified: ${error.message}` };
  }
  if (previous.install_id !== journal.previous_install_id) {
    return { state: 'invalid_backup', destination: target, changes: [], conflicts: [], next_action: 'preserve the destination; the rollback snapshot does not match the interrupted transaction' };
  }
  const previousByPath = new Map(previous.managed_files.map((file) => [file.destination_path, file.sha256]));
  const targetByPath = new Map(journal.target_managed_files.map((file) => [file.path, file.sha256]));
  const conflicts = [];
  const paths = [...new Set([...previousByPath.keys(), ...targetByPath.keys()])].sort();
  for (const path of paths) {
    const current = await currentOwnedFile(resolve(target, path));
    if (current.state === 'missing') continue;
    const allowed = new Set([previousByPath.get(path), targetByPath.get(path)].filter(Boolean));
    if (current.state !== 'file' || !allowed.has(current.sha256)) {
      conflicts.push({ path, reason: 'unexpected_local_content', sha256: current.sha256 });
    }
  }
  const changes = [
    ...previous.managed_files.map((file) => ({ action: 'restore', path: file.destination_path })),
    ...journal.target_managed_files
      .filter((file) => !previousByPath.has(file.path))
      .map((file) => ({ action: 'remove_interrupted_create', path: file.path })),
    { action: 'replace_manifest', path: manifestName },
    { action: 'remove_transaction', path: transactionName },
  ];
  return {
    state: conflicts.length > 0 ? 'conflict' : 'ready',
    operation: 'recover_interrupted_update',
    destination: target,
    backup_directory: journal.backup_directory,
    previous_install_id: journal.previous_install_id,
    target_install_id: journal.target_install_id,
    changes,
    conflicts,
    next_action: conflicts.length > 0
      ? 'preserve or remove every conflicting local file, then rerun recover --dry-run'
      : 'review this plan, then run recover --apply',
  };
}

export async function applyRecovery(destination) {
  const target = resolve(destination);
  const plan = await createRecoveryPlan(target);
  if (plan.state !== 'ready') throw new Error(`recovery cannot apply while state is ${plan.state}`);
  const { manifest: previous } = await restoreBackup(target, plan.backup_directory);
  const removePaths = plan.changes
    .filter((change) => change.action === 'remove_interrupted_create')
    .map((change) => change.path);
  await restoreManifest(target, previous, plan.backup_directory, { removePaths });
  await rm(join(target, transactionName), { force: true });
  return { applied: true, plan, manifest: previous };
}

export async function createRollbackPlan(destination) {
  const recovery = await createRecoveryPlan(destination);
  if (recovery.state !== 'unavailable') return recovery;
  const manifest = await readInstallManifest(destination);
  const backup_directory = manifest?.rollback?.backup_directory;
  if (!manifest || !backup_directory) return { state: 'unavailable', destination, changes: [], conflicts: [], next_action: 'no STOLZ rollback snapshot is available' };
  const verification = await verifyInstallManifest(destination, manifest);
  if (verification.state !== 'healthy') return { state: 'conflict', destination, changes: [], conflicts: [...verification.missing, ...verification.modified], next_action: 'restore or remove local modifications before rollback' };
  const { manifest: previous } = await restoreBackup(destination, backup_directory);
  const currentPaths = new Set(manifest.managed_files.map((file) => file.destination_path));
  const previousPaths = new Set(previous.managed_files.map((file) => file.destination_path));
  const changes = [
    ...previous.managed_files.filter((file) => !currentPaths.has(file.destination_path)).map((file) => ({ action: 'create', path: file.destination_path })),
    ...previous.managed_files.filter((file) => currentPaths.has(file.destination_path)).map((file) => ({ action: 'restore', path: file.destination_path })),
    ...manifest.managed_files.filter((file) => !previousPaths.has(file.destination_path)).map((file) => ({ action: 'remove', path: file.destination_path })),
    { action: 'replace_manifest', path: manifestName },
  ];
  return { state: 'ready', destination, backup_directory, current_package: manifest.package, target_package: previous.package, changes, conflicts: [], next_action: 'review this plan, then run rollback --apply' };
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`cannot read transaction journal: ${error.message}`);
  }
}

export async function applyRollback(destination) {
  if (await fileExists(join(destination, transactionName))) return applyRecovery(destination);
  const plan = await createRollbackPlan(destination);
  if (plan.state !== 'ready') throw new Error(`rollback cannot apply while state is ${plan.state}`);
  const { manifest: previous } = await restoreBackup(destination, plan.backup_directory);
  await restoreManifest(resolve(destination), previous, plan.backup_directory);
  await rm(join(destination, transactionName), { force: true });
  return { applied: true, plan, manifest: previous };
}

export async function migrateLegacyInstallation(destination, resolution, { legacyVersion, scope = 'project' } = {}) {
  const supportedVersions = ['0.7.1', '0.8.0', '0.9.0', '0.10.0', '0.11.0', '0.12.0', '0.13.0'];
  if (!supportedVersions.includes(legacyVersion)) throw new Error(`unsupported historical version; identify one of: ${supportedVersions.join(', ')}`);
  const legacy = await readInstallManifest(destination);
  if (!legacy) throw new Error('migration requires an existing STOLZ install manifest');
  if (legacy.manifest_version === '4.0') {
    if (legacy.package?.name !== 'stolz-ai' || legacy.package?.version !== legacyVersion) throw new Error('historical manifest package identity does not match --legacy-version');
    const verification = await verifyInstallManifest(destination, legacy);
    if (verification.state !== 'healthy') throw new Error(`historical installation cannot be safely updated: ${verification.state}`);
    return { migrated: false, state: 'update_required', verification, next_action: 'ownership is already version 4; run update --dry-run, then update --apply' };
  }
  if (legacyVersion !== '0.7.1' || !['1.0', '3.0'].includes(legacy.manifest_version)) {
    throw new Error('only a v0.7.1 manifest version 1.0 or 3.0 can be adopted into version 4 ownership');
  }
  const legacyProfileId = legacy.profile_installations?.[0]?.profile_id;
  if (!legacyProfileId || legacyProfileId !== resolution.profile?.profile_id) throw new Error('legacy manifest profile does not match the selected runtime profile');
  const migrated = await createInstallManifest(resolution, { scope, packageIdentity: { name: 'stolz-ai', version: legacyVersion } });
  const verification = await verifyInstallManifest(destination, migrated);
  if (verification.state !== 'healthy') throw new Error(`legacy installation cannot be safely migrated: ${verification.state}`);
  await writeFile(join(destination, manifestName), `${JSON.stringify(migrated, null, 2)}\n`, 'utf8');
  return { migrated: true, manifest: migrated, verification };
}

export async function createUninstallPlan(destination) {
  const manifest = await readInstallManifest(destination);
  if (!manifest) return { state: 'missing', destination, changes: [], conflicts: [], next_action: 'no STOLZ manifest is present; no files will be removed' };
  if (manifest.manifest_version !== '4.0') return { state: 'migration_required', destination, changes: [], conflicts: [], next_action: 'legacy ownership is not inferred; migrate only after an explicit supported historical-version identification' };
  const verification = await verifyInstallManifest(destination, manifest);
  if (verification.state === 'modified' || verification.state === 'invalid_manifest') return { state: 'conflict', destination, changes: [], conflicts: verification.modified, next_action: 'preserve or move local modifications before uninstall' };
  if (!['healthy', 'partial'].includes(verification.state)) return { state: verification.state, destination, changes: [], conflicts: verification.missing, next_action: nextAction(verification.state) };
  const existing = [];
  for (const file of manifest.managed_files) {
    if (await fileExists(resolve(destination, file.destination_path))) existing.push({ action: 'remove', path: file.destination_path });
  }
  const backup = manifest.rollback?.backup_directory;
  if (backup && safeBackupDirectory(backup) && await fileExists(resolve(destination, backup))) existing.push({ action: 'remove_backup', path: backup });
  existing.push({ action: 'remove_manifest', path: manifestName });
  return { state: 'ready', destination, changes: existing, conflicts: [], next_action: 'review this plan, then run uninstall --apply' };
}

async function removeEmptyParents(destination, path) {
  const rootDirectory = resolve(destination);
  let current = dirname(resolve(destination, path));
  while (current.startsWith(`${rootDirectory}${sep}`)) {
    try {
      await rmdir(current);
      current = dirname(current);
    } catch (error) {
      if (['ENOTEMPTY', 'ENOENT'].includes(error?.code)) return;
      throw error;
    }
  }
}

export async function applyUninstall(destination) {
  const plan = await createUninstallPlan(destination);
  if (plan.state === 'missing') return { applied: false, plan };
  if (plan.state !== 'ready') throw new Error(`uninstall cannot apply while state is ${plan.state}`);
  const target = resolve(destination);
  for (const change of plan.changes) {
    if (change.action === 'remove') {
      await rm(resolve(target, change.path), { force: true });
      await removeEmptyParents(target, change.path);
    } else if (change.action === 'remove_backup') await rm(resolve(target, change.path), { recursive: true, force: true });
    else if (change.action === 'remove_manifest') await rm(join(target, manifestName), { force: true });
  }
  return { applied: true, plan };
}

export function installManifestPath(destination) {
  return join(destination, manifestName);
}
