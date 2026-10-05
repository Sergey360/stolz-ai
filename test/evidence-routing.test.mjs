import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { createLazyCodexResolver, planSkillContext, selectRoutedSkill } from '../tools/routed-skills.mjs';
import { claudeCodeConformanceAdapter } from '../adapters/claude-code/adapter.mjs';
import { qwenCodeConformanceAdapter } from '../adapters/qwen-code/adapter.mjs';
import { resolveProfile } from '../tools/profile-resolver.mjs';

test('evidence route stays provider-neutral and loads detail only on request', async () => {
  const root = planSkillContext({ concern: 'evidence' });
  assert.equal(root.skill, 'stolz-evidence');
  assert.equal(root.reason, 'adapter_not_required');
  assert.deepEqual(root.instruction_reads, ['skills/stolz-evidence/SKILL.md']);
  const detailed = planSkillContext({ concern: 'evidence', needsReference: true });
  assert.deepEqual(detailed.references, [
    'skills/stolz-evidence/references/coverage-record.md',
    'skills/stolz-evidence/references/claim-review.md',
  ]);
  for (const path of detailed.instruction_reads) await access(path);
  assert.equal(detailed.instruction_reads.some((path) => path.includes('behavioral-evaluation')), false);
  assert.deepEqual(selectRoutedSkill({ concern: 'evidence', adapter: { capabilities: {} } }).missing, undefined);
});

test('all three lazy resolvers select evidence without invoking adapter loaders', async () => {
  let loads = 0;
  const loader = () => { loads += 1; throw new Error('must remain lazy'); };
  const resolvers = [createLazyCodexResolver(loader), claudeCodeConformanceAdapter.createLazyResolver(loader), qwenCodeConformanceAdapter.createLazyResolver(loader)];
  for (const resolve of resolvers) {
    const selected = await resolve({ concern: 'evidence', trigger: 'unrelated' });
    assert.equal(selected.skill, 'stolz-evidence');
    assert.equal(selected.route, 'provider-neutral');
    assert.equal(selected.reason, 'adapter_not_required');
  }
  assert.equal(loads, 0);
});

test('evidence remains outside five-skill managed profiles', async () => {
  for (const runtime of ['codex', 'claude-code', 'qwen-code']) {
    const resolution = await resolveProfile({ runtime });
    assert.equal(resolution.core_skills.length, 5);
    assert.equal(resolution.core_skills.includes('stolz-evidence'), false);
  }
  const source = await readFile('tools/profile-installer.mjs', 'utf8');
  assert.equal(source.includes('evidence-instructions'), false);
});
