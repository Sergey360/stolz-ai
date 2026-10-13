# Catalog and Measurement

Inspect the current host's tool-loading behavior before proposing a replacement.
Native deferred discovery may already avoid loading full schemas. Do not infer
eager loading or billing on every turn merely from a configured MCP server.

With the optional STOLZ Node package available, use `stolz-mcp --help` or
`node node_modules/stolz-ai/tools/mcp-code-cli.mjs --help`. The instruction
directory alone does not include or install this executable.

The CLI accepts a complete `tools/list` result (including a JSON-RPC `result`
envelope) or an `mcp-diet` export with `server` and `tools`. Supply `--server`
when the export has no server identity. Obtain all pages through the existing
client first; a remaining `nextCursor` is rejected. Review the export locally;
descriptions and schemas may contain private material. Connection configuration
is excluded from generated files, but schema content is not a redaction service.

```text
stolz-mcp audit --input tools.json --server example --select get_records
stolz-mcp catalog --input tools.json --server example --out mcp-catalog
stolz-mcp catalog --input tools.json --server example --out mcp-catalog --apply
stolz-mcp schema --directory mcp-catalog --name get_records
```

Catalog creation previews by default and only writes a new directory after
`--apply`. Existing directories are refused. If filesystem failure leaves a
partial directory, retain and inspect it; use a different reviewed destination.
`INDEX.json` contains a bounded description and digest for each tool. Definition
filenames derive from full name hashes; exact names, optional nulls and complete
schemas are preserved. Only the selected definition needs to enter the model.
Keep a trusted copy of the reviewed index when checking definition hashes;
changing both an index and a definition defeats a hash-only integrity check.

The audit measures compact full-list UTF-8 bytes, formatted index bytes, selected
formatted definitions and their combined size. Different serialization is
explicit: this is a source-size comparison, not a provider-token benchmark.
Index-plus-selected can be larger than the original listing. No tokenizer,
prompt cache, request frequency or billed usage is inferred.

For a savings claim, compare equivalent completed tasks on the actual runtime,
including discovery, selected schemas, generated code, tool results, retries,
verification, cached input and provider usage. Retain at least the source
identities, runtime/loading settings, outputs, verification and raw measurement
basis required by the existing benchmark rules. Leave missing usage unavailable.
