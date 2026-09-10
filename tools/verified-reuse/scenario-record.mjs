const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CLAIM_TYPES = Object.freeze(['savings', 'aggregate', 'percentage', 'cost', 'provider_wide', 'release', 'public_publication']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUtcTimestamp(value) {
  return typeof value === 'string' && UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function isDigest(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function assert(condition, message) {
  if (!condition) throw new TypeError(`invalid installed-local Codex scenario record: ${message}`);
}

/**
 * Validates the redacted, check-in-safe evidence emitted by the local Codex
 * runner. It intentionally accepts hashes and terminal facts only: prompts,
 * model output, credentials, and local paths must never enter the record.
 */
export function validateInstalledLocalCodexScenarioRecord(record) {
  assert(isObject(record), 'record must be an object');
  assert(record.schema_id === 'verified-reuse-installed-local-codex-scenarios', 'schema_id must be exact');
  assert(record.schema_version === '1.0.0', 'schema_version must be exact');
  assert(isUtcTimestamp(record.generated_at), 'generated_at must be a UTC millisecond timestamp');
  assert(isObject(record.candidate), 'candidate is required');
  assert(GIT_SHA.test(record.candidate.feature_sha), 'candidate.feature_sha must be a Git SHA');
  assert(GIT_SHA.test(record.candidate.dev_sha), 'candidate.dev_sha must be a Git SHA');
  assert(GIT_SHA.test(record.candidate.feature_tree_git_sha), 'candidate.feature_tree_git_sha must be a Git SHA');
  assert(GIT_SHA.test(record.candidate.dev_tree_git_sha), 'candidate.dev_tree_git_sha must be a Git SHA');
  assert(isObject(record.cli), 'cli is required');
  assert(record.cli.availability === 'available', 'CLI must be available');
  assert(record.cli.authorization === 'operator_authorized', 'CLI authorization must be explicit');
  assert(typeof record.cli.version === 'string' && record.cli.version.length > 0, 'CLI version is required');
  assert(isDigest(record.cli.binary_sha256), 'CLI binary digest is required');
  assert(isObject(record.redaction_retention), 'redaction_retention is required');
  assert(record.redaction_retention.raw_content_committed === false, 'raw content must not be committed');
  assert(record.redaction_retention.raw_output_retention === 'ephemeral_deleted', 'raw output must be ephemeral and deleted');
  assert(record.redaction_retention.record_content === 'hashes_and_terminal_status_only', 'record must contain hashes and terminal status only');
  assert(isObject(record.scenario_execution), 'scenario_execution is required');
  assert(['passed', 'unavailable'].includes(record.scenario_execution.status), 'scenario execution status is invalid');
  if (record.scenario_execution.status === 'unavailable') {
    assert(isUtcTimestamp(record.scenario_execution.started_at) && isUtcTimestamp(record.scenario_execution.ended_at), 'unavailable execution must retain UTC bounds');
    assert(typeof record.scenario_execution.reason === 'string' && /^[a-z0-9_]+$/.test(record.scenario_execution.reason), 'unavailable execution reason is invalid');
    assert(Array.isArray(record.scenarios) && record.scenarios.length === 0, 'unavailable execution must not admit partial scenarios');
  } else assert(Array.isArray(record.scenarios) && record.scenarios.length > 0, 'at least one paired scenario is required');

  for (const scenario of record.scenarios) {
    assert(isObject(scenario), 'scenario must be an object');
    assert(typeof scenario.scenario_id === 'string' && scenario.scenario_id.length > 0, 'scenario_id is required');
    assert(isDigest(scenario.prompt_sha256), 'scenario prompt digest is required');
    assert(isObject(scenario.baseline) && isObject(scenario.reuse), 'baseline and reuse records are required');
    for (const [role, run] of Object.entries({ baseline: scenario.baseline, reuse: scenario.reuse })) {
      assert(run.route_role === role, `${role} route role must be exact`);
      assert(run.execution === 'installed_local_codex_cli', `${role} must execute the installed local Codex CLI`);
      assert(run.terminal_status === 'passed', `${role} terminal status must pass`);
      assert(isUtcTimestamp(run.started_at) && isUtcTimestamp(run.ended_at), `${role} UTC run times are required`);
      assert(Date.parse(run.ended_at) >= Date.parse(run.started_at), `${role} cannot end before it starts`);
      assert(isDigest(run.output_sha256), `${role} output digest is required`);
      assert(isDigest(run.verification_sha256), `${role} verification digest is required`);
    }
    assert(scenario.baseline.output_sha256 === scenario.reuse.output_sha256, 'paired outcomes must be equal');
    assert(scenario.baseline.verification_sha256 === scenario.reuse.verification_sha256, 'paired required verification must be equal');
  }

  assert(isObject(record.claims), 'claim dispositions are required');
  for (const type of CLAIM_TYPES) {
    assert(record.claims[type]?.admission === 'withheld', `${type} claim must remain withheld`);
    assert(typeof record.claims[type].reason === 'string' && record.claims[type].reason.length > 0, `${type} withholding reason is required`);
  }
  return true;
}
