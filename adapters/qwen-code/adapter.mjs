import { createRuntimeAdapter } from '../conformance/runtime-adapter.mjs';

export const qwenCodeConformanceAdapter = createRuntimeAdapter({ adapter_id: 'qwen-code', runtime_id: 'qwen-code', runtime_version: '0.22.3', destination: '.qwen/skills/' });
export const qwenCodeAdapter = qwenCodeConformanceAdapter.declaration;
