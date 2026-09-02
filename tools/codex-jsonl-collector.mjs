import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  sealBenchmarkV3Record,
  validateBenchmarkV3Record,
} from './benchmark-v3-validator.mjs';

export const CODEX_JSONL_COLLECTOR_ID = 'codex-jsonl-collector';
export const CODEX_JSONL_COLLECTOR_VERSION = '1.0.0';
export const CODEX_JSONL_REDACTION_POLICY_ID = 'benchmark-v3-codex-jsonl-redaction';
export const CODEX_JSONL_REDACTION_POLICY_VERSION = '1.0.0';

const SOURCE_URL = 'https://developers.openai.com/codex/noninteractive';
const MAX_STREAM_BYTES = 32 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REQUIRED_USAGE_FIELDS = Object.freeze([
  'input_tokens',
  'cached_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
]);
const ALLOWED_USAGE_FIELDS = new Set([...REQUIRED_USAGE_FIELDS, 'cache_write_input_tokens']);
const FAILURE_TYPES = new Set(['turn.failed', 'error']);
const SECRET_KEY = /(?:^|[_-])(?:authorization|auth|credential|secret|password|api[_-]?key)(?:$|[_-])/i;
const SECRET_VALUE = /(?:bearer|basic)\s+[A-Za-z0-9._~+\/=:-]{6,}|\bsk-[A-Za-z0-9_-]{8,}|api[_-]?key\s*[=:]\s*[A-Za-z0-9_-]{6,}|https?:\/\/[^/\s]*@/i;
const PRIVATE_MATERIAL = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(?::\d+)?(?:\/|\b)|(?:^|["'\s])(?:\/home\/|\/root\/|[A-Za-z]:\\)/i;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)));
}

function containsForbiddenMaterial(value) {
  if (typeof value === 'string') return SECRET_VALUE.test(value) || PRIVATE_MATERIAL.test(value);
  if (Array.isArray(value)) return value.some(containsForbiddenMaterial);
  return Boolean(value && typeof value === 'object'
    && Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || containsForbiddenMaterial(child)));
}

function assertIdentifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new Error(`codex_jsonl_invalid_${name}`);
}

function assertSha(value, name) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`codex_jsonl_invalid_${name}`);
}

function assertUtc(value, name) {
  if (typeof value !== 'string' || !UTC.test(value) || Number.isNaN(new Date(value).valueOf()) || new Date(value).toISOString() !== value) {
    throw new Error(`codex_jsonl_invalid_${name}`);
  }
}

function validateContext(context) {
  const keys = [
    'attempt_id',
    'parent_identity',
    'route_id',
    'environment_id',
    'configuration_sha256',
    'capture_window',
    'retention',
    'source',
    'cli',
  ];
  if (!exactKeys(context, keys) || containsForbiddenMaterial(context)) throw new Error('codex_jsonl_context_rejected');
  assertIdentifier(context.attempt_id, 'attempt_id');
  assertSha(context.parent_identity, 'parent_identity');
  assertIdentifier(context.route_id, 'route_id');
  assertIdentifier(context.environment_id, 'environment_id');
  assertSha(context.configuration_sha256, 'configuration_sha256');
  if (!exactKeys(context.capture_window, ['started_at', 'ended_at'])) throw new Error('codex_jsonl_invalid_capture_window');
  assertUtc(context.capture_window.started_at, 'capture_started_at');
  assertUtc(context.capture_window.ended_at, 'capture_ended_at');
  if (context.capture_window.started_at > context.capture_window.ended_at) throw new Error('codex_jsonl_capture_window_reversed');
  if (!exactKeys(context.retention, ['opaque_locator', 'retain_until'])) throw new Error('codex_jsonl_invalid_retention');
  if (typeof context.retention.opaque_locator !== 'string' || !/^retained:[A-Za-z0-9._:-]+$/.test(context.retention.opaque_locator)) {
    throw new Error('codex_jsonl_invalid_retention_locator');
  }
  assertUtc(context.retention.retain_until, 'retain_until');
  if (context.retention.retain_until <= context.capture_window.ended_at) throw new Error('codex_jsonl_retention_expired');
  if (!exactKeys(context.source, ['url', 'snapshot_sha256', 'version', 'retrieved_at']) || context.source.url !== SOURCE_URL) {
    throw new Error('codex_jsonl_invalid_source_pin');
  }
  assertSha(context.source.snapshot_sha256, 'source_snapshot_sha256');
  assertIdentifier(context.source.version, 'source_version');
  assertUtc(context.source.retrieved_at, 'source_retrieved_at');
  if (!exactKeys(context.cli, ['version', 'model_configuration', 'reasoning_effort', 'authentication_mode'])) {
    throw new Error('codex_jsonl_invalid_cli_identity');
  }
  assertIdentifier(context.cli.version, 'cli_version');
  assertIdentifier(context.cli.model_configuration, 'model_configuration');
  if (!['minimal', 'low', 'medium', 'high', 'xhigh'].includes(context.cli.reasoning_effort)) throw new Error('codex_jsonl_invalid_reasoning_effort');
  if (context.cli.authentication_mode !== 'chatgpt_managed') throw new Error('codex_jsonl_invalid_authentication_mode');
}

