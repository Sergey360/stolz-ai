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

export function selectRoutedSkill({ concern, adapter = null }) {
  const route = ROUTES.get(concern);
  if (!route) return { skill: 'stolz-route', route: 'provider-neutral', reason: 'unknown_concern', references: [] };
  const selection = adapter ? selectSafeRoute(adapter, route.capabilities) : { route: 'provider-neutral', reason: 'no_adapter' };
  return { skill: route.skill, ...selection, references: route.references };
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
