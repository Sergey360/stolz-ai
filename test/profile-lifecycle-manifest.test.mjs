import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyUpdate, createInstallManifest, readInstallManifest, verifyInstallManifest } from '../tools/profile-lifecycle.mjs';
import { installProfile } from '../tools/profile-installer.mjs';
import { resolveProfile } from '../tools/profile-resolver.mjs';

test('v0.8 manifest records package, scope, and every owned file hash', async () => {
  const resolution = await resolveProfile({ runtime: 'claude-code', capabilities: { command_execution: true } });
  const manifest = await createInstallManifest(resolution, { scope: 'project' });
  assert.equal(manifest.manifest_version, '4.0');
  assert.deepEqual(manifest.package, { name: 'stolz-ai', version: '0.9.0' });
  assert.deepEqual(manifest.installation, { scope: 'project', runtime_id: 'claude-code', destination_layout: 'runtime-skills-root' });
  assert.ok(manifest.managed_files.length >= 10);
  assert.equal(new Set(manifest.managed_files.map(({ destination_path }) => destination_path)).size, manifest.managed_files.length);
  for (const file of manifest.managed_files) {
    assert.match(file.source_path, /^skills\//);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(file.bytes > 0);
  }
});

test('manifest verification distinguishes healthy, modified, partial, and legacy installations', async () => {
  const resolution = await resolveProfile({ runtime: 'claude-code', capabilities: { command_execution: true } });
  const root = await mkdtemp(join(tmpdir(), 'stolz-lifecycle-manifest-'));
  const destination = join(root, '.claude', 'skills');
  const installed = await installProfile(resolution, { destination });
  assert.equal((await verifyInstallManifest(destination, installed.manifest)).state, 'healthy');
  const changed = installed.manifest.managed_files[0].destination_path;
  await writeFile(join(destination, changed), 'local edit', 'utf8');
  assert.deepEqual(await verifyInstallManifest(destination, installed.manifest), {
    state: 'modified', checked_files: installed.manifest.managed_files.length, missing: [], modified: [changed],
  });
  await mkdir(join(destination, 'foreign-skill'));
  assert.equal((await verifyInstallManifest(destination, installed.manifest)).state, 'modified');
  await writeFile(join(destination, 'install-manifest.json'), JSON.stringify({ manifest_version: '3.0' }), 'utf8');
  assert.equal((await verifyInstallManifest(destination, await readInstallManifest(destination))).state, 'legacy_manifest');
});

test('an interrupted owned-file update restores the previous bytes and leaves no recovery journal', async () => {
  const resolution = await resolveProfile({ runtime: 'claude-code', capabilities: { command_execution: true } });
  const root = await mkdtemp(join(tmpdir(), 'stolz-lifecycle-interrupt-'));
  const destination = join(root, '.claude', 'skills');
  const installed = await installProfile(resolution, { destination });
  const path = 'stolz-context/local-owned.txt';
  const content = 'owned test file';
  await writeFile(join(destination, path), content, 'utf8');
  const extended = { ...installed.manifest, managed_files: [...installed.manifest.managed_files, { source_path: 'skills/stolz-context/local-owned.txt', destination_path: path, sha256: createHash('sha256').update(content).digest('hex'), bytes: Buffer.byteLength(content) }] };
  await writeFile(join(destination, 'install-manifest.json'), JSON.stringify(extended), 'utf8');

  await assert.rejects(() => applyUpdate(destination, resolution, { faultAfterChanges: 1 }), /injected update interruption/);
  assert.equal(await readFile(join(destination, path), 'utf8'), content);
  assert.deepEqual(JSON.parse(await readFile(join(destination, 'install-manifest.json'), 'utf8')), extended);
  await assert.rejects(() => readFile(join(destination, '.stolz-transaction.json'), 'utf8'));
});
