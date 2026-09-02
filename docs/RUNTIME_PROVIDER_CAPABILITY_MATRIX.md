# v0.3 Runtime and Provider Capability Matrix

This matrix is an evidence-admission register for Issue #113/change #112. It
uses the definitions and citations in
[`MULTI_RUNTIME_ANALYSIS_V0.3.md`](MULTI_RUNTIME_ANALYSIS_V0.3.md). `planned`
means documented for a future fixture, not supported or certified.

| Surface | Kind | Skill/settings surface | Hooks / MCP | Telemetry source | Current level/status | Required next evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `codex-local` | runtime adapter | Existing selected-only v0.2 profile | Existing declared lazy adapter/integration boundary | Fixture only; provider usage unavailable | C1 adapter certified in v0.2; unchanged | Preserve v0.2 guards; do not reinterpret as C2/C3. |
| Claude Code | agent runtime | `.claude/skills/`, `~/.claude/skills/`; scoped settings precedence | Hooks/MCP remain explicit opt-in | CLI JSON/stream-JSON can be runtime evidence | C1 CLI certified for 2.1.251; C2/C3 withheld | Sanitized runtime export for C2; matching provider exports for C3. |
| Qwen Code | agent runtime | `.qwen/skills/`, `~/.qwen/skills/`; settings provenance | Hooks/MCP remain explicit opt-in | OTel/outfile and usage statistics are runtime telemetry | C1 CLI certified for 0.22.3; C2/C3 withheld | Sanitized runtime export for C2; matching provider exports for C3. |
| Anthropic API | provider overlay | No runtime skill discovery | No runtime hooks/MCP | Provider response/export only | withheld | C3 requires matching raw usage exports for both routes. |
| Alibaba Cloud Model Studio | provider overlay | No runtime skill discovery | No runtime hooks/MCP | Model Studio API response/export only | withheld | Pin plan/region/protocol/endpoint and sanitized matching exports. |
| Z.ai | provider overlay | No runtime skill discovery | No runtime hooks/MCP | Z.ai API response/export only | withheld | Pin plan/endpoint/auth mode and sanitized matching exports. |

## Compatibility and safety checks

| Capability | Claude Code | Qwen Code | Provider overlays |
| --- | --- | --- | --- |
| Canonical skill discovery | C0/C1 fixture required | C0/C1 fixture required | Not applicable — providers do not discover runtime skills. |
| Settings precedence provenance | Required | Required | Not applicable — overlay selects declared metadata only. |
| Hook/MCP isolation | Explicit event/server identity and redaction required | Explicit event/server identity and redaction required | Not applicable — no provider endpoint is an MCP/hook surface. |
| Secret safety | Settings must reference external secret only | Settings must reference external secret only | Name auth mechanism/key reference only; never store a value. |
| Runtime telemetry | C2 only after raw sanitized CLI/runtime export | C2 only after raw sanitized OTel/outfile export | Never substituted for provider usage. |
| Provider telemetry | C3 only from matching provider exports | C3 only from matching provider exports | C3 candidate source; protocol compatibility alone is insufficient. |
| Install isolation | Clean runtime-local destination and no eager integrations | Same | No installation permitted. |

**Evidence rule:** a cell is not a support claim. It becomes certified only at
the exact C-level defined in the analysis, with the exact version tuple and
artifact/test owner stated there. Missing evidence remains `withheld`, never
zero, estimated, or borrowed from another runtime.

## v0.3 C1 implementation evidence

### Reproducible profile provenance

Each v3 profile is admitted by `tools/profile-admission.mjs`. Every profile
identity is SHA-256 of canonical JSON with recursively sorted object keys.
Profile self-identities omit all identity SHA fields and include the identity
ID as a domain separator. Retained UTF-8 JSON evidence is parsed then hashed
as canonical JSON, so equivalent LF and CRLF checkouts (and non-semantic JSON
formatting or key order) have the same identity. Retained plain UTF-8 text, if
introduced, has the deliberately narrower rule of CRLF-to-LF normalization;
lone CR and all other bytes remain significant. Invalid UTF-8 and malformed
JSON fail closed. Retained C0/settings fixture files provide source and
settings provenance. Admission rejects placeholders, repeated identities,
missing, malformed, or stale files, and runtime/adapter/destination crossings.

