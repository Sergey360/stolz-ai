import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { planSkillContext, prepareContext, selectRoutedSkill } from '../tools/routed-skills.mjs';

// Concern labels are explicit caller decisions, not predictions from these prompts.
const scenarios = [
  ['Fix an installer typo', 'none', false, null, []],
  ['Explain one source file', 'none', false, null, []],
  ['Tell me the current job status once', 'none', false, null, []],
  ['Run the affected unit test for the first time', 'none', false, null, []],
  ['Identify the skill for a manifest problem', 'context', false, 'stolz-context', []],
  ['Validate a manifest with a changed source identity', 'context', true, 'stolz-context', ['manifest-and-reads.md']],
  ['May this earlier command result replace a new run?', 'reuse', true, 'stolz-reuse', ['ledger-and-invalidation.md']],
  ['Coalesce a command already running for these inputs', 'reuse', true, 'stolz-reuse', ['ledger-and-invalidation.md']],
  ['Diagnose duplicate terminal wakes after restart', 'state', true, 'stolz-quiet-state', ['material-transitions.md']],
  ['Locate the skill for paired efficiency evidence', 'benchmark', false, 'stolz-benchmark', []],
  ['Admit a benchmark of quiet-state behavior', 'benchmark', true, 'stolz-benchmark', ['outcome-gates.md']],
  ['Choose between provenance and cached-result decisions', 'unclear', true, 'stolz-route', ['route-selection.md']],
  ['Optimize this without naming the decision yet', undefined, false, 'stolz-route', []],
];

for (const [prompt, concern, needsReference, skill, detailNames] of scenarios) {
  test(`bounded instruction plan: ${prompt}`, async () => {
    const plan = planSkillContext({ concern, needsReference });
    assert.equal(plan.skill, skill);
    assert.deepEqual(plan.references.map((path) => path.split('/').at(-1)), detailNames);
    assert.equal(plan.instruction_reads.length, (skill ? 1 : 0) + detailNames.length);
    for (const path of plan.instruction_reads) {
      assert.ok(path.startsWith(`skills/${skill}/`), 'only the current skill may be opened');
      await access(path);
    }
  });
}

test('conditional plan controls manifest reference reads without changing source requirements', () => {
  const identity = { id: 'source', sha256: 'a'.repeat(64), version: '1' };
  const reference = { ...identity, id: 'skills/stolz-context/references/manifest-and-reads.md' };
  const unrelated = { ...identity, id: 'skills/stolz-reuse/references/ledger-and-invalidation.md' };
  const manifest = { task_id: 'context-plan', selected_route: 'stolz-context', source_artifacts: [identity], invalidation_inputs: [identity], conditional_references: [reference, unrelated] };
  const rootOnly = prepareContext(manifest, planSkillContext({ concern: 'context' }));
  assert.deepEqual(rootOnly.reads.map(({ id }) => id), ['source']);
  const withRules = prepareContext(manifest, planSkillContext({ concern: 'context', needsReference: true }));
  assert.deepEqual(withRules.reads.map(({ id }) => id), ['source', reference.id]);
  assert.equal(prepareContext({ ...manifest, source_artifacts: [] }, planSkillContext({ concern: 'context' })).ok, false);
});

test('fallback keeps capability gates and legacy allowlists independent of read planning', () => {
  const adapter = { adapter_id: 'minimal', provider: 'example', capabilities: { artifact_identity: true, command_execution: false, durable_state: false, measurement_capture: false } };
  const plan = planSkillContext({ concern: 'reuse', adapter });
  assert.equal(plan.route, 'provider-neutral');
  assert.equal(plan.reason, 'missing_capabilities');
  assert.deepEqual(plan.missing, ['command_execution']);
  assert.deepEqual(plan.references, []);
  const detailed = planSkillContext({ concern: 'reuse', needsReference: true });
  detailed.references.length = 0;
  assert.equal(selectRoutedSkill({ concern: 'reuse' }).references.length, 1);
  assert.throws(() => planSkillContext({ needsReference: 'false' }), TypeError);
});
