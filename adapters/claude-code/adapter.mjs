import { createRuntimeAdapter } from '../conformance/runtime-adapter.mjs';

export const claudeCodeConformanceAdapter = createRuntimeAdapter({ adapter_id: 'claude-code', runtime_id: 'claude-code', runtime_version: '2.1.251', destination: '.claude/skills/' });
export const claudeCodeAdapter = claudeCodeConformanceAdapter.declaration;
