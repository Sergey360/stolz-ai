import { cp, lstat, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInstallManifest, installManifestPath, readInstallManifest, verifyInstallManifest } from './profile-lifecycle.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function assertDestination(destination, resolution) {
  if (typeof destination !== 'string' || !isAbsolute(destination)) throw new TypeError('destination must be an absolute path');
  const target = resolve(destination);
  if (target === root || !relative(root, target)) throw new Error('destination must be isolated from the repository root');
  const runtime = resolution?.runtime;
  const canonical = {
    'claude-code': ['.claude', 'skills'],
    'qwen-code': ['.qwen', 'skills'],
  }[runtime];
  if (canonical) {
    const parent = basename(dirname(target));
    if (parent !== canonical[0] || basename(target) !== canonical[1]) {
      throw new Error(`destination must be a canonical ${runtime} skill path`);
    }
  }
  return target;
}

function selectedFiles(resolution) {
  // Adapters remain resolvable declarations in the manifest, not installed
  // context. The runtime imports one only after its capability trigger.
  return [...resolution.core_skills].map((skill) => `skills/${skill}`).sort();
}

export { createInstallManifest } from './profile-lifecycle.mjs';

export async function installProfile(resolution, { destination, dryRun = false, scope = 'project' } = {}) {
  const target = assertDestination(destination, resolution);
  const manifest = await createInstallManifest(resolution, { scope });
  const files = selectedFiles(resolution);
  const plan = { destination: target, manifest, files };
  if (dryRun) return { ...plan, dry_run: true };

  const existing = await readInstallManifest(target);
  if (existing) {
    const verification = await verifyInstallManifest(target, existing);
    if (verification.state === 'healthy' && existing.install_id === manifest.install_id) return { ...plan, dry_run: false, idempotent: true };
    throw new Error(`existing installation is ${verification.state}; use status, update, or uninstall before install`);
  }

  await mkdir(target, { recursive: true });
  const destinationRoot = await realpath(target);
  const created = [];
  try {
    for (const sourceRelative of files) {
      const source = resolve(root, sourceRelative);
      const destinationPath = resolve(destinationRoot, resolution.runtime === 'codex' ? sourceRelative : sourceRelative.slice('skills/'.length));
      if (!destinationPath.startsWith(`${destinationRoot}${sep}`)) throw new Error('refusing to write outside destination');
      await lstat(source);
      await mkdir(dirname(destinationPath), { recursive: true });
      await cp(source, destinationPath, { recursive: true, force: false, errorOnExist: true });
      created.push(destinationPath);
    }
    await writeFile(installManifestPath(destinationRoot), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } catch (error) {
    await Promise.all(created.reverse().map((path) => rm(path, { recursive: true, force: true })));
    throw error;
  }
  return { ...plan, dry_run: false, idempotent: false };
}
