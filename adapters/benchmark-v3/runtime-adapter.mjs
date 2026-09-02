import { createHash } from 'node:crypto';

import { sealBenchmarkV3Record } from '../../tools/benchmark-v3-validator.mjs';

export const RUNTIME_METRIC_NAMES = Object.freeze([
  'model_wakeups',
  'tool_calls',
  'tool_output_bytes',
  'wall_time_ms',
  'operator_interventions',
  'compaction_events',
]);

const CAPABILITY_KEYS = Object.freeze([
  'schema_id',
  'schema_version',
  'track',
  'adapter_id',
  'adapter_version',
  'runtime_id',
  'runtime_versions',
  'capture_method',
  'observer',
  'redaction',
  'metrics',
]);
const OBSERVER_KEYS = Object.freeze(['id', 'version', 'source_reference']);
const REDACTION_KEYS = Object.freeze(['policy_id', 'policy_version', 'payload_retention']);
const METRIC_CAPABILITY_KEYS = Object.freeze([
  'availability',
  'unit',
  'provenance',
  'missing_availability',
  'missing_reason',
]);
const EVENT_KEYS = new Set([
  'schema_id',
  'schema_version',
  'capture_scope',
  'runtime_id',
  'runtime_version',
  'observer',
  'event_id',
  'captured_at',
  'capture_window',
  'attempt_id',
  'parent_identity',
  'configuration_sha256',
  'route_id',
  'environment_id',
  'retain_until',
  'observations',
  'private_payload',
]);
const CROSS_TRACK_KEYS = new Set([
  'provider_native',
  'provider_usage',
  'provider_tokens',
  'provider_id',
  'model_id',
  'model_configuration',
  'responses_usage',
  'responses_export',
  'response_id',
  'source_response_id',
  'input_tokens',
  'output_tokens',
  'reasoning_tokens',
  'total_tokens',
  'cached_tokens',
  'cache_write_tokens',
  'token_usage',
  'tokens',
  'usage',
  'billing',
  'billing_amount',
  'cost',
  'price',
  'pricing',
  'currency',
  'service_tier',
]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SEMVER = /^[1-9]\d*\.\d+\.\d+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SOURCE_REFERENCE = /^runtime:[A-Za-z0-9./_?=&:%-]+$/;
const SAFE_REASON = /(?:authorization|bearer\s|api[_-]?key|secret|password|sk-[A-Za-z0-9_-]{8,}|(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+))/i;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonicalSha256(domain, value) {
  return createHash('sha256').update(JSON.stringify({ domain, value: stable(value) }), 'utf8').digest('hex');
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function publicClone(value) {
  return structuredClone(value);
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function hasCrossTrackKey(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => hasCrossTrackKey(entry, seen));
  return Object.entries(value).some(([key, nested]) => CROSS_TRACK_KEYS.has(key) || hasCrossTrackKey(nested, seen));
}

function assertSafeReason(reason) {
  if (typeof reason !== 'string' || reason.length < 1 || reason.length > 500 || SAFE_REASON.test(reason)) {
    throw new TypeError('runtime observation reason is not retainable');
  }
}

function validateCapability(capability) {
  if (!exactKeys(capability, CAPABILITY_KEYS)) throw new TypeError('runtime adapter capability must be closed');
  if (capability.schema_id !== 'benchmark-v3-runtime-adapter-capability'
    || capability.schema_version !== '1.0.0'
    || capability.track !== 'runtime_measured'
    || capability.capture_method !== 'runtime_event'
    || !IDENTIFIER.test(capability.adapter_id)
    || !SEMVER.test(capability.adapter_version)
    || !IDENTIFIER.test(capability.runtime_id)
    || !Array.isArray(capability.runtime_versions)
    || capability.runtime_versions.length < 1
    || new Set(capability.runtime_versions).size !== capability.runtime_versions.length
    || capability.runtime_versions.some((version) => !IDENTIFIER.test(version))) {
    throw new TypeError('invalid runtime adapter capability tuple');
  }
  if (!exactKeys(capability.observer, OBSERVER_KEYS)
    || !IDENTIFIER.test(capability.observer.id)
    || !SEMVER.test(capability.observer.version)
    || !SOURCE_REFERENCE.test(capability.observer.source_reference)) {
    throw new TypeError('invalid runtime observer capability');
  }
  if (!exactKeys(capability.redaction, REDACTION_KEYS)
    || !IDENTIFIER.test(capability.redaction.policy_id)
    || !SEMVER.test(capability.redaction.policy_version)
    || capability.redaction.payload_retention !== 'excluded') {
    throw new TypeError('invalid runtime redaction capability');
  }
  if (!exactKeys(capability.metrics, RUNTIME_METRIC_NAMES)) throw new TypeError('runtime metric capability set must be exact');
  for (const [name, metric] of Object.entries(capability.metrics)) {
    if (!exactKeys(metric, METRIC_CAPABILITY_KEYS)
      || !['available', 'unavailable'].includes(metric.availability)
      || !['count', 'bytes', 'milliseconds'].includes(metric.unit)
      || !['runtime_emitted', 'runtime_observed'].includes(metric.provenance)
      || !['unknown', 'unavailable'].includes(metric.missing_availability)) {
      throw new TypeError(`invalid runtime metric capability:${name}`);
    }
    assertSafeReason(metric.missing_reason);
    if (metric.availability === 'unavailable' && metric.missing_availability !== 'unavailable') {
      throw new TypeError(`unavailable runtime metric must stay unavailable:${name}`);
    }
  }
}

function terminal(capability, capabilitySha256, status, reason) {
  return deepFreeze({
    status,
    reason,
    track: 'runtime_measured',
    capability: { ...publicClone(capability), capability_sha256: capabilitySha256 },
  });
}

function validateEventEnvelope(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new TypeError('runtime event must be an object');
  try {
    JSON.stringify(event);
  } catch {
    throw new TypeError('runtime event must be JSON-serializable');
  }
  if (hasCrossTrackKey(event)) throw new TypeError('runtime event contains provider-native usage or billing fields');
  if (Object.keys(event).some((key) => !EVENT_KEYS.has(key))) throw new TypeError('runtime event contains an unknown field');
}

function normalizeObservation(name, observation, capability, sourceContext) {
  const metricCapability = capability.metrics[name];
  if (observation === undefined) {
    return {
      name,
      availability: metricCapability.missing_availability,
      provenance: metricCapability.provenance,
      source_identity: canonicalSha256('stolz-benchmark-v3-runtime-metric-source-v1', {
        ...sourceContext,
        name,
        disposition: metricCapability.missing_availability,
      }),
      unit: metricCapability.unit,
      reason: metricCapability.missing_reason,
    };
  }
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new TypeError(`runtime observation must be an object:${name}`);
  }
  const availability = observation.availability;
  const keys = availability === 'available' ? ['availability', 'value'] : ['availability', 'reason'];
  if (!exactKeys(observation, keys) || !['available', 'unknown', 'unavailable'].includes(availability)) {
    throw new TypeError(`runtime observation availability is invalid:${name}`);
  }
  if (metricCapability.availability === 'unavailable' && availability !== 'unavailable') {
    throw new TypeError(`runtime observation exceeds declared capability:${name}`);
  }
  if (availability === 'available') {
    if (!Number.isSafeInteger(observation.value) || observation.value < 0) {
      throw new TypeError(`runtime observation value must be a non-negative safe integer:${name}`);
    }
  } else {
    assertSafeReason(observation.reason);
  }
  const retainedObservation = availability === 'available'
    ? { availability, value: observation.value }
    : { availability, reason: observation.reason };
  return {
    name,
    ...retainedObservation,
    provenance: metricCapability.provenance,
    source_identity: canonicalSha256('stolz-benchmark-v3-runtime-metric-source-v1', {
      ...sourceContext,
      name,
      observation: retainedObservation,
    }),
    unit: metricCapability.unit,
  };
}

function assertCaptureFields(event) {
  const requiredIdentifiers = ['event_id', 'attempt_id', 'route_id', 'environment_id'];
  if (event.schema_id !== 'benchmark-v3-runtime-event'
    || event.schema_version !== '1.0.0'
    || !['synthetic_fixture', 'runtime_observation'].includes(event.capture_scope)
    || requiredIdentifiers.some((key) => !IDENTIFIER.test(event[key] ?? ''))
    || !SHA256.test(event.parent_identity ?? '')
    || !SHA256.test(event.configuration_sha256 ?? '')
    || !validTimestamp(event.captured_at)
    || !validTimestamp(event.capture_window?.started_at)
    || !validTimestamp(event.capture_window?.ended_at)
    || !validTimestamp(event.retain_until)
    || event.capture_window.started_at > event.capture_window.ended_at
    || event.captured_at < event.capture_window.started_at
    || event.captured_at > event.capture_window.ended_at
    || event.retain_until <= event.capture_window.ended_at) {
    throw new TypeError('runtime capture identity, time, or retention is invalid');
  }
  if (!event.observations || typeof event.observations !== 'object' || Array.isArray(event.observations)
    || Object.keys(event.observations).some((name) => !RUNTIME_METRIC_NAMES.includes(name))) {
    throw new TypeError('runtime observations must use the closed metric set');
  }
}

export function createBenchmarkV3RuntimeAdapter(capabilityInput) {
  const capability = publicClone(capabilityInput);
  validateCapability(capability);
  const capabilitySha256 = canonicalSha256('stolz-benchmark-v3-runtime-capability-v1', capability);
  const publishedCapability = deepFreeze({ ...publicClone(capability), capability_sha256: capabilitySha256 });

  function getCapability() {
    return publicClone(publishedCapability);
  }

  function captureEvent(event) {
    validateEventEnvelope(event);
    if (event.runtime_id === undefined || event.runtime_version === undefined) {
      return terminal(capability, capabilitySha256, 'unknown', 'runtime_identity_or_version_unknown');
    }
    if (event.runtime_id !== capability.runtime_id || !capability.runtime_versions.includes(event.runtime_version)) {
      return terminal(capability, capabilitySha256, 'unavailable', 'runtime_tuple_not_supported');
    }
    if (!event.observer?.id || !event.observer?.version) {
      return terminal(capability, capabilitySha256, 'unknown', 'runtime_observer_identity_or_version_unknown');
    }
    if (event.observer.id !== capability.observer.id || event.observer.version !== capability.observer.version) {
      return terminal(capability, capabilitySha256, 'unavailable', 'runtime_observer_tuple_not_supported');
    }
    assertCaptureFields(event);

    const rawEvidenceSha256 = canonicalSha256('stolz-benchmark-v3-runtime-raw-event-v1', event);
    const sourceContext = {
      capability_sha256: capabilitySha256,
      observer: capability.observer,
      runtime_id: capability.runtime_id,
      runtime_version: event.runtime_version,
      adapter_id: capability.adapter_id,
      adapter_version: capability.adapter_version,
      event_id: event.event_id,
    };
    const metrics = RUNTIME_METRIC_NAMES.map((name) => normalizeObservation(
      name,
      event.observations[name],
      capability,
      sourceContext,
    ));
    const redaction = {
      policy_id: capability.redaction.policy_id,
      policy_version: capability.redaction.policy_version,
      result: 'passed',
      findings_count: Object.hasOwn(event, 'private_payload') ? 1 : 0,
      payload_retention: capability.redaction.payload_retention,
    };
    const retainedEvent = {
      schema_id: 'benchmark-v3-retained-runtime-event',
      schema_version: '1.0.0',
      track: 'runtime_measured',
      capture_scope: event.capture_scope,
      runtime: { id: capability.runtime_id, version: event.runtime_version },
      adapter: { id: capability.adapter_id, version: capability.adapter_version },
      observer: { ...capability.observer, capability_sha256: capabilitySha256 },
      event_id: event.event_id,
      captured_at: event.captured_at,
      capture_window: publicClone(event.capture_window),
      attempt_id: event.attempt_id,
      parent_identity: event.parent_identity,
      configuration_sha256: event.configuration_sha256,
      route_id: event.route_id,
      environment_id: event.environment_id,
      metrics: publicClone(metrics),
      redaction,
    };
    const retainedEvidenceSha256 = canonicalSha256('stolz-benchmark-v3-retained-runtime-event-v1', retainedEvent);
    if (rawEvidenceSha256 === retainedEvidenceSha256) throw new Error('raw and retained runtime identities must be distinct');

    const measurement = sealBenchmarkV3Record({
      schema_id: 'runtime-measurement',
      schema_version: '1.0.0',
      record_id: `runtime-measurement-${capability.adapter_id}-${retainedEvidenceSha256.slice(0, 16)}`,
      captured_at: event.captured_at,
      track: 'runtime_measured',
      runtime_id: capability.runtime_id,
      runtime_version: event.runtime_version,
      adapter_id: capability.adapter_id,
      adapter_version: capability.adapter_version,
      metrics,
    });
    const synthetic = event.capture_scope === 'synthetic_fixture';
    const availableFacts = metrics.filter(({ availability }) => availability === 'available').length;
    const emptyRuntimeAdmission = metrics.every(({ availability }) => availability === 'unavailable')
      ? { disposition: 'unavailable', reason: 'The declared runtime boundary exposes no measured fact for this event.' }
      : { disposition: 'unknown', reason: 'The runtime source state does not establish a measured fact for this event.' };
    const provenance = sealBenchmarkV3Record({
      schema_id: 'evidence-provenance',
      schema_version: '1.0.0',
      record_id: `runtime-provenance-${capability.adapter_id}-${retainedEvidenceSha256.slice(0, 16)}`,
      captured_at: event.captured_at,
      track: 'runtime_measured',
      capture_method: 'runtime_event',
      collector: { id: capability.adapter_id, version: capability.adapter_version },
      tuple: {
        runtime_id: capability.runtime_id,
        runtime_version: event.runtime_version,
        adapter_id: capability.adapter_id,
        adapter_version: capability.adapter_version,
        provider_id: 'not_observed',
        model_configuration: 'not_observed',
        configuration_sha256: event.configuration_sha256,
        route_id: event.route_id,
        environment_id: event.environment_id,
      },
      capture_window: publicClone(event.capture_window),
      attempt_id: event.attempt_id,
      parent_identity: event.parent_identity,
      runtime_event_id: event.event_id,
      raw_evidence_sha256: rawEvidenceSha256,
      retained_evidence_sha256: retainedEvidenceSha256,
      redaction: {
        policy_id: redaction.policy_id,
        policy_version: redaction.policy_version,
        result: redaction.result,
        findings_count: redaction.findings_count,
      },
      retention: {
        access_class: 'private_retained',
        opaque_locator: `retained:runtime-${retainedEvidenceSha256.slice(0, 24)}`,
        retain_until: event.retain_until,
        disposal_status: 'retained',
      },
      source: {
        authority: 'runtime_boundary',
        reference: capability.observer.source_reference,
        snapshot_sha256: capabilitySha256,
        retrieved_at: event.captured_at,
      },
      admission: synthetic
        ? { disposition: 'withheld', reason: 'Synthetic fixture is not measured runtime evidence.' }
        : (availableFacts > 0 ? { disposition: 'admitted' } : emptyRuntimeAdmission),
    });

    return deepFreeze({
      status: 'captured',
      track: 'runtime_measured',
      capability: getCapability(),
      retained_event: retainedEvent,
      measurement,
      provenance,
    });
  }

  return deepFreeze({ getCapability, captureEvent });
}