function parseEventStream(rawEventStream) {
  if (typeof rawEventStream !== 'string') throw new Error('codex_jsonl_stream_must_be_text');
  const bytes = Buffer.byteLength(rawEventStream);
  if (bytes === 0 || bytes > MAX_STREAM_BYTES) throw new Error('codex_jsonl_stream_size_rejected');
  const lines = rawEventStream.split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error('codex_jsonl_stream_empty');
  const events = lines.map((line, index) => {
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') throw new Error('shape');
      return event;
    } catch {
      throw new Error(`codex_jsonl_invalid_line_${index + 1}`);
    }
  });
  const completed = events.filter(({ type }) => type === 'turn.completed');
  const failures = events.filter(({ type }) => FAILURE_TYPES.has(type));
  if (failures.length > 0) throw new Error('codex_jsonl_failed_or_error_terminal');
  if (completed.length !== 1) throw new Error(completed.length === 0 ? 'codex_jsonl_missing_success_terminal' : 'codex_jsonl_multiple_success_terminals');
  const terminal = completed[0];
  if (!exactKeys(terminal, ['type', 'usage']) || !terminal.usage || typeof terminal.usage !== 'object' || Array.isArray(terminal.usage)) {
    throw new Error('codex_jsonl_invalid_success_terminal');
  }
  const unknownUsage = Object.keys(terminal.usage).filter((key) => !ALLOWED_USAGE_FIELDS.has(key));
  if (unknownUsage.length > 0) throw new Error('codex_jsonl_unknown_usage_field');
  for (const name of REQUIRED_USAGE_FIELDS) {
    if (!Number.isSafeInteger(terminal.usage[name]) || terminal.usage[name] < 0) throw new Error(`codex_jsonl_invalid_usage_${name}`);
  }
  if (terminal.usage.cached_input_tokens > terminal.usage.input_tokens) throw new Error('codex_jsonl_cached_input_exceeds_input');
  if (terminal.usage.reasoning_output_tokens > terminal.usage.output_tokens) throw new Error('codex_jsonl_reasoning_output_exceeds_output');
  if (Object.hasOwn(terminal.usage, 'cache_write_input_tokens')
    && (!Number.isSafeInteger(terminal.usage.cache_write_input_tokens) || terminal.usage.cache_write_input_tokens < 0)) {
    throw new Error('codex_jsonl_invalid_usage_cache_write_input_tokens');
  }
  return { events, terminal };
}

function providerMetric(name, value, sourceIdentity) {
  return {
    name,
    availability: 'available',
    provenance: 'provider_reported',
    source_identity: sourceIdentity,
    unit: 'tokens',
    value,
  };
}

function unavailableMetric(name, sourceIdentity, reason) {
  return {
    name,
    availability: 'unavailable',
    provenance: 'provider_reported',
    source_identity: sourceIdentity,
    unit: 'tokens',
    reason,
  };
}

async function validateProducedRecords(records) {
  for (const [name, record] of Object.entries(records)) {
    const validation = await validateBenchmarkV3Record(record);
    if (!validation.valid) throw new Error(`codex_jsonl_invalid_${name}_record:${JSON.stringify(validation.errors)}`);
  }
}

/**
 * Parse one exact Codex `--json` stream and retain only the successful
 * `turn.completed.usage` fields authorized by the issue. Agent messages,
 * prompts, commands, outputs, thread IDs, errors, and private paths are never
 * copied into the sanitized stream or records.
 */
