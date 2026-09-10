import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SHA256 = /^[a-f0-9]{64}$/;
const SENSITIVE = /(?:authorization|api[_-]?key|password|secret|token|prompt|user.?data|private host)/i;

function unavailable(code) {
  return { schema_id: 'reuse-projection', schema_version: '1.0.0', terminal_status: 'unavailable', error: { code, message: 'projection unavailable' }, artifacts: [], fragments: [] };
}

function boundedText(value, maximum) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maximum || SENSITIVE.test(value)) return null;
  return value;
}

function validReference(reference) {
  return reference && SHA256.test(reference.digest_sha256) && Number.isSafeInteger(reference.byte_count) && reference.byte_count >= 0;
}

/**
 * Builds the only model-facing representation of a private reuse result.
 * Inputs have already been redacted by the private artifact writer; a missing
 * redaction attestation deliberately returns no content.
 */
export function createProjection({ terminal_status, summary = '', error = null, tail = '', artifacts = [], redaction = {}, policy = {} } = {}) {
  const max_tail_bytes = policy.max_tail_bytes ?? 1024;
  const max_summary_bytes = policy.max_summary_bytes ?? 1024;
  if (!Number.isSafeInteger(max_tail_bytes) || max_tail_bytes < 0 || !Number.isSafeInteger(max_summary_bytes) || max_summary_bytes < 0) throw new TypeError('projection bounds must be non-negative integers');
  if (!['passed', 'failed', 'invalidated', 'timeout', 'unavailable'].includes(terminal_status)) return unavailable('terminal_status_invalid');
  if (redaction.status !== 'passed' || typeof redaction.version !== 'string' || !redaction.version) return unavailable('redaction_unavailable');
  if (!Array.isArray(artifacts) || artifacts.some((artifact) => !validReference(artifact) || artifact.redaction_version !== redaction.version)) return unavailable('artifact_reference_invalid');
  const safeSummary = boundedText(summary, max_summary_bytes);
  const safeTail = boundedText(tail, max_tail_bytes);
  if (safeSummary === null || safeTail === null) return unavailable('content_not_redacted_or_out_of_bounds');
  const normalizedError = error === null ? null : (typeof error === 'object' && typeof error.code === 'string' && /^[a-z0-9_]+$/i.test(error.code) ? { code: error.code, message: 'operation failed' } : null);
  if (error !== null && normalizedError === null) return unavailable('error_invalid');
  return {
    schema_id: 'reuse-projection', schema_version: '1.0.0', terminal_status, summary: safeSummary, error: normalizedError, tail: safeTail,
    artifacts: artifacts.map(({ digest_sha256, byte_count }) => ({ digest_sha256, byte_count })), fragments: [],
  };
}

/** Reads a strictly bounded, redaction-compatible private fragment or no content. */
export async function getFragment({ artifactStore, digest_sha256, range, authorization, redaction_version, policy = {}, now = Date.now() } = {}) {
  const max_fragment_bytes = policy.max_fragment_bytes ?? 1024;
  if (!artifactStore || typeof artifactStore.inspectArtifact !== 'function' || typeof artifactStore.objectPath !== 'function') throw new TypeError('artifactStore is required');
  if (!SHA256.test(digest_sha256) || !authorization || authorization.decision !== 'authorized' || !Number.isSafeInteger(max_fragment_bytes) || max_fragment_bytes <= 0) return unavailable('fragment_denied');
  if (!range || !Number.isSafeInteger(range.start_byte) || !Number.isSafeInteger(range.end_byte) || range.start_byte < 0 || range.end_byte < range.start_byte || range.end_byte - range.start_byte > max_fragment_bytes) return unavailable('fragment_out_of_bounds');
  const inspected = await artifactStore.inspectArtifact(digest_sha256, { now });
  if (!inspected.available || inspected.artifact.redaction_version !== redaction_version || inspected.artifact.classification !== 'private') return unavailable('fragment_unavailable');
  let bytes;
  try { bytes = await readFile(artifactStore.objectPath(digest_sha256)); } catch { return unavailable('fragment_unavailable'); }
  if (createHash('sha256').update(bytes).digest('hex') !== digest_sha256 || range.end_byte > bytes.length) return unavailable('fragment_integrity_failed');
  const fragment = bytes.subarray(range.start_byte, range.end_byte).toString('utf8');
  if (SENSITIVE.test(fragment)) return unavailable('fragment_redaction_failed');
  return { schema_id: 'reuse-projection-fragment', schema_version: '1.0.0', terminal_status: 'available', digest_sha256, range: { ...range }, byte_count: Buffer.byteLength(fragment), content: fragment };
}
