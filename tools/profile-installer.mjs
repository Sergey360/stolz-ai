import { cp, lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNIVERSAL_SKILLS } from './profile-resolver.mjs';

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

export function createInstallManifest(resolution) {
  if (resolution.resolution !== 'profile') {
    return { manifest_version: '1.0', install_id: 'provider-neutral-fallback', profile_installations: [{ profile_id: 'provider-neutral-fallback', profile_kind: 'minimal', core_skills: [...UNIVERSAL_SKILLS], adapter: { adapter_id: 'none' }, optional_integrations: [], resolution: 'lazy' }] };
  }
  const installation = {
    profile_id: resolution.profile.profile_id,
    profile_kind: resolution.profile.profile_kind,
    core_skills: [...resolution.core_skills].sort(),
    adapter: resolution.adapter.adapter_id === 'none' ? { adapter_id: 'none' } : { adapter_id: resolution.adapter.adapter_id, version: resolution.adapter.adapter_version },
    optional_integrations: [...resolution.optional_integrations].sort().map((integration_id) => ({
      integration_id,
      trigger_id: integrationTrigger(integration_id),
      resolution: 'lazy',
    })),
    resolution: 'lazy',
  };
  const stable = JSON.stringify(installation);
  if (!resolution.profile.runtime_install) return { manifest_version: '1.0', install_id: `stolz-${createHash('sha256').update(stable).digest('hex').slice(0, 16)}`, profile_installations: [installation] };
  const runtimeInstall = resolution.profile.runtime_install;
  return {
    manifest_version: '3.0', install_id: `stolz-${createHash('sha256').update(stable).digest('hex').slice(0, 16)}`,
    profile_installations: [installation],
    runtime_installations: [{ profile_id: resolution.profile.profile_id, runtime_id: runtimeInstall.runtime_id, adapter_id: resolution.adapter.adapter_id, destination: runtimeInstall.destination, selected_only: true, adapter_activation: 'lazy', hooks: 'not_installed', mcp: 'not_installed', fallback: runtimeInstall.fallback }],
  };
}

function integrationTrigger(integrationId) {
  const triggers = {
    filesystem: 'integration:filesystem:approved-file-access',
    gitlab: 'integration:gitlab:approved-project-access',
    'benchmark-capture': 'integration:benchmark-capture:raw-evidence',
  };
  return triggers[integrationId];
}

export async function installProfile(resolution, { destination, dryRun = false } = {}) {
  const target = assertDestination(destination, resolution);
  const manifest = createInstallManifest(resolution);
  const files = selectedFiles(resolution);
  const plan = { destination: target, manifest, files };
  if (dryRun) return { ...plan, dry_run: true };

  await mkdir(target, { recursive: true });
  const destinationRoot = await realpath(target);
  for (const sourceRelative of files) {
    const source = resolve(root, sourceRelative);
    const destinationPath = resolve(destinationRoot, resolution.runtime === 'codex' ? sourceRelative : sourceRelative.slice('skills/'.length));
    if (!destinationPath.startsWith(`${destinationRoot}${sep}`)) throw new Error('refusing to write outside destination');
    await lstat(source);
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(source, destinationPath, { recursive: true, force: false, errorOnExist: true });
  }
  await writeFile(join(destinationRoot, 'install-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { ...plan, dry_run: false };
}
