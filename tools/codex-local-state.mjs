import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ArtifactStore } from './verified-reuse/artifact-store.mjs';
import { ReuseLedger } from './verified-reuse/ledger.mjs';
import { createPolicyRegistry, admitReuseOperation } from './verified-reuse/policy.mjs';
import { ReadFragmentLedger } from './context-ledger.mjs';
import { QuietStateController } from './quiet-state-controller.mjs';

export const CODEX_LOCAL_STATE_API_VERSION = '1.0.0';

const SHA256 = /^[a-f0-9]{64}$/;
const DEFAULT_MAX_STORAGE_BYTES = 8 * 1024 * 1024;
const METADATA_RESERVE_BYTES = 16 * 1024;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertByteBudget(value) {
  if (!Number.isSafeInteger(value) || value < 64 * 1024 || value > 1024 * 1024 * 1024) {
    throw new TypeError('max_storage_bytes must be an integer between 65536 and 1073741824');
  }
}

function assertDigest(value, name) {
  if (!SHA256.test(value ?? '')) throw new TypeError(`${name} must be a SHA-256 digest`);
}

function compactResultProjection(result) {
  // A reuse result belongs to the caller; never replay arbitrary result fields
  // across the local-state boundary. The identity is sufficient to select the
  // normal verified route when a caller needs a richer result.
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const projection = {};
  if (typeof result.status === 'string' && /^[a-z0-9_.:-]{1,128}$/i.test(result.status)) projection.status = result.status;
  if (typeof result.outcome_identity === 'string' && /^[a-z0-9_.:-]{1,256}$/i.test(result.outcome_identity)) {
    projection.outcome_identity = result.outcome_identity;
  }
  return Object.keys(projection).length > 0 ? projection : null;
}

function compactReuse(result, admission) {
  if (admission.admission !== 'admitted') {
    return { disposition: 'unavailable', reason: admission.reason, fallback: 'normal_verified_route' };
  }
  if (!result.hit) return { disposition: 'miss', reason: result.reason, fallback: 'normal_verified_route' };
  const projection = compactResultProjection(result.entry.result);
  if (!projection) return { disposition: 'unavailable', reason: 'result_projection_denied', fallback: 'normal_verified_route' };
  return {
    disposition: 'reused',
    verification: { oracle_id: result.entry.verification.oracle_id, identity: result.entry.verification.identity },
    result: projection,
    artifacts: result.entry.artifacts.map(({ digest_sha256, byte_count }) => ({ digest_sha256, byte_count })),
  };
}

async function directoryBytes(root) {
  let total = 0;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if (error?.code === 'ENOENT') return 0; throw error; }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(path);
    else if (entry.isFile()) total += (await lstat(path)).size;
  }
  return total;
}

function safeWorkspacePath(workspace, candidate) {
  if (typeof candidate !== 'string' || !candidate || isAbsolute(candidate) || candidate.includes('\\')) {
    throw new TypeError('path must be a non-empty workspace-relative POSIX path');
  }
  const target = resolve(workspace, candidate);
  const relation = relative(workspace, target);
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new TypeError('path must remain inside the workspace');
  }
  return target;
}

/**
 * Explicit, local-only bridge for one Codex workspace. It never starts a
 * watcher or performs a model/provider/network action on its own.
 */
