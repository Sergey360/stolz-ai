import {
  canReuseLedgerEntry,
  deduplicateCommand,
  evaluateBenchmark,
  nextStateEvent,
  selectSafeRoute,
  validateManifest,
} from './foundation.mjs';

const ROUTES = new Map([
  ['context', { skill: 'stolz-context', references: ['skills/stolz-context/references/manifest-and-reads.md'], capabilities: ['artifact_identity'] }],
  ['reuse', { skill: 'stolz-reuse', references: ['skills/stolz-reuse/references/ledger-and-invalidation.md'], capabilities: ['artifact_identity', 'command_execution'] }],
  ['state', { skill: 'stolz-quiet-state', references: ['skills/stolz-quiet-state/references/material-transitions.md'], capabilities: ['durable_state'] }],
  ['benchmark', { skill: 'stolz-benchmark', references: ['skills/stolz-benchmark/references/outcome-gates.md'], capabilities: ['measurement_capture'] }],
]);

function requiredTrigger(capabilities) {
  return `runtime-capability:${[...capabilities].sort().join(',')}`;
}

/**
 * Returns a resolver that has no adapter side effect until a route records the
 * exact capability trigger. A successful import is memoized for this runtime.
 */
export function createLazyCodexResolver(loadAdapter = () => import('../adapters/codex/adapter.mjs')) {
  let adapterPromise = null;

  return async function resolve({ concern, profile, trigger } = {}) {
    const route = ROUTES.get(concern);
    if (!route) return { skill: 'stolz-route', route: 'provider-neutral', reason: 'unknown_concern', references: [] };
    const expectedTrigger = requiredTrigger(route.capabilities);
    const base = { skill: route.skill, references: route.references, trigger: expectedTrigger };
    if (profile?.adapter?.adapter_id !== 'codex-local' || profile?.adapter?.resolution !== 'lazy') {
      return { ...base, route: 'provider-neutral', reason: 'adapter_unavailable' };
    }
    if (trigger !== expectedTrigger) return { ...base, route: 'provider-neutral', reason: 'capability_trigger_required' };
    try {
      adapterPromise ??= Promise.resolve().then(loadAdapter);
      const module = await adapterPromise;
      const selection = selectSafeRoute(module.codexAdapter ?? module.declaration ?? module, route.capabilities);
      return selection.route === 'adapter'
        ? { ...base, ...selection, adapter_version: module.codexAdapter?.adapter_version ?? module.declaration?.adapter_version }
        : { ...base, ...selection };
    } catch {
      return { ...base, route: 'provider-neutral', reason: 'adapter_unavailable' };
    }
  };
}

export function selectRoutedSkill({ concern, adapter = null }) {
  const route = ROUTES.get(concern);
  if (!route) return { skill: 'stolz-route', route: 'provider-neutral', reason: 'unknown_concern', references: [] };
  const selection = adapter ? selectSafeRoute(adapter, route.capabilities) : { route: 'provider-neutral', reason: 'no_adapter' };
  return { skill: route.skill, ...selection, references: route.references };
}

/**
 * Plan instruction reads after the caller identifies the current decision.
 * Discovery descriptions do not require opening every root. Legacy selectors
 * still expose allowed references; this plan includes only requested details.
 * This function performs no file reads, adapter imports or model calls.
 */
export function planSkillContext({ concern, adapter = null, needsReference = false } = {}) {
  if (typeof needsReference !== 'boolean') throw new TypeError('needsReference must be a boolean');
  if (concern === 'none') {
    return { skill: null, route: 'normal', reason: 'no_optimization', references: [], instruction_reads: [] };
  }
  const selected = selectRoutedSkill({ concern, adapter });
  const available = selected.skill === 'stolz-route'
    ? ['skills/stolz-route/references/route-selection.md']
    : selected.references;
  const references = needsReference ? [...available] : [];
  return {
    ...selected,
    references,
    instruction_reads: [`skills/${selected.skill}/SKILL.md`, ...references],
  };
}

export function prepareContext(manifest, route) {
  const checked = validateManifest(manifest);
  if (!checked.valid) return { ok: false, reason: 'invalid_manifest', errors: checked.errors, reads: [] };
  if (manifest.selected_route !== route.skill) return { ok: false, reason: 'route_mismatch', reads: [] };
  return {
    ok: true,
    reads: [
      ...manifest.source_artifacts.map((identity) => ({ ...identity, purpose: 'required_source' })),
      ...(manifest.conditional_references ?? []).filter((reference) => route.references.includes(reference.id)).map((identity) => ({ ...identity, purpose: 'conditional_reference' })),
    ],
  };
}

export function reuseOrExecute({ ledgerEntry, request, command, activeCommands = new Map(), now = new Date() }) {
  const reuse = canReuseLedgerEntry(ledgerEntry, request, now);
  if (reuse.reusable) return { action: 'reuse', entry: reuse.entry };
  const dedupe = deduplicateCommand(command, activeCommands);
  return dedupe.execute ? { action: 'execute', key: dedupe.key, reuse_reason: reuse.reason } : { action: 'coalesce', key: dedupe.key, owner: dedupe.owner, reuse_reason: reuse.reason };
}

export function reportQuietState(previous, next) {
  return nextStateEvent(previous, next);
}

export function gateBenchmark(record) {
  return evaluateBenchmark(record);
}
