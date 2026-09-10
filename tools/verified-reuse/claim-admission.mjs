import { comparisonCompleteness, STOLZ_OVERHEAD_COMPONENTS } from './measurement.mjs';

const WITHHELD_TYPES = new Set(['aggregate', 'percentage', 'cost', 'provider_wide', 'cross_scenario']);
function withheld(reason) { return { schema_id: 'reuse-claim-admission', schema_version: '1.0.0', admission: 'withheld', reason }; }

/**
 * Admits one named comparison only. A hit, fixture, or partial measurement can
 * never be upgraded into a net or broad savings claim.
 */
export function admitClaim({ claim_type = 'scenario_scoped', baseline, reuse } = {}) {
  if (WITHHELD_TYPES.has(claim_type)) return withheld('claim_type_requires_separate_qualifying_evidence');
  if (claim_type !== 'scenario_scoped') return withheld('claim_type_invalid');
  if (!comparisonCompleteness(baseline) || !comparisonCompleteness(reuse)) return withheld('comparison_components_incomplete');
  if (baseline.scenario.tuple_identity !== reuse.scenario.tuple_identity) return withheld('scenario_tuple_mismatch');
  if (baseline.terminal_outcome.status !== 'passed' || reuse.terminal_outcome.status !== 'passed' || baseline.terminal_outcome.identity !== reuse.terminal_outcome.identity) return withheld('outcome_not_equal');
  if (baseline.verification.status !== 'passed' || reuse.verification.status !== 'passed' || baseline.verification.identity !== reuse.verification.identity) return withheld('verification_not_equal');
  if (baseline.provenance.artifacts_reconstructable !== true || reuse.provenance.artifacts_reconstructable !== true || baseline.provenance.retention_status !== 'retained' || reuse.provenance.retention_status !== 'retained') return withheld('evidence_not_reconstructable');
  const gross = baseline.components.gross_avoided_work.value;
  const overhead = STOLZ_OVERHEAD_COMPONENTS.reduce((total, name) => total + reuse.components[name].value, 0);
  if (typeof gross !== 'number' || !Number.isFinite(gross) || !Number.isFinite(overhead)) return withheld('numeric_comparison_invalid');
  return { schema_id: 'reuse-claim-admission', schema_version: '1.0.0', admission: 'admitted_scoped', claim_scope: { scenario_tuple_identity: baseline.scenario.tuple_identity }, gross_avoided_work: gross, stolz_overhead: overhead, net_delta: gross - overhead };
}