export class CodexLocalState {
  constructor({ workspace, state_directory, max_storage_bytes = DEFAULT_MAX_STORAGE_BYTES, quiet_policy = {} } = {}) {
    if (typeof workspace !== 'string' || !isAbsolute(workspace)) throw new TypeError('workspace must be an absolute path');
    assertByteBudget(max_storage_bytes);
    this.workspace = resolve(workspace);
    this.stateDirectory = resolve(state_directory ?? join(this.workspace, '.stolz-local-state-v1'));
    const relation = relative(this.workspace, this.stateDirectory);
    if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      throw new TypeError('state_directory must remain inside workspace');
    }
    this.maxStorageBytes = max_storage_bytes;
    this.artifacts = new ArtifactStore(join(this.stateDirectory, 'reuse-artifacts'));
    this.reuse = new ReuseLedger(join(this.stateDirectory, 'reuse-ledger'), { artifactStore: this.artifacts });
    this.context = new ReadFragmentLedger({ root: join(this.stateDirectory, 'context-fragments') });
    this.quiet = new QuietStateController({ root: join(this.stateDirectory, 'quiet-state'), policy: quiet_policy });
  }

  async initialize() {
    await mkdir(this.workspace, { recursive: true });
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const workspace = await realpath(this.workspace);
    const stateDirectory = await realpath(this.stateDirectory);
    const relation = relative(workspace, stateDirectory);
    if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      throw new TypeError('state_directory must remain inside the canonical workspace');
    }
    this.workspace = workspace;
    this.stateDirectory = stateDirectory;
    await Promise.all([this.artifacts.init(), this.reuse.init(), this.context.initialize(), this.quiet.initialize()]);
    return { api_version: CODEX_LOCAL_STATE_API_VERSION, workspace_identity: sha256(this.workspace), state_directory: this.stateDirectory };
  }

  async ensureCapacity(additionalBytes = 0) {
    if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0) throw new TypeError('additionalBytes must be a non-negative integer');
    const used = await directoryBytes(this.stateDirectory);
    if (used + additionalBytes > this.maxStorageBytes) {
      return { available: false, used_bytes: used, max_storage_bytes: this.maxStorageBytes, reason: 'storage_limit' };
    }
    return { available: true, used_bytes: used, max_storage_bytes: this.maxStorageBytes };
  }

  /** Report actual local storage overhead without inferring token or cost savings. */
  async overhead() {
    await this.initialize();
    const storage = await this.ensureCapacity(0);
    return {
      api_version: CODEX_LOCAL_STATE_API_VERSION,
      storage_bytes: storage.used_bytes,
      max_storage_bytes: storage.max_storage_bytes,
      storage_available: storage.available,
      automatic_model_invocations: 0,
    };
  }

  async recordContext({ delta, range, policy_identity, schema_identity, tool_identity, ttl_ms } = {}) {
    await this.initialize();
    assertDigest(policy_identity, 'policy_identity');
    assertDigest(schema_identity, 'schema_identity');
    assertDigest(tool_identity, 'tool_identity');
    if (!range || typeof range.path !== 'string' || !Number.isSafeInteger(range.start_byte) || !Number.isSafeInteger(range.end_byte)
      || range.start_byte < 0 || range.end_byte <= range.start_byte) throw new TypeError('range must be a strict bounded byte range');
    const target = safeWorkspacePath(this.workspace, range.path);
    const requestedRange = delta?.changed_ranges?.find((candidate) => candidate.path === range.path
      && candidate.start_byte === range.start_byte && candidate.end_byte === range.end_byte && candidate.head_blob === range.git_blob);
    if (!requestedRange) throw new TypeError('range must be declared in delta.changed_ranges');
    const byteCount = range.end_byte - range.start_byte;
    const capacity = await this.ensureCapacity(byteCount + METADATA_RESERVE_BYTES);
    if (!capacity.available) return { disposition: 'unavailable', reason: capacity.reason, fallback: 'normal_verified_route', storage: capacity };
    const contents = await readFile(target);
    if (range.end_byte > contents.length) return { disposition: 'unavailable', reason: 'range_unavailable', fallback: 'normal_verified_route' };
    const content = contents.subarray(range.start_byte, range.end_byte);
    if (sha256(content) !== requestedRange.content_sha256) return { disposition: 'unavailable', reason: 'content_identity_mismatch', fallback: 'normal_verified_route' };
    const record = await this.context.record({ delta, range, content, policy_identity, schema_identity, tool_identity, ttl_ms });
    return { disposition: 'recorded', projection: this.context.project({ state: 'hit', reference: this.context.reference(record) }), storage: capacity };
  }

  async lookupContext(request) {
    await this.initialize();
    const result = await this.context.lookup(request);
    return result.state === 'hit'
      ? { disposition: 'available', projection: this.context.project(result) }
      : { disposition: 'unavailable', reason: result.reason ?? result.state, fallback: 'normal_verified_route' };
  }

  async lookupReuse({ identity, operation, policies, now } = {}) {
    await this.initialize();
    const admission = admitReuseOperation({ identity, operation, registry: createPolicyRegistry(policies) });
    if (admission.admission !== 'admitted') return compactReuse({ hit: false }, admission);
    return compactReuse(await this.reuse.lookup(identity, { now }), admission);
  }

  async recordReuse({ identity, operation, policies, verification, result, content, media_type = 'text/plain', retention_until = null, expires_at = null } = {}) {
    await this.initialize();
    const admission = admitReuseOperation({ identity, operation, registry: createPolicyRegistry(policies) });
    if (admission.admission !== 'admitted') return compactReuse({ hit: false }, admission);
    if (!(content instanceof Uint8Array) && typeof content !== 'string') throw new TypeError('content must be a string or Uint8Array');
    const bytes = Buffer.from(content);
    const capacity = await this.ensureCapacity(bytes.length + METADATA_RESERVE_BYTES);
    if (!capacity.available) return { disposition: 'unavailable', reason: capacity.reason, fallback: 'normal_verified_route', storage: capacity };
    const artifact = await this.artifacts.putArtifact({ content: bytes, media_type, classification: 'private', retention_until });
    const entry = await this.reuse.commit({
      identity,
      admission,
      verification,
      artifacts: [{ digest_sha256: artifact.digest_sha256, byte_count: artifact.byte_count }],
      result,
      expires_at,
    });
    return { disposition: 'recorded', verification: structuredClone(entry.verification), storage: capacity };
  }

  async invalidateReuse(identity, reason) {
    await this.initialize();
    return this.reuse.invalidate(identity, reason);
  }

  async observeQuietState({ operation_id, snapshot, poller_id = 'codex-local-state' } = {}) {
    await this.initialize();
    const capacity = await this.ensureCapacity(METADATA_RESERVE_BYTES);
    if (!capacity.available) return { disposition: 'unavailable', reason: capacity.reason, fallback: 'normal_verified_route', storage: capacity };
    return this.quiet.poll({ operation_id, poller_id, fetch_state: async () => snapshot });
  }

  async recover() {
    await this.initialize();
    const [artifacts, reuse, context] = await Promise.all([this.artifacts.recover(), this.reuse.recover(), this.context.initialize()]);
    return { api_version: CODEX_LOCAL_STATE_API_VERSION, artifacts, reuse, context: { recovered: true } };
  }
}

export function openCodexLocalState({ enabled, ...options } = {}) {
  if (enabled !== true) throw new TypeError('Codex local state requires explicit enabled: true opt-in');
  return new CodexLocalState(options);
}
