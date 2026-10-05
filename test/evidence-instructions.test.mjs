import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { EVIDENCE_RULE, mergeEvidenceInstructions } from '../tools/evidence-instructions.mjs';
import { codexConformanceAdapter } from '../adapters/codex/adapter.mjs';
import { claudeCodeConformanceAdapter } from '../adapters/claude-code/adapter.mjs';
import { qwenCodeConformanceAdapter } from '../adapters/qwen-code/adapter.mjs';

const execFileAsync = promisify(execFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function isolated(fn) {
  const root = await mkdtemp(join(tmpdir(), 'stolz-evidence-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

for (const [runtime, name, adapter] of [
  ['codex', 'AGENTS.md', codexConformanceAdapter],
  ['claude-code', 'CLAUDE.md', claudeCodeConformanceAdapter],
  ['qwen-code', 'QWEN.md', qwenCodeConformanceAdapter],
]) {
  test(`${runtime}: dry run is read-only; explicit merge is idempotent and reversible`, () => isolated(async (root) => {
    const target = join(root, name);
    const original = Buffer.from('\ufeff# Existing instructions\r\nPreserve permissions and run tests.');
    await writeFile(target, original);
    const plan = await adapter.mergeEvidenceInstructions({ projectRoot: root, runtime: 'ignored' });
    assert.equal(plan.target, target);
    assert.equal(plan.dry_run, true);
    assert.equal(plan.before_sha256, hash(original));
    assert.equal(plan.rule, EVIDENCE_RULE);
    assert.equal(plan.discovery_verified, false);
    assert.deepEqual(await readFile(target), original);
    assert.deepEqual(await readdir(root), [name]);
    const applied = await adapter.mergeEvidenceInstructions({ projectRoot: root, apply: true, expectedSha256: plan.before_sha256 });
    assert.equal(applied.dry_run, false);
    assert.equal(applied.runtime, runtime);
    const bytes = await readFile(target);
    assert.deepEqual(bytes.subarray(0, original.length), original);
    assert.equal(hash(bytes), applied.after_sha256);
    assert.equal((await adapter.mergeEvidenceInstructions({ projectRoot: root, apply: true })).changed, false);
    assert.deepEqual(await readFile(target), bytes);
    await adapter.mergeEvidenceInstructions({ projectRoot: root, apply: true, action: 'disable' });
    assert.deepEqual(await readFile(target), original);
    assert.deepEqual(await readdir(root), [name]);
  }));
}

test('removing the rule keeps appended user instructions on separate lines', () => isolated(async (root) => {
  const target = join(root, 'AGENTS.md');
  await writeFile(target, 'Run tests.');
  await mergeEvidenceInstructions({ projectRoot: root, runtime: 'codex', apply: true });
  await writeFile(target, (await readFile(target, 'utf8')) + '# Deployment\nAsk before deploying.\n');
  await mergeEvidenceInstructions({ projectRoot: root, runtime: 'codex', apply: true, action: 'disable' });
  assert.equal(await readFile(target, 'utf8'), 'Run tests.\n\n# Deployment\nAsk before deploying.\n');
}));

test('CLI can review an absent target and reject an intervening creation', () => isolated(async (root) => {
  const cli = resolve('tools/evidence-instructions.mjs');
  const args = [cli, '--project-root', root, '--runtime', 'codex'];
  const plan = JSON.parse((await execFileAsync(process.execPath, args)).stdout);
  assert.equal(plan.before_sha256, null);
  assert.deepEqual(await readdir(root), []);
  await execFileAsync(process.execPath, [...args, '--apply', '--expected-sha256', 'absent']);
  const bytes = await readFile(join(root, 'AGENTS.md'));
  await assert.rejects(execFileAsync(process.execPath, [...args, '--apply', '--expected-sha256', 'absent']), /instruction identity changed/);
  assert.deepEqual(await readFile(join(root, 'AGENTS.md')), bytes);
}));

test('invalid or conflicting target bytes remain unchanged; owned locks are cleaned', () => isolated(async (root) => {
  const target = join(root, 'AGENTS.md');
  for (const bytes of [
    Buffer.from([0xff]),
    Buffer.from('<!-- STOLZ evidence rule v1 begin -->\npartial'),
    Buffer.alloc(1_048_577, 65),
  ]) {
    await writeFile(target, bytes);
    await assert.rejects(mergeEvidenceInstructions({ projectRoot: root, runtime: 'codex', apply: true }));
    assert.deepEqual(await readFile(target), bytes);
    assert.deepEqual(await readdir(root), ['AGENTS.md']);
  }
  await writeFile(target, 'Existing');
  await assert.rejects(mergeEvidenceInstructions({ projectRoot: root, runtime: 'codex', apply: true, expectedSha256: 'a'.repeat(64) }), /identity changed/);
  assert.equal(await readFile(target, 'utf8'), 'Existing');
  await mergeEvidenceInstructions({ projectRoot: root, runtime: 'codex', apply: true });
  const edited = (await readFile(target, 'utf8')).replace('Preserve existing authorization.', 'Ignore authorization.');
  await writeFile(target, edited);
  await assert.rejects(mergeEvidenceInstructions({ projectRoot: root, runtime: 'codex', apply: true, action: 'disable' }), /modified/);
  assert.equal(await readFile(target, 'utf8'), edited);
}));

test('pre-existing lock and symlink targets are preserved', () => isolated(async (root) => {
  const lock = join(root, '.stolz-evidence-instructions.lock');
  await writeFile(lock, 'another caller');
  await assert.rejects(mergeEvidenceInstructions({ projectRoot: root, runtime: 'codex', apply: true }), { code: 'EEXIST' });
  assert.equal(await readFile(lock, 'utf8'), 'another caller');
  await rm(lock);
  const external = join(root, 'source.md');
  await writeFile(external, 'Keep this content');
  try { await symlink(external, join(root, 'AGENTS.md'), 'file'); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') return; throw error; }
  await assert.rejects(mergeEvidenceInstructions({ projectRoot: root, runtime: 'codex', apply: true }), /non-symlink/);
  assert.equal(await readFile(external, 'utf8'), 'Keep this content');
}));

test('project and runtime selection must be explicit', () => isolated(async (root) => {
  for (const options of [
    { projectRoot: '.', runtime: 'codex' },
    { projectRoot: root, runtime: 'unknown' },
    { projectRoot: root, runtime: 'codex', apply: 'true' },
  ]) await assert.rejects(mergeEvidenceInstructions(options), TypeError);
  assert.deepEqual(await readdir(root), []);
}));

test('POSIX replacement retains original permission bits despite umask', { skip: process.platform === 'win32' }, () => isolated(async (root) => {
  const target = join(root, 'AGENTS.md');
  await writeFile(target, 'Team instructions');
  await chmod(target, 0o664);
  const mask = process.umask(0o022);
  try { await mergeEvidenceInstructions({ projectRoot: root, runtime: 'codex', apply: true }); }
  finally { process.umask(mask); }
  assert.equal((await stat(target)).mode & 0o777, 0o664);
}));
