import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
    legacy_manifest: 'run status with the v0.7 package, then migrate explicitly before update',
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
    return { state: 'migration_required', destination, changes: [], conflicts: [], next_action: 'run migrate with an explicitly identified v0.7.1 installation before update' };
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

async function restoreManifest(destination, previousManifest, backupDirectory) {
  const { backup } = await restoreBackup(destination, backupDirectory);
  const current = await readInstallManifest(destination);
  const previousPaths = new Set(previousManifest.managed_files.map((file) => file.destination_path));
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

export async function applyUpdate(destination, resolution, { faultAfterChanges = null } = {}) {
  const plan = await createUpdatePlan(destination, resolution);
  if (plan.state === 'noop') return { applied: false, plan };
  if (plan.state !== 'ready') throw new Error(`update cannot apply while installation is ${plan.state}`);
  const current = await readInstallManifest(destination);
  const target = resolve(destination);
  const backup_directory = await makeBackup(target, current);
  const journal = { transaction_version: '1.0', operation: 'update', backup_directory, previous_install_id: current.install_id, target_install_id: plan.manifest.install_id };
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
    await restoreManifest(target, current, backup_directory);
    await rm(join(target, transactionName), { force: true });
    throw error;
  }
}

export async function createRollbackPlan(destination) {
  const manifest = await readInstallManifest(destination);
  const journal = await readJsonIfPresent(join(destination, transactionName));
  const backup_directory = journal?.backup_directory ?? manifest?.rollback?.backup_directory;
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
  const plan = await createRollbackPlan(destination);
  if (plan.state !== 'ready') throw new Error(`rollback cannot apply while state is ${plan.state}`);
  const { manifest: previous } = await restoreBackup(destination, plan.backup_directory);
  await restoreManifest(resolve(destination), previous, plan.backup_directory);
  await rm(join(destination, transactionName), { force: true });
  return { applied: true, plan, manifest: previous };
}

export async function migrateLegacyInstallation(destination, resolution, { legacyVersion, scope = 'project' } = {}) {
  if (legacyVersion !== '0.7.1') throw new Error('only explicitly identified v0.7.1 installations can be migrated');
  const legacy = await readInstallManifest(destination);
  if (!legacy || !['1.0', '3.0'].includes(legacy.manifest_version)) throw new Error('migration requires a v0.7 legacy install manifest');
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
  if (manifest.manifest_version !== '4.0') return { state: 'migration_required', destination, changes: [], conflicts: [], next_action: 'legacy ownership is not inferred; migrate only after an explicit v0.7.1 identification' };
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
