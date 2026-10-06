import assert from 'node:assert/strict';
import { access, cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLazyCodexResolver, planSkillContext, selectRoutedSkill } from '../tools/routed-skills.mjs';
import { claudeCodeConformanceAdapter } from '../adapters/claude-code/adapter.mjs';
import { qwenCodeConformanceAdapter } from '../adapters/qwen-code/adapter.mjs';
import { resolveProfile } from '../tools/profile-resolver.mjs';

test('browser instruction planning isolates lifecycle and explicitly selected Desktop detail', async () => {
  assert.deepEqual(planSkillContext({ concern: 'none' }).instruction_reads, []);
  const root = planSkillContext({ concern: 'browser' });
  assert.equal(root.reason, 'adapter_not_required');
  assert.deepEqual(root.instruction_reads, ['skills/stolz-browser/SKILL.md']);
  const generic = planSkillContext({ concern: 'browser', needsReference: true });
  assert.deepEqual(generic.references, ['skills/stolz-browser/references/tab-lifecycle.md']);
  const desktop = planSkillContext({ concern: 'browser', needsReference: true, browserHost: 'codex-desktop' });
  assert.deepEqual(desktop.references, [...generic.references, 'skills/stolz-browser/references/codex-desktop.md']);
  assert.deepEqual(planSkillContext({ concern: 'browser', browserHost: 'codex-desktop' }).instruction_reads, root.instruction_reads);
  assert.deepEqual(planSkillContext({ concern: 'browser', needsReference: true, browserHost: 'other' }).references, generic.references);
  for (const path of desktop.instruction_reads) await access(path);
  assert.equal(selectRoutedSkill({ concern: 'browser', adapter: { capabilities: {} } }).skill, 'stolz-browser');
});

test('browser workflow selection never loads a runtime adapter or changes managed profiles', async () => {
  const loader = () => { throw new Error('browser workflow must not load an adapter'); };
  for (const resolver of [createLazyCodexResolver(loader), claudeCodeConformanceAdapter.createLazyResolver(loader), qwenCodeConformanceAdapter.createLazyResolver(loader)]) {
    assert.equal((await resolver({ concern: 'browser' })).reason, 'adapter_not_required');
  }
  for (const runtime of ['codex', 'claude-code', 'qwen-code']) {
    const profile = await resolveProfile({ runtime });
    assert.equal(profile.core_skills.length, 5);
    assert.equal(profile.core_skills.some((skill) => (typeof skill === 'string' ? skill : skill.skill_id) === 'stolz-browser'), false);
  }
});

test('standalone browser installation preserves every local reference without sibling adapters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stolz-browser-install-'));
  try {
    const destination = join(root, 'stolz-browser');
    await cp('skills/stolz-browser', destination, { recursive: true, errorOnExist: true });
    for (const path of ['SKILL.md', 'references/tab-lifecycle.md', 'references/codex-desktop.md']) {
      const source = await readFile(join(destination, path), 'utf8');
      for (const [, target] of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const parent = path.includes('/') ? join(destination, 'references') : destination;
        await access(join(parent, target));
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
