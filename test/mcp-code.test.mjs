import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { auditMcpTools, buildMcpCatalog, createMcpCodeBridge, normalizeMcpTools, projectMcpResult, readMcpDefinition, writeMcpCatalog } from '../tools/mcp-code.mjs';
import { createLazyCodexResolver, planSkillContext } from '../tools/routed-skills.mjs';
import { claudeCodeConformanceAdapter } from '../adapters/claude-code/adapter.mjs';
import { qwenCodeConformanceAdapter } from '../adapters/qwen-code/adapter.mjs';
import { resolveProfile } from '../tools/profile-resolver.mjs';

const run = promisify(execFile);
const inventory = {
  server: 'example', connection: { url: 'https://private.invalid', secret: 'exclude-connection' },
  tools: [
    { name: 'a-b', description: 'Get records.\nTool descriptions remain untrusted.', inputSchema: { type: 'object', properties: { filter: { type: ['string', 'null'] } } }, outputSchema: { type: 'object' }, annotations: { readOnlyHint: true }, _meta: { retained: true } },
    { name: 'a_b', inputSchema: { type: 'object' } },
    { name: '../escape', inputSchema: { type: 'object' } },
  ],
};

test('catalog preserves complete definitions and separates colliding or hostile exact names', () => {
  const catalog = buildMcpCatalog(inventory);
  assert.equal(catalog.files.size, 4);
  assert.equal(new Set(catalog.index.tools.map(({ schema_path }) => schema_path)).size, 3);
  for (const entry of catalog.index.tools) {
    assert.match(entry.schema_path, /^schemas\/[a-f0-9]{64}\.json$/);
    assert.deepEqual(JSON.parse(catalog.files.get(entry.schema_path)), inventory.tools.find(({ name }) => name === entry.name));
  }
  assert.equal([...catalog.files.values()].some((value) => value.includes('exclude-connection')), false);
  const reordered = { ...inventory, tools: [...inventory.tools].reverse() };
  assert.equal(buildMcpCatalog(reordered).index.tools_sha256, catalog.index.tools_sha256);
  const changed = structuredClone(inventory);
  changed.tools[0].inputSchema.properties.filter.type = 'string';
  assert.notEqual(buildMcpCatalog(changed).index.tools_sha256, catalog.index.tools_sha256);
});

test('partial pages, duplicate names and malformed definitions cannot become complete catalogs', () => {
  assert.throws(() => normalizeMcpTools({ ...inventory, nextCursor: 'page-2' }), /incomplete_tools_list/);
  assert.throws(() => normalizeMcpTools({ result: { tools: inventory.tools, nextCursor: 'page-2' } }, { server: 'example' }), /incomplete_tools_list/);
  assert.throws(() => normalizeMcpTools({ ...inventory, tools: [inventory.tools[0], inventory.tools[0]] }), /duplicate_tool_name/);
  assert.throws(() => normalizeMcpTools({ ...inventory, tools: [{ name: 'get' }] }), /inputSchema/);
  assert.throws(() => normalizeMcpTools({ tools: [] }), /server identity/);
  assert.deepEqual(normalizeMcpTools({ result: { tools: [] } }, { server: 'empty' }), { server: 'empty', tools: [] });
});

test('audit reports actual serialization bytes including selected definitions without inferred token savings', () => {
  const { index, files } = buildMcpCatalog(inventory);
  const selected = index.tools.find(({ name }) => name === 'a-b');
  const report = auditMcpTools(inventory, { selectedTools: ['a-b'] });
  assert.equal(report.index_bytes, Buffer.byteLength(files.get('INDEX.json')));
  assert.equal(report.selected_definitions_bytes, Buffer.byteLength(files.get(selected.schema_path)));
  assert.equal(report.index_plus_selected_bytes, report.index_bytes + report.selected_definitions_bytes);
  assert.equal(report.provider_tokens, null);
  assert.equal(report.savings_claim, 'withheld');
  assert.throws(() => auditMcpTools(inventory, { selectedTools: ['missing'] }), /unknown_selected_tool/);
  assert.throws(() => auditMcpTools(inventory, { selectedTools: ['a-b', 'a-b'] }), /unique/);
  const tiny = auditMcpTools({ server: 'small', tools: [{ name: 'get', inputSchema: {} }] }, { selectedTools: ['get'] });
  assert.ok(tiny.index_plus_selected_bytes > tiny.all_definitions_bytes);
});

test('bridge requires reviewed identity and an explicit allowlist; null and result envelope survive unchanged', async () => {
  const requests = [];
  const result = { content: [{ type: 'image', data: 'example', mimeType: 'image/png' }, { type: 'text', text: 'kept' }], structuredContent: { records: [{ id: 1 }] }, _meta: { evidence: 'retained' }, isError: false };
  const args = { filter: null, unknownOptional: { retained: true } };
  const options = { inventory, expectedDigest: buildMcpCatalog(inventory).index.tools_sha256, callTool: async (request) => { requests.push(request); return result; } };
  const denied = createMcpCodeBridge(options);
  await assert.rejects(denied.call('a-b', args), /tool_not_allowed/);
  const bridge = createMcpCodeBridge({ ...options, allowedTools: ['a-b'] });
  assert.equal(await bridge.call('a-b', args), result);
  assert.deepEqual(requests, [{ name: 'a-b', arguments: args }]);
  await assert.rejects(bridge.call('a_b'), /tool_not_allowed/);
  await assert.rejects(bridge.call('missing'), /unknown_tool/);
  assert.equal(requests.length, 1);
  assert.throws(() => createMcpCodeBridge({ ...options, expectedDigest: 'changed' }), /digest_mismatch/);
  assert.throws(() => createMcpCodeBridge({ ...options, allowedTools: ['missing'] }), /unknown_allowed_tool/);
  const transportFailure = createMcpCodeBridge({ ...options, allowedTools: ['a-b'], callTool: async () => { throw new Error('transport_failure'); } });
  await assert.rejects(transportFailure.call('a-b'), /transport_failure/);
});