export async function collectCodexJsonlUsage({ raw_event_stream: rawEventStream, context }) {
  validateContext(context);
  const { events, terminal } = parseEventStream(rawEventStream);
  const rawIdentity = sha256(rawEventStream);
  const sanitizedEvent = {
    type: 'turn.completed',
    usage: Object.fromEntries(REQUIRED_USAGE_FIELDS.map((name) => [name, terminal.usage[name]])),
  };
  const sanitizedEventStream = `${JSON.stringify(sanitizedEvent)}\n`;
  const retainedIdentity = sha256(sanitizedEventStream);
  if (rawIdentity === retainedIdentity) throw new Error('codex_jsonl_raw_retained_identity_reused');
  const sourceEventId = `turn-${retainedIdentity.slice(0, 24)}`;
  const usage = sealBenchmarkV3Record({
    schema_id: 'codex-jsonl-usage',
    schema_version: '1.0.0',
    record_id: `usage-${retainedIdentity.slice(0, 24)}`,
    captured_at: context.capture_window.ended_at,
    track: 'provider_native',
    source_event_id: sourceEventId,
    input_tokens: providerMetric('input_tokens', terminal.usage.input_tokens, retainedIdentity),
    cached_input_tokens: providerMetric('cached_input_tokens', terminal.usage.cached_input_tokens, retainedIdentity),
    cache_write_input_tokens: unavailableMetric(
      'cache_write_input_tokens',
      retainedIdentity,
      'The authorized Codex JSONL contract does not admit cache-write partition values.',
    ),
    output_tokens: providerMetric('output_tokens', terminal.usage.output_tokens, retainedIdentity),
    reasoning_output_tokens: providerMetric('reasoning_output_tokens', terminal.usage.reasoning_output_tokens, retainedIdentity),
    total_tokens: unavailableMetric(
      'total_tokens',
      retainedIdentity,
      'The Codex turn.completed.usage event does not report an authoritative total_tokens field.',
    ),
  });
  const provenance = sealBenchmarkV3Record({
    schema_id: 'evidence-provenance',
    schema_version: '1.1.0',
    record_id: `provenance-${rawIdentity.slice(0, 24)}`,
    captured_at: context.capture_window.ended_at,
    track: 'provider_native',
    capture_method: 'codex_cli_jsonl',
    collector: { id: CODEX_JSONL_COLLECTOR_ID, version: CODEX_JSONL_COLLECTOR_VERSION },
    tuple: {
      runtime_id: 'codex-cli',
      runtime_version: context.cli.version,
      adapter_id: CODEX_JSONL_COLLECTOR_ID,
      adapter_version: CODEX_JSONL_COLLECTOR_VERSION,
      provider_id: 'openai',
      model_configuration: context.cli.model_configuration,
      configuration_sha256: context.configuration_sha256,
      route_id: context.route_id,
      environment_id: context.environment_id,
    },
    capture_window: structuredClone(context.capture_window),
    attempt_id: context.attempt_id,
    parent_identity: context.parent_identity,
    source_event_id: sourceEventId,
    raw_evidence_sha256: rawIdentity,
    retained_evidence_sha256: retainedIdentity,
    redaction: {
      policy_id: CODEX_JSONL_REDACTION_POLICY_ID,
      policy_version: CODEX_JSONL_REDACTION_POLICY_VERSION,
      result: 'passed',
      findings_count: (events.length - 1) + (Object.hasOwn(terminal.usage, 'cache_write_input_tokens') ? 1 : 0),
    },
    retention: {
      access_class: 'private_retained',
      opaque_locator: context.retention.opaque_locator,
      retain_until: context.retention.retain_until,
      disposal_status: 'retained',
    },
    source: {
      authority: 'openai_codex',
      reference: context.source.url,
      snapshot_sha256: context.source.snapshot_sha256,
      retrieved_at: context.source.retrieved_at,
    },
    admission: { disposition: 'admitted' },
  });
  const retainedArtifact = {
    schema: 'stolz.codex-jsonl-retained-usage.v1',
    evidence_class: 'provider_primary',
    track: 'provider_native',
    capture_method: 'codex_cli_jsonl',
    source_event_id: sourceEventId,
    raw_event_stream_sha256: rawIdentity,
    sanitized_event_stream_sha256: retainedIdentity,
    removed_event_count: events.length - 1,
    unsupported_fields: {
      cache_write_input_tokens: 'unavailable',
      total_tokens: 'unavailable',
      service_tier: 'unavailable',
      price: 'unavailable',
      cost: 'unavailable',
    },
    redaction: {
      policy_id: CODEX_JSONL_REDACTION_POLICY_ID,
      policy_version: CODEX_JSONL_REDACTION_POLICY_VERSION,
      result: 'passed',
      content_retained: false,
    },
    claim_disposition: 'withheld_pending_paired_report_admission',
  };
  if (containsForbiddenMaterial(sanitizedEvent) || containsForbiddenMaterial(retainedArtifact) || containsForbiddenMaterial({ provenance, usage })) {
    throw new Error('codex_jsonl_sanitized_material_rejected');
  }
  const records = { provenance, usage };
  await validateProducedRecords(records);
  return {
    schema_version: '1.0.0',
    collector_id: CODEX_JSONL_COLLECTOR_ID,
    collector_version: CODEX_JSONL_COLLECTOR_VERSION,
    track: 'provider_native',
    status: 'captured',
    raw_evidence_sha256: rawIdentity,
    retained_evidence_sha256: retainedIdentity,
    sanitized_event_stream: sanitizedEventStream,
    retained_artifact: retainedArtifact,
    records,
    observation_scope: 'exact_codex_turn_only',
    claim_disposition: 'withheld_pending_paired_report_admission',
  };
}

