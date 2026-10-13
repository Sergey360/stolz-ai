# Execution and Results

Prefer an existing host code bridge or authorized client. STOLZ's optional
`stolz-ai/mcp-code` API wraps a caller-supplied `callTool` callback; it does not
implement stdio, HTTP, OAuth or a sandbox. The host owns credentials, input and
output schema validation, cancellation, timeouts, permissions and session cleanup.
Recheck the inventory after permissions, server identity or tool-list changes.

```javascript
import { auditMcpTools, createMcpCodeBridge, projectMcpResult } from 'stolz-ai/mcp-code';

// inventory is a complete reviewed export from this authorized client/session.
// reviewedDigest was retained after review; do not substitute a new digest
// automatically when the current export differs.
const bridge = createMcpCodeBridge({
  inventory, server: 'example', expectedDigest: reviewedDigest,
  allowedTools: ['get_records'],
  callTool: (request) => client.callTool(request),
});
const result = await bridge.call('get_records', { filter: null });
const summary = projectMcpResult(result, (response) => ({
  count: response.structuredContent.records.length,
}));
console.log(summary);
```

The explicit allowlist scopes this wrapper; it is not a security boundary or
proof of user approval. Do not grant write authority based on `readOnlyHint`.
Preserve prior user authorization and host approval checks. Parallelize only
independent reads whose client permits concurrency. Keep ordered mutations,
dependencies and approval decisions sequential. Never replay a timed-out write
without authoritative state or an established idempotency contract.

The bridge returns the entire MCP envelope, including `isError`, structured
content, text, images, audio, resource links and metadata, without parsing it
into a lossy list. Transport errors remain errors. A tool error is retained;
the projection helper rejects it before running the reducer. Do not convert
failed or partial work into a successful summary.

Define the required output before filtering. Keep raw results in the approved
execution environment, inspect paging/completeness and retain evidence locators.
Emit images or other required artifacts through the host's media support. An
aggregate alone cannot satisfy a request for source rows or rendered media.
The optional projection budget rejects oversized output; it never silently
truncates it. Filtering private data is the caller's responsibility and is not
guaranteed by code execution or this helper.

Retain reusable code only after testing the actual workflow. Parameterize
identities, remove secrets, document dependencies, authority and invalidation,
and invoke the runtime's skill-authoring workflow only within the user's scope.
Do not save every session automatically or elevate source descriptions into
persistent instructions.
