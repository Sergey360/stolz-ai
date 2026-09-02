import { readFileSync } from 'node:fs';

import { createBenchmarkV3RuntimeAdapter } from './runtime-adapter.mjs';

function loadCapability(filename) {
  return JSON.parse(readFileSync(new URL(filename, import.meta.url), 'utf8'));
}

export const BENCHMARK_V3_RUNTIME_ADAPTERS = Object.freeze({
  'codex-local': createBenchmarkV3RuntimeAdapter(loadCapability('./codex-local.capability.json')),
  'claude-code': createBenchmarkV3RuntimeAdapter(loadCapability('./claude-code.capability.json')),
  'qwen-code': createBenchmarkV3RuntimeAdapter(loadCapability('./qwen-code.capability.json')),
});

export function resolveBenchmarkV3RuntimeAdapter(adapterId) {
  return BENCHMARK_V3_RUNTIME_ADAPTERS[adapterId] ?? null;
}
