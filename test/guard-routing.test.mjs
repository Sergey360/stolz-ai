import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLazyCodexResolver, planSkillContext, selectRoutedSkill } from '../tools/routed-skills.mjs';
import { resolveProfile, UNIVERSAL_SKILLS } from '../tools/profile-resolver.mjs';

test('guard loads only its root until detailed review rules are requested', () => {
  const simple = planSkillContext({ concern: 'guard' });
  assert.equal(simple.skill, 'stolz-guard');
  assert.equal(simple.route, 'provider-neutral');
  assert.deepEqual(simple.instruction_reads, ['skills/stolz-guard/SKILL.md']);
  assert.deepEqual(planSkillContext({ concern: 'guard', needsReference: true }).instruction_reads, [
    'skills/stolz-guard/SKILL.md', 'skills/stolz-guard/references/review-rules.md',
  ]);
  assert.deepEqual(planSkillContext({ concern: 'none' }).instruction_reads, []);
});

test('guard needs no adapter and cannot invoke an adapter loader', async () => {
  let loads = 0;
  const lazy = createLazyCodexResolver(() => { loads += 1; throw new Error('adapter must not load'); });
  for (const profile of [undefined, { adapter: { adapter_id: 'codex-local', resolution: 'lazy' } }]) {
    const selected = await lazy({ concern: 'guard', profile, trigger: 'runtime-capability:' });
    assert.equal(selected.reason, 'adapter_not_required');
    assert.deepEqual(selected, selectRoutedSkill({ concern: 'guard', adapter: { capabilities: {} } }));
  }
  assert.equal(loads, 0);
});

test('mutating a returned guard reference list does not change later plans', () => {
  selectRoutedSkill({ concern: 'guard' }).references.length = 0;
  assert.equal(planSkillContext({ concern: 'guard', needsReference: true }).references.length, 1);
});

test('managed profiles retain their existing optimization inventory', async () => {
  assert.equal(UNIVERSAL_SKILLS.length, 5);
  for (const runtime of ['codex', 'claude-code', 'qwen-code']) {
    const profile = await resolveProfile({ runtime, capabilities: { command_execution: true } });
    assert.deepEqual(profile.core_skills, [...UNIVERSAL_SKILLS]);
    assert.ok(!profile.core_skills.includes('stolz-guard'));
  }
});

test('manual guard installation is self-contained in a runtime skill directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stolz-guard-install-'));
  try {
    for (const runtimeDirectory of ['.agents', '.claude', '.qwen']) {
      const destination = join(root, runtimeDirectory, 'skills', 'stolz-guard');
      await cp('skills/stolz-guard', destination, { recursive: true, errorOnExist: true });
      const entrypoint = await readFile(join(destination, 'SKILL.md'), 'utf8');
      for (const [, reference] of entrypoint.matchAll(/\[[^\]]+\]\((references\/[^)]+)\)/g)) {
        const source = await readFile(join('skills/stolz-guard', reference));
        assert.deepEqual(await readFile(join(destination, reference)), source);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
