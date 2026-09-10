import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { reuseIdentitySha256 } from './identity.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const ENTRY_KEYS = new Set(['schema_id', 'schema_version', 'canonicalization_version', 'identity_digest_sha256', 'policy_id', 'policy_version', 'created_at', 'expires_at', 'verification', 'artifacts', 'result']);
const RESULT_FORBIDDEN_KEYS = /(?:stdout|stderr|content|log|prompt|secret|user.?data|path)/i;
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
function bytes(value) { return Buffer.from(JSON.stringify(canonical(value)), 'utf8'); }
function hash(value) { return createHash('sha256').update(bytes(value)).digest('hex'); }
function dateOrNull(value) { return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value))); }

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || Object.keys(entry).some((key) => !ENTRY_KEYS.has(key))) return false;
  if (entry.schema_id !== 'reuse-ledger-entry' || entry.schema_version !== '1.0.0' || entry.canonicalization_version !== '1' || !SHA256.test(entry.identity_digest_sha256) || typeof entry.policy_id !== 'string' || typeof entry.policy_version !== 'string' || !dateOrNull(entry.expires_at) || !dateOrNull(entry.created_at)) return false;
  if (!entry.verification || entry.verification.status !== 'passed' || typeof entry.verification.oracle_id !== 'string' || typeof entry.verification.identity !== 'string') return false;
  if (!Array.isArray(entry.artifacts) || entry.artifacts.some((artifact) => !artifact || Object.keys(artifact).some((key) => !['digest_sha256', 'byte_count'].includes(key)) || !SHA256.test(artifact.digest_sha256) || !Number.isSafeInteger(artifact.byte_count) || artifact.byte_count < 0)) return false;
  if (!entry.result || typeof entry.result !== 'object' || Object.keys(entry.result).some((key) => RESULT_FORBIDDEN_KEYS.test(key)) || JSON.stringify(entry.result).length > 4096) return false;
  return true;
}

/** Private immutable ledger. Its derived index is always rebuildable from entries and invalidation events. */
export class ReuseLedger {
  constructor(root, { artifactStore } = {}) {
    if (typeof root !== 'string' || !root) throw new TypeError('ledger root is required');
    if (!artifactStore || typeof artifactStore.inspectArtifact !== 'function') throw new TypeError('artifactStore is required');
    this.root = root; this.artifactStore = artifactStore;
    this.entries = join(root, 'entries'); this.invalidations = join(root, 'invalidations'); this.tmp = join(root, 'tmp'); this.quarantine = join(root, 'quarantine');
  }
  async init() { await Promise.all([this.entries, this.invalidations, this.tmp, this.quarantine].map((path) => mkdir(path, { recursive: true, mode: 0o700 }))); return this; }
  entryPath(identityDigest) { return join(this.entries, `${identityDigest}.json`); }

