import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('v0.19 canonical evidence covers nine skills and the actual v0.18 predecessor', async () => {
  const inventory = (await readFile('.github/releases/stolz-ai-0.19.0.tgz.inventory.txt', 'utf8')).trim().split(/\r?\n/);
  assert.equal(inventory.length, 214);
  for (const file of ['SKILL.md', 'references/catalog-and-measurement.md', 'references/execution-and-results.md']) assert.ok(inventory.includes('package/skills/stolz-mcp/'+file));
  assert.match(await readFile('.github/releases/stolz-ai-0.19.0.tgz.sha256', 'utf8'), /^cdde8bad689c9247c7b1ab406f193f876ebb4f8e8694d0dff94055b4529d501a\s+stolz-ai-0\.19\.0\.tgz/m);
  for (const platform of ['windows', 'linux']) {
    const result = JSON.parse(await readFile(`.github/releases/public-package-smoke-${platform}-v0.19.0.json`, 'utf8'));
    assert.equal(result.status, 'passed');
    assert.equal(result.package_version, '0.19.0');
    assert.ok(result.scenarios.includes('separate_mcp_installation'));
    assert.ok(result.scenarios.includes('mcp_bridge_null_and_projection'));
  }
  const predecessor = JSON.parse(await readFile('.github/releases/actual-predecessor-smoke-v0.19.0.json', 'utf8'));
  assert.equal(predecessor.status, 'passed');
  assert.equal(predecessor.predecessor_version, '0.18.0');
  assert.equal(predecessor.candidate_version, '0.19.0');
  assert.ok(predecessor.scenarios.includes('rollback_to_actual_v018'));
});