`fixtures/runtime-adapters/claude-code/c1.cli-certification.json` retains the
literal `npx --yes @anthropic-ai/claude-code@2.1.251 --version` argv and the
sanitized output SHA-256 `1aaadbe01265e82bd28c2e2639a2a6a0604edbb124f997e9d3a4d09b823c6fb8`.
`fixtures/runtime-adapters/qwen-code/c1.cli-certification.json` likewise
retains the exact Qwen 0.22.3 argv and SHA-256
`af76ba6061bebbaf64f9505fb4eafd30594a58db183904285c6b7e8f8c6a7701`.
They are deterministic records observed on Node v22.16.0, not live provider
calls. `tools/runtime-certification.mjs` rejects tuple, argv, version, adapter,
output identity, provenance, or provider-claim mutations. C2 and C3 remain
unavailable/withheld pending their distinct evidence classes.

### Offline Windows focused verification

From a checkout whose dependencies are already prepared, run this command in
PowerShell or `cmd.exe`; it only reads repository fixtures and does not contact
a runtime or provider, use credentials, or require authentication:

```text
node --test test/runtime-adapter-v0.3.test.mjs test/adapter-conformance-v0.2.test.mjs test/runtime-profile-*.test.mjs test/provider-overlay-contract.test.mjs
```

`tools/profile-admission.mjs` derives its default repository root with Node's
native `fileURLToPath()` conversion, so profile provenance resolves correctly
on both Windows and POSIX, including repository paths containing spaces.

## v0.3 C2 retained-envelope admission

Issue #149 adds offline-only telemetry admission in
tools/runtime-telemetry/admission.mjs. Raw runtime input is reduced before
hashing to the declared event class, result, and non-negative counters; prompt,
response, path, authentication, environment, vendor, command-text, and other
unknown fields are not retained. The persisted envelope is closed at every
level and has a recomputable outer retained_identity_sha256 over all retained
fields, including the canonical UTC captured_at value. SHA-256 is an integrity
identity of sanitized evidence, not runtime/provider authenticity.

Claude permits only 2.1.251 CLI JSON/stream-JSON source tuples; Qwen permits
only 0.22.3 OTel tuples. Command identity and argc are recomputed from each
runtime's declared literal npx argv. The two C2 fixture records are terminal
withheld/unavailable dispositions with exact no-provider tuples, empty
evidence, and not_run gates. They do not certify C2 or C3, and no runtime,
provider, credential, or authenticated call is made.

## v0.3 C3 terminal-withholding evidence

The six files under `fixtures/provider-evidence/` are exact C3 terminal
`withheld`/`unavailable` records. They cross Claude Code 2.1.251 and Qwen Code
0.22.3 with Anthropic API (`anthropic` / `standard` / `claude-3-5-sonnet`),
Alibaba Model Studio (`alibaba-model-studio` / `international` / `qwen-plus`),
and Z.ai (`zai` / `global` / `glm-4.5`), with adapter and overlay version
`1.0.0`. They retain no evidence, command, route declaration, live field, or
secret material. The checked-in AJV Draft 2020-12 suite verifies every fixture
and rejects all top-level/tuple/disposition/gate mutations. C0/C1 supported;
C2/C3 withheld/unavailable.

## v0.3 C3 admission control

`admitRuntimeCertification(record, retainedExports)` admits a live C3 record
only with the closed four-reference envelope and exactly two closed retained
provider exports. Each retained export is independently checked, then bound by
evidence ID, retained identity, route identity/role, complete tuple, passed
gates, redaction result, and a distinct raw-evidence identity. Draft 2020-12
closes all structural envelopes, classes, scalar values, cardinalities, and the
six exact tuples; cross-record equality and uniqueness are deliberately
enforced by semantic admission, never implied by a hash. Retained hashes
establish canonical retained-record integrity only; they never establish
runtime or provider authenticity. The tests use synthetic in-memory
admission-control records, never provider fixtures or claimed evidence.
C0/C1 supported; C2/C3 withheld/unavailable.
