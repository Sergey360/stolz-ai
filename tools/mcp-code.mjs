import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (value) => Buffer.byteLength(value, 'utf8');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function json(value) {
  const encoded = JSON.stringify(value, (_key, item) => {
    if (item === undefined || typeof item === 'bigint' || typeof item === 'function' || typeof item === 'symbol' ||
        (typeof item === 'number' && !Number.isFinite(item))) throw new TypeError('JSON values required');
    return item;
  });
  if (encoded === undefined) throw new TypeError('JSON values required');
  return encoded;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

/** Accepts a complete tools/list result or a mcp-diet export; connection settings are excluded. */
export function normalizeMcpTools(input, { server = input?.server } = {}) {
  const listing = input?.result ?? input;
  if (!object(listing) || !Array.isArray(listing.tools)) throw new TypeError('tools/list result required');
  if (listing.nextCursor !== undefined && listing.nextCursor !== null) throw new Error('incomplete_tools_list: collect every page first');
  if (typeof server !== 'string' || !server.trim() || server.length > 256) throw new TypeError('server identity required');
  const names = new Set();
  const tools = listing.tools.map((tool) => {
    if (!object(tool) || typeof tool.name !== 'string' || !tool.name || tool.name.length > 512 || !object(tool.inputSchema)) {
      throw new TypeError('tool name and inputSchema object required');
    }
    if (names.has(tool.name)) throw new Error('duplicate_tool_name');
    names.add(tool.name);
    if (tool.description !== undefined && typeof tool.description !== 'string') throw new TypeError('tool description must be a string');
    if (tool.outputSchema !== undefined && !object(tool.outputSchema)) throw new TypeError('outputSchema must be an object');
    return canonical(JSON.parse(json(tool)));
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return { server, tools };
}

/** Creates a small discovery index and exact per-tool definitions without generating executable source. */
export function buildMcpCatalog(input, options = {}) {
  const normalized = normalizeMcpTools(input, options);
  const files = new Map();
  const entries = normalized.tools.map((tool) => {
    const source = `${JSON.stringify(tool, null, 2)}\n`;
    const sha256 = hash(source);
    const schema_path = `schemas/${hash(tool.name)}.json`;
    files.set(schema_path, source);
    return { name: tool.name, description: (tool.description ?? '').replace(/\s+/g, ' ').slice(0, 110), schema_path, sha256, bytes: bytes(source) };
  });
  const index = { format_version: 1, server: normalized.server, tools_sha256: hash(json(normalized)), tools: entries };
  files.set('INDEX.json', `${JSON.stringify(index, null, 2)}\n`);
  return { index, files };
}

/** Exact UTF-8 source sizes; no tokenizer, request charging, cache or provider usage is inferred. */
export function auditMcpTools(input, { selectedTools = [], ...options } = {}) {
  if (!Array.isArray(selectedTools) || selectedTools.some((name) => typeof name !== 'string') || new Set(selectedTools).size !== selectedTools.length) {
    throw new TypeError('selectedTools must contain unique exact names');
  }
  const normalized = normalizeMcpTools(input, options);
  const { index, files } = buildMcpCatalog(normalized);
  const selected = selectedTools.map((name) => {
    const entry = index.tools.find((tool) => tool.name === name);
    if (!entry) throw new Error('unknown_selected_tool');
    return entry;
  });
  const indexBytes = bytes(files.get('INDEX.json'));
  return {
    format_version: 1, server: index.server, tools_sha256: index.tools_sha256, tool_count: index.tools.length,
    measurement_scope: 'serialized_source_utf8_bytes',
    all_definitions_bytes: bytes(json(normalized.tools)), index_bytes: indexBytes,
    selected_definitions_bytes: selected.reduce((sum, tool) => sum + tool.bytes, 0),
    index_plus_selected_bytes: indexBytes + selected.reduce((sum, tool) => sum + tool.bytes, 0),
    selected_tools: selectedTools, largest_tools: [...index.tools].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map(({ name, bytes: size }) => ({ name, bytes: size })),
    provider_tokens: null, provider_cost: null, savings_claim: 'withheld',
    note: 'Index and selected definitions can exceed the full listing. Actual host loading and intermediate results require separate measurement.',
  };
}

/** Creates a new caller-selected directory; existing files, folders and symlinks are never replaced. */
export async function writeMcpCatalog(input, destination, options = {}) {
  const catalog = buildMcpCatalog(input, options);
  const root = resolve(destination);
  await mkdir(root);
  await mkdir(resolve(root, 'schemas'));
  for (const [path, source] of catalog.files) await writeFile(resolve(root, path), source, { encoding: 'utf8', flag: 'wx' });
  return { destination: root, files_written: catalog.files.size, tools_sha256: catalog.index.tools_sha256 };
}

/** Reads one definition and verifies its bytes against a caller-reviewed index entry. */
export async function readMcpDefinition(directory, index, name) {
  if (index?.format_version !== 1 || !Array.isArray(index.tools)) throw new TypeError('catalog index required');
  const entry = index.tools.find((tool) => tool.name === name);
  if (!entry || entry.schema_path !== `schemas/${hash(name)}.json` || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('invalid_catalog_entry');
  const source = await readFile(resolve(directory, entry.schema_path), 'utf8');
  if (hash(source) !== entry.sha256) throw new Error('definition_digest_mismatch');
  const tool = JSON.parse(source);
  if (tool.name !== name) throw new Error('definition_name_mismatch');
  return tool;
}

function checkResult(result) {
  if (!object(result) || !Array.isArray(result.content) || (result.isError !== undefined && typeof result.isError !== 'boolean')) {
    throw new TypeError('MCP CallToolResult envelope required');
  }
  return result;
}

/** The host owns connection, authorization, schema validation, cancellation and tool execution. */
export function createMcpCodeBridge({ inventory, server, expectedDigest, allowedTools = [], callTool } = {}) {
  const normalized = normalizeMcpTools(inventory, { server: server ?? inventory?.server });
  const digest = hash(json(normalized));
  if (typeof expectedDigest !== 'string' || digest !== expectedDigest) throw new Error('catalog_digest_mismatch');
  if (typeof callTool !== 'function') throw new TypeError('host callTool callback required');
  if (!Array.isArray(allowedTools) || allowedTools.some((name) => typeof name !== 'string') || new Set(allowedTools).size !== allowedTools.length) throw new TypeError('unique allowedTools required');
  const names = new Set(normalized.tools.map((tool) => tool.name));
  const allowed = new Set(allowedTools);
  for (const name of allowed) if (!names.has(name)) throw new Error('unknown_allowed_tool');
  return Object.freeze({
    tools_sha256: digest,
    async call(name, argumentsValue = {}) {
      if (!names.has(name)) throw new Error('unknown_tool');
      if (!allowed.has(name)) throw new Error('tool_not_allowed');
      if (!object(argumentsValue)) throw new TypeError('arguments object required');
      const result = await callTool({ name, arguments: JSON.parse(json(argumentsValue)) });
      return checkResult(result);
    },
  });
}

/** Reduces only a successful result. The full result remains with the caller; errors never reach the reducer. */
export function projectMcpResult(result, reducer, { maxBytes = 8192 } = {}) {
  checkResult(result);
  if (result.isError === true) {
    const error = new Error('mcp_tool_error: inspect the retained result');
    error.result = result;
    throw error;
  }
  if (typeof reducer !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('reducer and positive maxBytes required');
  const reduced = reducer(result);
  if (reduced && typeof reduced.then === 'function') throw new TypeError('synchronous reducer required');
  const data = JSON.parse(json(reduced));
  const projected = { status: 'ok', data, measurement_scope: 'serialized_result_utf8_bytes', raw_json_bytes: bytes(json(result)), savings_claim: 'withheld' };
  if (bytes(json(projected)) > maxBytes) throw new Error('projection_budget_exceeded: choose a smaller complete summary or retain an artifact');
  return projected;
}
