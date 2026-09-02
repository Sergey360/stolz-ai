import { codexConformanceAdapter } from '../adapters/codex/adapter.mjs';
import { claudeCodeConformanceAdapter } from '../adapters/claude-code/adapter.mjs';
import { qwenCodeConformanceAdapter } from '../adapters/qwen-code/adapter.mjs';
import { runAdapterConformance } from '../adapters/conformance/adapter-conformance.mjs';

const supported = new Map([['codex-local', codexConformanceAdapter], ['claude-code', claudeCodeConformanceAdapter], ['qwen-code', qwenCodeConformanceAdapter]]);
const adapterId = process.argv[2] ?? 'codex-local';
const adapter = supported.get(adapterId);
const report = adapter
  ? await runAdapterConformance(adapter)
  : { adapter_id: adapterId, certified: false, checks: [{ id: 'adapter-implementation', passed: false, detail: 'adapter is not implemented or certified' }] };
process.stdout.write(`${JSON.stringify(report)}\n`);
