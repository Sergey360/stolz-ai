import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const registry = await readJson('contracts/multi-runtime-evidence-v0.7/registry.json');
const contract = await readFile('docs/MULTI_RUNTIME_EVIDENCE_CONTRACTS_V0.7.md', 'utf8');
const normalizedContract = contract.replace(/\s+/g, ' ');

test('v0.7 registry is closed and every contract is Draft 2020-12 valid', async () => {
  assert.equal(registry.schema_version, '0.7.0');
  assert.equal(registry.retention_policy, 'sanitized_allowlist_only');
  assert.deepEqual(registry.contracts.map(({ schema_id }) => schema_id), ['runtime-telemetry-c2', 'provider-pair-c3', 'certification-lifecycle']);
  for (const entry of registry.contracts) {
    const schema = await readJson(entry.path);
    assert.equal(new Ajv2020({ strict: false }).compile(schema).schema.$id, schema.$id);
  }
});

test('v0.7 expressly binds C2 to Claude Code/Qwen Code and exact versions', () => {
  assert.match(contract, /Claude Code.*`claude-code`/s);
  assert.match(contract, /Qwen Code.*`qwen-code`/s);
  assert.match(normalizedContract, /exact supported semantic version/);
  assert.match(normalizedContract, /version range, `latest`, inferred version.*withheld/);
});

test('provider overlays, C3 pair admission, lifecycle, and privacy have fail-closed terms', () => {
  for (const term of ['anthropic-api', 'alibaba-model-studio', '`zai`', 'exactly two distinct raw provider exports', 'equal outcome identity', 'equal verification identity', '`certified`, `stale`, `recheck_required`, `withheld`, and `revoked`', 'credentials,', 'prompts, responses, user data', 'private fixtures']) assert.ok(normalizedContract.includes(term), term);
  assert.ok(normalizedContract.includes('`admission: withheld`'));
  assert.match(normalizedContract, /Fresh valid evidence.*`recertify`/);
});

test('package and lockfile are locked to the v0.7.1 documentation patch', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.version, '0.9.0');
  const lock = await readJson('package-lock.json');
  assert.equal(lock.version, '0.9.0');
  assert.equal(lock.packages[''].version, '0.9.0');
  assert.ok(pkg.files.includes('!contracts/multi-runtime-evidence-v0.7/'));
  for (const readme of ['README.md', 'README.ru.md', 'README.nl.md', 'README.zh.md', 'README.he.md']) assert.ok(pkg.files.includes(readme), readme);
  assert.ok(!pkg.files.some((path) => path === 'docs/' || path.startsWith('docs/')));
});
