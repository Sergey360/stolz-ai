import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deltaContextSha256, validateReadFragment } from './context-state.mjs';

const SHA = /^[a-f0-9]{64}$/;
const reasons = new Set(['head_changed', 'range_changed', 'content_mismatch', 'retention_expired', 'integrity_failed', 'policy_revoked', 'policy_changed', 'schema_changed', 'tool_changed', 'manual_purged']);
const UNSUPPORTED_DIRECTORY_SYNC = new Set(['EINVAL', 'ENOTSUP', 'EPERM']);
const WINDOWS_RENAME_COLLISION = new Set(['EEXIST', 'ENOTEMPTY', 'EPERM']);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const stamp = (now) => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z');
function digest(value, name) { if (!SHA.test(value)) throw new TypeError(`${name} must be SHA-256`); }
function fragmentId(value) { if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(value ?? '')) throw new TypeError('fragment_id is invalid'); }
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])); return value; }
async function syncDirectory(path) { const directory = await open(path, 'r'); try { await directory.sync(); } catch (error) { if (process.platform !== 'win32' || !UNSUPPORTED_DIRECTORY_SYNC.has(error?.code)) throw error; } finally { await directory.close(); } }

/** File-backed private fragment ledger. Entries are metadata only; bytes remain external content-addressed objects. */
export class ReadFragmentLedger {
  constructor({ root, clock = () => Date.now() } = {}) { if (!root) throw new TypeError('root is required'); this.root = root; this.clock = clock; this.entries = join(root, 'entries'); this.objects = join(root, 'objects'); this.staging = join(root, 'staging'); }
  entryPath(id) { fragmentId(id); const filename = process.platform === 'win32' ? id.replaceAll(':', '%3A') : id; return join(this.entries, `${filename}.json`); }
  objectPath(id) { digest(id, 'content_sha256'); return join(this.objects, id); }
  async initialize() { await Promise.all([mkdir(this.entries, { recursive: true }), mkdir(this.objects, { recursive: true }), mkdir(this.staging, { recursive: true })]); await Promise.all((await readdir(this.staging)).map((name) => rm(join(this.staging, name), { force: true }))); }
  async atomic(path, bytes) {
    await mkdir(dirname(path), { recursive: true });
    const temp = join(this.staging, `${sha(`${path}:${Math.random()}`)}.tmp`);
    const file = await open(temp, 'wx');
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    try {
      await rename(temp, path);
    } catch (error) {
      if (process.platform !== 'win32' || !WINDOWS_RENAME_COLLISION.has(error?.code)) throw error;
      let existing = null;
      try { existing = await readFile(path); } catch (readError) { if (readError?.code !== 'ENOENT') throw readError; }
      if (existing?.equals(bytes)) await rm(temp, { force: true });
      else { await rm(path, { force: true }); await rename(temp, path); }
    }
    await syncDirectory(dirname(path));
  }
  async entry(id) { try { return JSON.parse(await readFile(this.entryPath(id), 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return null; throw new TypeError('fragment_entry_corrupt'); } }
  reference(record) { return { fragment_id: record.fragment_id, delta_identity: record.delta_identity, content_sha256: record.content_sha256, range: { ...record.range } }; }
  async record({ delta, range, content, policy_identity, schema_identity, tool_identity, ttl_ms = 300000, fragment_id: requested } = {}) {
    await this.initialize(); if (!(content instanceof Uint8Array) || !Number.isSafeInteger(ttl_ms) || ttl_ms < 1 || ttl_ms > 86400000) throw new TypeError('content and bounded ttl_ms are required');
    for (const [name, value] of Object.entries({ policy_identity, schema_identity, tool_identity })) digest(value, name);
    const bytes = Buffer.from(content); if (!range || bytes.length !== range.end_byte - range.start_byte) throw new TypeError('content must match range');
    const delta_identity = deltaContextSha256(delta), content_sha256 = sha(bytes), identity = { policy_identity, schema_identity, tool_identity };
    const id = requested ?? `fragment:${sha(JSON.stringify(canonical({ delta_identity, range, content_sha256, identity }))).slice(0, 48)}`; fragmentId(id);
    const now = this.clock(); const record = { schema_id: 'read-fragment-ledger', schema_version: '0.6.0', fragment_id: id, delta_identity, range: { path: range.path, git_blob: range.git_blob, start_byte: range.start_byte, end_byte: range.end_byte }, content_sha256, identity, durability: { write_protocol: 'atomic_rename_fsync', commit_acknowledged: true, stored_at: stamp(now) }, invalidation: { state: 'valid', reasons: [] }, expires_at: stamp(now + ttl_ms) };
    const validation = { ...record }; delete validation.expires_at; if (!validateReadFragment(validation).valid) throw new TypeError('invalid fragment record');
    try { await stat(this.objectPath(content_sha256)); } catch (error) { if (error?.code !== 'ENOENT') throw error; await this.atomic(this.objectPath(content_sha256), bytes); }
    await this.atomic(this.entryPath(id), Buffer.from(JSON.stringify(record)));
    return this.reference(record);
  }
  async invalidate(id, reason) { if (!reasons.has(reason)) throw new TypeError('invalid invalidation reason'); const record = await this.entry(id); if (!record) return { state: 'missing' }; record.invalidation = { state: reason === 'retention_expired' ? 'expired' : 'invalidated', reasons: [...new Set([...(record.invalidation?.reasons ?? []), reason])] }; await this.atomic(this.entryPath(id), Buffer.from(JSON.stringify(record))); return { state: record.invalidation.state, reason }; }
  async lookup({ fragment_id, delta_identity, policy_identity, schema_identity, tool_identity, max_bytes = 65536, now = this.clock() } = {}) {
    if (!Number.isSafeInteger(max_bytes) || max_bytes < 1) throw new TypeError('max_bytes must be positive'); const record = await this.entry(fragment_id); if (!record) return { state: 'miss', reason: 'not_found' };
    for (const [name, value] of Object.entries({ delta_identity, policy_identity, schema_identity, tool_identity })) digest(value, name);
    const mismatch = delta_identity !== record.delta_identity ? 'head_changed' : policy_identity !== record.identity?.policy_identity ? 'policy_changed' : schema_identity !== record.identity?.schema_identity ? 'schema_changed' : tool_identity !== record.identity?.tool_identity ? 'tool_changed' : null;
    if (mismatch) { await this.invalidate(fragment_id, mismatch); return { state: 'miss', reason: mismatch }; } if (record.invalidation?.state !== 'valid') return { state: 'miss', reason: record.invalidation.reasons[0] }; if (Date.parse(record.expires_at) <= now) { await this.invalidate(fragment_id, 'retention_expired'); return { state: 'miss', reason: 'retention_expired' }; } if (record.range.end_byte - record.range.start_byte > max_bytes) return { state: 'miss', reason: 'projection_bound_exceeded' };
    let bytes; try { bytes = await readFile(this.objectPath(record.content_sha256)); } catch { await this.invalidate(fragment_id, 'integrity_failed'); return { state: 'miss', reason: 'integrity_failed' }; } if (sha(bytes) !== record.content_sha256 || bytes.length !== record.range.end_byte - record.range.start_byte) { await this.invalidate(fragment_id, 'integrity_failed'); return { state: 'miss', reason: 'integrity_failed' }; } return { state: 'hit', reference: this.reference(record) };
  }
  project(result) { return result?.state === 'hit' ? { terminal_status: 'available', fragments: [{ ...result.reference, byte_count: result.reference.range.end_byte - result.reference.range.start_byte }] } : { terminal_status: 'unavailable', fragments: [] }; }
  purge(id) { return this.invalidate(id, 'manual_purged'); }
}
export const isSafeCompactProjection = (value) => !Object.hasOwn(value ?? {}, 'content') && !/(?:secret|token|password|prompt|user.?data)/i.test(JSON.stringify(value));
