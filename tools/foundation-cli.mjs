import { readFile } from 'node:fs/promises';
import { evaluateBenchmark, validateAdapterCapabilities, validateManifest } from './foundation.mjs';

const [operation, inputPath] = process.argv.slice(2);
const handlers = { manifest: validateManifest, adapter: validateAdapterCapabilities, benchmark: evaluateBenchmark };
if (!handlers[operation] || !inputPath) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: 'usage: foundation-cli.mjs <manifest|adapter|benchmark> <json-file>' })}\n`);
  process.exitCode = 2;
} else {
  try {
    const result = handlers[operation](JSON.parse(await readFile(inputPath, 'utf8')));
    const ok = result.valid ?? result.accepted;
    process.stdout.write(`${JSON.stringify({ ok, operation, result })}\n`);
    if (!ok) process.exitCode = 1;
  } catch (caught) {
    process.stdout.write(`${JSON.stringify({ ok: false, operation, error: caught.message })}\n`);
    process.exitCode = 1;
  }
}
