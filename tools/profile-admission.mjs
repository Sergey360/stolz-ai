import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileIdentity, retainedArtifactSha256 } from './profile-provenance.mjs';

// Convert the module URL through Node's native file-path conversion.  `.pathname`
// is URL syntax, not a filesystem path: using it breaks Windows drive letters,
// separators, and percent-decoded names.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SENTINELS = new Set(['a', 'b', 'c', 'd', 'e'].map((letter) => letter.repeat(64)));
const TUPLES = { 'claude-code': { adapter: 'claude-code', destinations: ['.claude/skills/', '~/.claude/skills/'] }, 'qwen-code': { adapter: 'qwen-code', destinations: ['.qwen/skills/', '~/.qwen/skills/'] } };

export async function admitV3Profile(profile, { root = ROOT } = {}) {
  const runtime = profile?.agent_runtime?.id;
  const tuple = TUPLES[runtime];
  if (!tuple || profile?.runtime_install?.runtime_id !== runtime || profile?.adapter?.adapter_id !== tuple.adapter || profile.adapter.resolution !== 'lazy' || !tuple.destinations.includes(profile.runtime_install.destination)) return { admitted: false, reason: 'runtime_adapter_destination_mismatch' };
  const identities = [profile.configuration_identity, profile.task_identity, profile.measurement_session, ...(profile.reference_loads ?? []).map(({ identity }) => identity)];
  if (identities.some((identity) => !identity?.sha256 || SENTINELS.has(identity.sha256))) return { admitted: false, reason: 'placeholder_identity' };
  if (new Set(identities.map(({ sha256 }) => sha256)).size !== identities.length) return { admitted: false, reason: 'repeated_identity' };
  for (const identity of identities) if (identity.sha256 !== profileIdentity(profile, identity.id)) return { admitted: false, reason: 'identity_mismatch' };
  for (const source of [...(profile.source_artifacts ?? []), ...(profile.settings_provenance?.sources ?? [])]) {
    const path = join(root, source.id ?? source.location);
    try { await access(path); } catch { return { admitted: false, reason: 'missing_provenance_artifact' }; }
    let actual;
    try { actual = retainedArtifactSha256(await readFile(path), { format: path.endsWith('.json') ? 'json' : 'text' }); }
    catch { return { admitted: false, reason: 'malformed_provenance_artifact' }; }
    if (source.sha256 !== actual) return { admitted: false, reason: 'stale_provenance_artifact' };
  }
  if (profile.certification?.level !== 'C1' || profile.certification?.status !== 'cli_certified') return { admitted: false, reason: 'unsupported_certification_claim' };
  return { admitted: true, level: 'C1' };
}
