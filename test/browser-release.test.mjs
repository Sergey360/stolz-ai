import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
const run = promisify(execFile);
test('v0.18 canonical evidence covers eight skills and real predecessor continuation', async () => {
  const inventory = (await readFile('.github/releases/stolz-ai-0.18.0.tgz.inventory.txt', 'utf8')).trim().split(/\r?\n/);
  assert.equal(inventory.length, 209);
  for (const file of ['SKILL.md','references/tab-lifecycle.md','references/codex-desktop.md']) assert.ok(inventory.includes('package/skills/stolz-browser/'+file));
  assert.match(await readFile('.github/releases/stolz-ai-0.18.0.tgz.sha256', 'utf8'), /^6b775d6ef7bd3f98e5c17fa0f0777918690213f49a2bfaa30a66ff4467c2b088\s+stolz-ai-0\.18\.0\.tgz/m);
  for (const platform of ['windows','linux']) {
    const result = JSON.parse(await readFile(`.github/releases/public-package-smoke-${platform}-v0.18.0.json`, 'utf8'));
    assert.equal(result.status, 'passed');
    assert.equal(result.package_version, '0.18.0');
    assert.ok(result.scenarios.includes('separate_browser_installation'));
  }
  const actual = JSON.parse(await readFile('.github/releases/actual-predecessor-smoke-v0.18.0.json','utf8'));
  assert.equal(actual.status,'passed'); assert.equal(actual.predecessor,'0.17.0'); assert.equal(actual.current,'0.18.0');
  assert.ok(actual.scenarios.includes('manual_browser_preserved'));
});
test('actual public pack inputs contain no recognized personal operational locators', async () => {
  const npmArgs = process.env.npm_execpath ? [process.env.npm_execpath] : process.platform === 'win32' ? [resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')] : [];
  const command = npmArgs.length ? process.execPath : 'npm';
  const {stdout} = await run(command,[...npmArgs,'pack','--dry-run','--json','--ignore-scripts']);
  const paths = JSON.parse(stdout)[0].files.map(file=>file.path);
  const patterns = [/(?:\b[A-Z]:[\\/](?:Users[\\/]|(?!absolute[\\/]|path[\\/]|example[\\/])[A-Za-z][^\s"'`<>]*[\\/])|(?<![A-Za-z0-9_./])\/(?:Users|home)\/(?!example(?:-user)?[\\/]|user[\\/]|placeholder[\\/])[^\s/"'`<>]+[\\/])/i, /\b01[a-f0-9]{6}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i, /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\.dmp|_sidecar\.json)\b/i, /codex-session-recovery/];
  for (const path of paths) {
    const content = (await readFile(path,'utf8')).replace(/\\\\/g,'\\');
    assert.equal(patterns.some(pattern=>pattern.test(content)),false,`${path}: private operational locator`);
  }
});
