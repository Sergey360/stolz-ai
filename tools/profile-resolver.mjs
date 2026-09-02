import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitV3Profile } from './profile-admission.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const UNIVERSAL_SKILLS = Object.freeze(['stolz-context', 'stolz-reuse', 'stolz-quiet-state', 'stolz-route', 'stolz-benchmark']);
const profileOrder = Object.freeze(['minimal', 'evaluation', 'maintainer']);
const profileFiles = Object.freeze({ minimal: 'minimal.v1.json', evaluation: 'evaluation.v1.json', maintainer: 'maintainer.v1.json' });
const runtimes = new Set(['codex', 'claude-code', 'qwen-code']);
const overlayFiles = Object.freeze({ 'anthropic-api': 'anthropic-api.selected.json', 'alibaba-model-studio': 'alibaba-model-studio.selected.json', zai: 'zai.selected.json' });

function normalizeCapabilities(capabilities = {}) {
  return Object.fromEntries(Object.entries(capabilities).filter(([, value]) => value === true));
}

export async function loadProfiles(directory = join(root, 'profiles'), runtime = 'codex') {
  const known = runtime === 'codex'
    ? new Set(Object.values(profileFiles))
    : new Set(profileOrder.map((kind) => `${runtime}-${kind}.v3.json`));
  const names = (await readdir(directory)).filter((name) => known.has(name)).sort();
  const profiles = await Promise.all(names.map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf8'))));
  if (profiles.length !== profileOrder.length) throw new Error('the complete versioned profile set is required');
  return profiles;
}

function isCodexCompatible(profile, runtime, capabilities) {
  return profile.agent_runtime.id === runtime &&
    (profile.adapter.adapter_id === 'none' || capabilities.command_execution === true);
}

async function resolveOverlay(provider) {
  if (!provider || provider === 'none') return { overlay_id: 'none', availability: 'none' };
  const file = overlayFiles[provider];
  if (!file) return { overlay_id: provider, availability: 'unavailable', reason: 'unsupported_provider_selection' };
  const record = JSON.parse(await readFile(join(root, 'overlays', file), 'utf8'));
  return { overlay_id: record.overlay_id, availability: record.availability, record };
}

function hasRequestedIntegrations(profile, requested) {
  const declared = new Set(profile.optional_integrations.map(({ integration_id }) => integration_id));
  return requested.every((integration) => declared.has(integration));
}

function fallback(runtime, reason) {
  return {
    resolution: 'provider-neutral-fallback',
    reason,
    runtime,
    certified: false,
    profile: null,
    adapter: { adapter_id: 'none' },
    optional_integrations: [],
    core_skills: [...UNIVERSAL_SKILLS],
  };
}

/** Select the smallest compatible, declared profile; never infer an adapter. */
export async function resolveProfile({ runtime = 'codex', provider, requested_integrations = [], capabilities = {}, profiles } = {}) {
  const requested = [...new Set(requested_integrations)].sort();
  const knownIntegrations = new Set(['filesystem', 'gitlab', 'benchmark-capture']);
  if (requested.some((integration) => !knownIntegrations.has(integration))) return fallback(runtime, 'unsupported_integration');
  if (!runtimes.has(runtime)) return fallback(runtime, 'unsupported_runtime');

  const available = profiles ?? await loadProfiles(undefined, runtime);
  if (runtime !== 'codex') {
    const admitted = await Promise.all(available.map(async (profile) => ({ profile, admission: await admitV3Profile(profile) })));
    if (admitted.some(({ admission }) => !admission.admitted)) return fallback(runtime, 'profile_admission_denied');
  }
  const enabled = normalizeCapabilities(capabilities);
  const candidate = profileOrder
    .map((kind) => available.find((profile) => profile.profile_kind === kind))
    .find((profile) => profile && hasRequestedIntegrations(profile, requested) && isCodexCompatible(profile, runtime, enabled));
  if (!candidate) return fallback(runtime, 'adapter_capability_denied');

  return {
    resolution: 'profile',
    reason: 'smallest_compatible_profile',
    runtime,
    certified: true,
    profile: candidate,
    adapter: candidate.adapter,
    optional_integrations: candidate.optional_integrations.map(({ integration_id }) => integration_id),
    core_skills: candidate.core_skills.map(({ skill_id }) => skill_id),
    provider_overlay: await resolveOverlay(provider),
  };
}