  async #atomicWrite(path, value) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = join(this.tmp, `${randomUUID()}.tmp`); const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(bytes(value)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  }
  async #read(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } }
  async #quarantine(identityDigest, reason) {
    try { await rename(this.entryPath(identityDigest), join(this.quarantine, `${identityDigest}-${Date.now()}-${randomUUID()}.json`)); } catch { /* already unavailable */ }
    await this.invalidateDigest(identityDigest, reason);
  }
  async invalidateDigest(identity_digest_sha256, reason = 'explicit_purge') {
    if (!SHA256.test(identity_digest_sha256)) throw new TypeError('invalid identity digest');
    const event = { schema_id: 'reuse-ledger-invalidation', schema_version: '1.0.0', identity_digest_sha256, reason, invalidated_at: new Date().toISOString() };
    await this.init(); await this.#atomicWrite(join(this.invalidations, `${hash(event)}.json`), event); return event;
  }
  async invalidate(identity, reason) { return this.invalidateDigest(reuseIdentitySha256(identity), reason); }
  async #invalidated(identityDigest) {
    for (const name of await readdir(this.invalidations)) { const event = await this.#read(join(this.invalidations, name)); if (event?.identity_digest_sha256 === identityDigest) return event.reason || 'explicit_purge'; }
    return null;
  }

  async commit({ identity, admission, verification, artifacts, result, expires_at = null, created_at = new Date().toISOString() } = {}) {
    await this.init();
    const identity_digest_sha256 = reuseIdentitySha256(identity);
    if (!admission || admission.admission !== 'admitted' || admission.policy_id !== identity.policy.policy_id || admission.policy_version !== identity.policy.policy_version) throw new TypeError('admitted policy decision is required');
    if (!verification || verification.status !== 'passed' || verification.oracle_id !== admission.required_verification_oracle_id || typeof verification.identity !== 'string') throw new TypeError('passing required verification is required');
    if (!Array.isArray(artifacts) || !artifacts.length) throw new TypeError('at least one external artifact is required');
    const references = [];
    for (const artifact of artifacts) {
      const inspected = await this.artifactStore.inspectArtifact(artifact.digest_sha256);
      if (!inspected.available || inspected.artifact.byte_count !== artifact.byte_count) throw new TypeError('required artifact is unavailable or unverifiable');
      references.push({ digest_sha256: artifact.digest_sha256, byte_count: artifact.byte_count });
    }
    const entry = { schema_id: 'reuse-ledger-entry', schema_version: '1.0.0', canonicalization_version: '1', identity_digest_sha256, policy_id: admission.policy_id, policy_version: admission.policy_version, created_at, expires_at, verification: { oracle_id: verification.oracle_id, identity: verification.identity, status: 'passed' }, artifacts: references, result };
    if (!validateEntry(entry)) throw new TypeError('invalid or non-private ledger entry');
    const previous = await this.#read(this.entryPath(identity_digest_sha256));
    if (previous && JSON.stringify(canonical(previous)) !== JSON.stringify(canonical(entry))) throw new TypeError('conflicting immutable ledger entry');
    if (!previous) await this.#atomicWrite(this.entryPath(identity_digest_sha256), entry);
    return structuredClone(entry);
  }

  async lookup(identity, { now = Date.now() } = {}) {
    await this.init(); const identity_digest_sha256 = reuseIdentitySha256(identity);
    const invalidated = await this.#invalidated(identity_digest_sha256); if (invalidated) return { hit: false, reason: invalidated };
    const entry = await this.#read(this.entryPath(identity_digest_sha256)); if (!entry) return { hit: false, reason: 'not_found' };
    if (!validateEntry(entry) || entry.identity_digest_sha256 !== identity_digest_sha256 || !Buffer.from(await readFile(this.entryPath(identity_digest_sha256))).equals(bytes(entry))) { await this.#quarantine(identity_digest_sha256, 'integrity_failed'); return { hit: false, reason: 'integrity_failed' }; }
    if (entry.expires_at !== null && Date.parse(entry.expires_at) <= now) { await this.invalidateDigest(identity_digest_sha256, 'ttl_expired'); return { hit: false, reason: 'ttl_expired' }; }
    for (const artifact of entry.artifacts) { const inspected = await this.artifactStore.inspectArtifact(artifact.digest_sha256, { now }); if (!inspected.available || inspected.artifact.byte_count !== artifact.byte_count) { await this.invalidateDigest(identity_digest_sha256, inspected.reason === 'integrity_failed' ? 'integrity_failed' : 'artifact_unavailable'); return { hit: false, reason: 'artifact_unavailable' }; } }
    return { hit: true, entry: structuredClone(entry) };
  }

  async rebuildIndex({ now = Date.now() } = {}) {
    await this.init(); const rebuilt = new Map(); const quarantined = [];
    for (const name of await readdir(this.entries)) {
      if (!name.endsWith('.json')) continue; const digest = name.slice(0, -5); const entry = await this.#read(join(this.entries, name));
      if (!SHA256.test(digest) || !validateEntry(entry) || entry.identity_digest_sha256 !== digest || !Buffer.from(await readFile(join(this.entries, name))).equals(bytes(entry))) { await this.#quarantine(digest, 'integrity_failed'); quarantined.push(digest); continue; }
      if (entry.expires_at !== null && Date.parse(entry.expires_at) <= now) { await this.invalidateDigest(digest, 'ttl_expired'); continue; }
      let available = true; for (const artifact of entry.artifacts) if (!(await this.artifactStore.inspectArtifact(artifact.digest_sha256, { now })).available) available = false;
      if (!available) { await this.invalidateDigest(digest, 'artifact_unavailable'); continue; }
      if (!(await this.#invalidated(digest))) rebuilt.set(digest, entry);
    }
    return { index: rebuilt, quarantined };
  }

  async recover(options) { await this.init(); const removed_temporary_files = (await readdir(this.tmp)).length; await Promise.all((await readdir(this.tmp)).map((name) => rm(join(this.tmp, name), { force: true }))); const rebuilt = await this.rebuildIndex(options); return { removed_temporary_files, ...rebuilt }; }
}
