import { createHash } from 'node:crypto';

const decoder = new TextDecoder('utf-8', { fatal: true });

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};

/** SHA-256 of canonical JSON.  Profile self-identities omit only their own SHA. */
export function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

/**
 * Identity for a retained UTF-8 provenance artifact.
 *
 * JSON evidence is parsed and recursively canonicalized, so formatting,
 * object-key order, and Git LF/CRLF checkout conversion cannot alter its
 * identity. Plain text deliberately receives the narrower CRLF-to-LF rule;
 * lone CR bytes and every other byte remain significant. Invalid UTF-8 and
 * malformed JSON are rejected rather than being coerced into a hash.
 */
export function retainedArtifactSha256(bytes, { format = 'text' } = {}) {
  const text = decoder.decode(bytes);
  if (format === 'json') return canonicalSha256(JSON.parse(text));
  if (format === 'text') return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
  throw new TypeError(`unsupported retained artifact format: ${format}`);
}

export function profileIdentity(profile, identityName) {
  const copy = structuredClone(profile);
  for (const identity of [copy.configuration_identity, copy.task_identity, copy.measurement_session, ...(copy.reference_loads ?? []).map(({ identity }) => identity)]) {
    if (identity) delete identity.sha256;
  }
  return canonicalSha256({ identity_name: identityName, profile: copy });
}