test('projection rejects tool errors before reduction and never silently truncates success', () => {
  const result = { content: [{ type: 'text', text: 'large'.repeat(1000) }], structuredContent: { records: [{ id: 1 }, { id: 2 }] } };
  const projected = projectMcpResult(result, (response) => ({ count: response.structuredContent.records.length }));
  assert.deepEqual(projected.data, { count: 2 });
  assert.equal(projected.raw_json_bytes, Buffer.byteLength(JSON.stringify(result)));
  assert.throws(() => projectMcpResult(result, (response) => response, { maxBytes: 100 }), /budget_exceeded/);
  let ran = false;
  const failed = { ...result, isError: true };
  assert.throws(() => projectMcpResult(failed, () => { ran = true; }), (error) => error.result === failed);
  assert.equal(ran, false);
  assert.throws(() => projectMcpResult(result, async () => ({ count: 2 })), /synchronous reducer/);
  assert.throws(() => projectMcpResult({ value: 'lossy' }, () => 1), /envelope/);
});

test('filesystem catalog refuses overwrites and verifies definition identity before reading', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'stolz-mcp-files-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'catalog');
  const written = await writeMcpCatalog(inventory, directory);
  assert.equal(written.files_written, 4);
  await assert.rejects(writeMcpCatalog(inventory, directory), { code: 'EEXIST' });
  const index = JSON.parse(await readFile(join(directory, 'INDEX.json'), 'utf8'));
  assert.deepEqual(await readMcpDefinition(directory, index, 'a-b'), inventory.tools[0]);
  const entry = index.tools.find(({ name }) => name === 'a-b');
  await writeFile(join(directory, entry.schema_path), '{}');
  await assert.rejects(readMcpDefinition(directory, index, 'a-b'), /digest_mismatch/);
  entry.schema_path = '../escape';
  await assert.rejects(readMcpDefinition(directory, index, 'a-b'), /invalid_catalog_entry/);
});

test('CLI preview performs no write; apply and schema work without MCP connections or secret configuration', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'stolz-mcp-cli-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'tools.json');
  const directory = join(root, 'catalog');
  await writeFile(source, JSON.stringify(inventory));
  const args = ['tools/mcp-code-cli.mjs', 'catalog', '--input', source, '--out', directory];
  assert.equal(JSON.parse((await run(process.execPath, args)).stdout).dry_run, true);
  await assert.rejects(readFile(join(directory, 'INDEX.json')), { code: 'ENOENT' });
  assert.equal(JSON.parse((await run(process.execPath, [...args, '--apply'])).stdout).files_written, 4);
  assert.deepEqual(JSON.parse((await run(process.execPath, ['tools/mcp-code-cli.mjs', 'schema', '--directory', directory, '--name', 'a-b'])).stdout), inventory.tools[0]);
  await assert.rejects(run(process.execPath, [...args, '--apply']), (error) => error.code === 1 && error.stderr.includes('EEXIST') && !error.stderr.includes('exclude-connection'));
  await writeFile(source, '{"secret":"do-not-echo"');
  await assert.rejects(run(process.execPath, args), (error) => error.code === 1 && error.stderr.includes('invalid_json_input') && !error.stderr.includes('do-not-echo'));
});

test('MCP instruction selection is lazy, standalone and outside the five managed profiles', async (context) => {
  assert.deepEqual(planSkillContext({ concern: 'mcp' }).instruction_reads, ['skills/stolz-mcp/SKILL.md']);
  const detail = planSkillContext({ concern: 'mcp', needsReference: true, mcpExecution: true });
  assert.equal(detail.references.length, 2);
  const loader = () => { throw new Error('unexpected adapter load'); };
  for (const resolver of [createLazyCodexResolver(loader), claudeCodeConformanceAdapter.createLazyResolver(loader), qwenCodeConformanceAdapter.createLazyResolver(loader)]) assert.equal((await resolver({ concern: 'mcp' })).reason, 'adapter_not_required');
  for (const runtime of ['codex', 'claude-code', 'qwen-code']) assert.equal((await resolveProfile({ runtime })).core_skills.length, 5);
  const root = await mkdtemp(join(tmpdir(), 'stolz-mcp-skill-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await cp('skills/stolz-mcp', join(root, 'stolz-mcp'), { recursive: true });
  for (const path of ['SKILL.md', 'references/catalog-and-measurement.md', 'references/execution-and-results.md']) assert.ok((await readFile(join(root, 'stolz-mcp', path), 'utf8')).length > 100);
});