function pathInside(parent, candidate) {
  const relation = relative(parent, candidate);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

/** Persist only the exact sanitized stream and minimized identities/records. */
export async function writePrivateCodexJsonlCapture({
  private_directory: privateDirectory,
  repository_root: repositoryRoot = process.cwd(),
  raw_event_stream: rawEventStream,
  capture,
}) {
  if (typeof privateDirectory !== 'string' || !isAbsolute(privateDirectory)) throw new Error('codex_jsonl_private_directory_must_be_absolute');
  if (!capture || capture.status !== 'captured') throw new Error('codex_jsonl_capture_not_persistable');
  if (sha256(rawEventStream) !== capture.raw_evidence_sha256) throw new Error('codex_jsonl_raw_identity_mismatch');
  if (sha256(capture.sanitized_event_stream) !== capture.retained_evidence_sha256) throw new Error('codex_jsonl_retained_identity_mismatch');
  if (containsForbiddenMaterial(capture.sanitized_event_stream)
    || containsForbiddenMaterial(capture.retained_artifact)
    || containsForbiddenMaterial(capture.records)) throw new Error('codex_jsonl_persisted_material_rejected');

  const repositoryPath = await realpath(resolve(repositoryRoot));
  const requestedPath = resolve(privateDirectory);
  if (pathInside(repositoryPath, requestedPath)) throw new Error('codex_jsonl_private_directory_inside_repository');
  await mkdir(requestedPath, { recursive: true, mode: 0o700 });
  const rootInfo = await lstat(requestedPath);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('codex_jsonl_private_directory_rejected');
  await chmod(requestedPath, 0o700);
  const privateRoot = await realpath(requestedPath);
  if (pathInside(repositoryPath, privateRoot)) throw new Error('codex_jsonl_private_directory_resolves_inside_repository');
  const captureDirectory = resolve(privateRoot, `codex-${capture.raw_evidence_sha256.slice(0, 20)}`);
  if (!pathInside(privateRoot, captureDirectory)) throw new Error('codex_jsonl_private_capture_path_rejected');
  await mkdir(captureDirectory, { recursive: false, mode: 0o700 });
  await chmod(captureDirectory, 0o700);

  const rawIdentityPath = resolve(captureDirectory, 'raw-identity.json');
  const retainedPath = resolve(captureDirectory, 'sanitized-events.jsonl');
  const artifactPath = resolve(captureDirectory, 'retained-artifact.json');
  const recordsPath = resolve(captureDirectory, 'collector-records.json');
  const rawIdentity = {
    raw_evidence_sha256: capture.raw_evidence_sha256,
    source_event_id: capture.records.provenance.source_event_id,
    captured_at: capture.records.provenance.captured_at,
    payload_retention: 'operator_owned_private_store_only',
  };
  await writeFile(rawIdentityPath, `${JSON.stringify(rawIdentity, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await writeFile(retainedPath, capture.sanitized_event_stream, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await writeFile(artifactPath, `${JSON.stringify(capture.retained_artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await writeFile(recordsPath, `${JSON.stringify(capture.records, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await Promise.all([rawIdentityPath, retainedPath, artifactPath, recordsPath].map((path) => chmod(path, 0o600)));
  return {
    opaque_locator: contextlessLocator(capture),
    capture_directory: captureDirectory,
    files: { raw_identity: rawIdentityPath, retained: retainedPath, artifact: artifactPath, records: recordsPath },
  };
}

function contextlessLocator(capture) {
  return `retained:${capture.raw_evidence_sha256.slice(0, 20)}`;
}
