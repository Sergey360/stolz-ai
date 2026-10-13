#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { auditMcpTools, buildMcpCatalog, readMcpDefinition, writeMcpCatalog } from './mcp-code.mjs';

async function main(argv) {
  const [command, ...args] = argv;
  if (command === '--help' || command === undefined) {
    return { usage: 'stolz-mcp audit|catalog --input tools.json --server NAME [--select EXACT_NAME] [--out NEW_DIRECTORY --apply]; stolz-mcp schema --directory CATALOG --name EXACT_NAME', execution: 'offline; no connection, credential or client-setting changes', measurement: 'UTF-8 bytes; provider tokens and savings withheld' };
  }
  const options = { selectedTools: [] };
  const keys = new Map([['--input', 'input'], ['--server', 'server'], ['--out', 'out'], ['--directory', 'directory'], ['--name', 'name']]);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') { if (options.apply) throw new Error('duplicate_option'); options.apply = true; continue; }
    const key = keys.get(args[i]);
    if (args[i] !== '--select' && !key) throw new Error('unknown_option');
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('option_value_required');
    if (!key) options.selectedTools.push(value);
    else { if (options[key] !== undefined) throw new Error('duplicate_option'); options[key] = value; }
  }
  if (command === 'schema') {
    if (!options.directory || !options.name || options.input || options.server || options.out || options.apply || options.selectedTools.length) throw new Error('schema_requires_directory_and_name_only');
    const index = JSON.parse(await readFile(`${options.directory}/INDEX.json`, 'utf8'));
    return readMcpDefinition(options.directory, index, options.name);
  }
  if (!['audit', 'catalog'].includes(command) || !options.input || options.directory || options.name) throw new Error('audit_or_catalog_input_required');
  if (command === 'audit' && (options.apply || options.out)) throw new Error('audit_is_read_only');
  if (options.apply && !options.out) throw new Error('catalog_apply_requires_out');
  const input = JSON.parse(await readFile(options.input, 'utf8'));
  const report = auditMcpTools(input, options);
  if (command === 'audit') return report;
  return { command, dry_run: !options.apply, audit: report, files: buildMcpCatalog(input, options).files.size,
    ...(options.apply ? await writeMcpCatalog(input, options.out, options) : {}) };
}

try {
  process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)), null, 2)}\n`);
} catch (error) {
  // Do not echo source contents, credentials, call arguments or failed JSON payloads.
  process.stderr.write(`${JSON.stringify({ error: { code: 'mcp_command_failed', message: error instanceof SyntaxError ? 'invalid_json_input' : error.code ?? error.message } })}\n`);
  process.exitCode = 1;
}
