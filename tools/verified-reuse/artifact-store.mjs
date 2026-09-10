import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SHA256 = /^[a-f0-9]{64}$/;
const METADATA_VERSION = '1';
const UNSUPPORTED_DIRECTORY_SYNC = new Set(['EINVAL', 'ENOTSUP', 'EPERM']);

async function syncDirectory(path) {
  const directory = await open(path, 'r');
  try {
    await directory.sync();
  } catch (error) {
    if (process.platform !== 'win32' || !UNSUPPORTED_DIRECTORY_SYNC.has(error?.code)) throw error;
  } finally {
    await directory.close();
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function canonicalBytes(value) { return Buffer.from(JSON.stringify(canonical(value)), 'utf8'); }
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function validDigest(value) { return typeof value === 'string' && SHA256.test(value); }

/** A private, content-addressed store. Callers receive metadata, never raw bytes. */
export class ArtifactStore {
  constructor(root) {
    if (typeof root !== 'string' || !root) throw new TypeError('artifact root is required');
    this.root = root;
    this.objects = join(root, 'objects', 'sha256');
    this.metadata = join(root, 'metadata');
    this.tmp = join(root, 'tmp');
    this.quarantine = join(root, 'quarantine');
  }

  async init() { await Promise.all([this.objects, this.metadata, this.tmp, this.quarantine].map((path) => mkdir(path, { recursive: true, mode: 0o700 }))); return this; }
  objectPath(value) { return join(this.objects, value.slice(0, 2), value); }
  metadataPath(value) { return join(this.metadata, `${value}.json`); }

  async #atomicWrite(path, bytes) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = join(this.tmp, `${randomUUID()}.tmp`);
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, path);
    // The directory sync closes the rename durability window on filesystems that support it.
    await syncDirectory(dirname(path));
  }

  async #readMetadata(value) {
    try { return JSON.parse(await readFile(this.metadataPath(value), 'utf8')); } catch { return null; }
  }

  async #quarantine(value, reason) {
    const stamp = `${Date.now()}-${randomUUID()}`;
    const target = join(this.quarantine, `${value}-${stamp}.json`);
    await this.#atomicWrite(target, canonicalBytes({ artifact_digest_sha256: value, reason, quarantined_at: new Date().toISOString() }));
    try { await rename(this.objectPath(value), join(this.quarantine, `${value}-${stamp}.blob`)); } catch { /* absent or already quarantined */ }
    return { available: false, reason: 'integrity_failed' };
  }

  async putArtifact({ content, media_type = 'application/octet-stream', content_kind = 'tool_event', classification = 'private', redaction_version = '1', retention_until = null } = {}) {
    await this.init();
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ''), 'utf8');
    const digest_sha256 = digest(bytes);
    const objectPath = this.objectPath(digest_sha256);
    try { await stat(objectPath); } catch { await this.#atomicWrite(objectPath, bytes); }
    const record = { schema_id: 'reuse-artifact', schema_version: '1.0.0', metadata_version: METADATA_VERSION, digest_sha256, byte_count: bytes.length, media_type, classification, content_kind, redaction_version, retention_until, disposal_status: 'retained', integrity_state: 'verified' };
    const previous = await this.#readMetadata(digest_sha256);
    if (previous && JSON.stringify(canonical(previous)) !== JSON.stringify(canonical(record))) throw new TypeError('conflicting artifact metadata for content digest');
    if (!previous) await this.#atomicWrite(this.metadataPath(digest_sha256), canonicalBytes(record));
    return structuredClone(record);
  }

  async inspectArtifact(digest_sha256, { now = Date.now() } = {}) {
    if (!validDigest(digest_sha256)) return { available: false, reason: 'artifact_invalid' };
    const metadata = await this.#readMetadata(digest_sha256);
    if (!metadata || metadata.schema_id !== 'reuse-artifact' || metadata.schema_version !== '1.0.0' || metadata.metadata_version !== METADATA_VERSION || metadata.digest_sha256 !== digest_sha256 || !Number.isSafeInteger(metadata.byte_count) || metadata.byte_count < 0) return this.#quarantine(digest_sha256, 'metadata_invalid');
    if (metadata.disposal_status !== 'retained') return { available: false, reason: 'artifact_unavailable' };
    if (metadata.retention_until !== null && (!Number.isFinite(Date.parse(metadata.retention_until)) || Date.parse(metadata.retention_until) <= now)) return { available: false, reason: 'artifact_unavailable' };
    let bytes;
    try { bytes = await readFile(this.objectPath(digest_sha256)); } catch { return { available: false, reason: 'artifact_unavailable' }; }
    if (bytes.length !== metadata.byte_count || digest(bytes) !== digest_sha256) return this.#quarantine(digest_sha256, 'digest_mismatch');
    return { available: true, artifact: structuredClone(metadata) };
  }

  async disposeArtifact(digest_sha256, reason = 'retention_disposed') {
    const metadata = await this.#readMetadata(digest_sha256);
    if (!metadata) return false;
    metadata.disposal_status = 'disposed';
    metadata.disposal_reason = reason;
    await this.#atomicWrite(this.metadataPath(digest_sha256), canonicalBytes(metadata));
    await rm(this.objectPath(digest_sha256), { force: true });
    return true;
  }

  /** Removes only abandoned temporary files and rehashes all retained objects. */
  async recover() {
    await this.init();
    const removed_temporary_files = (await readdir(this.tmp)).length;
    await Promise.all((await readdir(this.tmp)).map((name) => rm(join(this.tmp, name), { force: true })));
    const quarantined = [];
    for (const name of await readdir(this.metadata)) {
      if (!name.endsWith('.json')) continue;
      const value = name.slice(0, -5);
      const result = await this.inspectArtifact(value);
      if (!result.available && result.reason === 'integrity_failed') quarantined.push(value);
    }
    // An object without validated metadata has no classification, retention, or access
    // controls, so it is not eligible for recovery as a usable artifact.
    for (const prefix of await readdir(this.objects)) {
      const prefixPath = join(this.objects, prefix);
      let entries;
      try { entries = await readdir(prefixPath); } catch { continue; }
      for (const value of entries) {
        if (!validDigest(value) || !(await this.#readMetadata(value))) {
          await this.#quarantine(value, 'orphaned_object');
          quarantined.push(value);
        }
      }
    }
    return { removed_temporary_files, quarantined };
  }
}
