import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  sealBenchmarkV3Record,
  validateBenchmarkV3Record,
} from './benchmark-v3-validator.mjs';

export const RESPONSES_COLLECTOR_ID = 'responses-collector';
export const RESPONSES_COLLECTOR_VERSION = '1.0.0';
export const RESPONSES_REDACTION_POLICY_ID = 'benchmark-v3-redaction';
export const RESPONSES_REDACTION_POLICY_VERSION = '1.0.0';

const MAX_RAW_RESPONSE_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const OFFICIAL_SOURCE = /^https:\/\/developers\.openai\.com\/[A-Za-z0-9./_?=&:%-]+$/;
const RESPONSES_CREATE_SOURCE = 'https://developers.openai.com/api/reference/resources/responses/methods/create';
const PROMPT_CACHING_SOURCE = 'https://developers.openai.com/api/docs/guides/prompt-caching';
const PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
const PRICE_COMPONENTS = Object.freeze({
  input_uncached: 'per_1m_tokens',
  input_cached: 'per_1m_tokens',
  input_cache_write: 'per_1m_tokens',
  output: 'per_1m_tokens',
  hosted_tool: 'per_call',
});
const SAFE_RESPONSE_FIELDS = new Set([
  'id',
  'object',
  'created_at',
  'completed_at',
  'status',
  'model',
  'service_tier',
  'background',
  'usage',
]);
const USAGE_FIELDS = new Set([
  'input_tokens',
  'input_tokens_details',
  'output_tokens',
  'output_tokens_details',
  'total_tokens',
]);
const INPUT_DETAIL_FIELDS = new Set(['cached_tokens', 'cache_write_tokens']);
const OUTPUT_DETAIL_FIELDS = new Set(['reasoning_tokens']);
const SECRET_KEY = /(?:^|[_-])(?:authorization|auth|credential|secret|password|api[_-]?key)(?:$|[_-])/i;
const SECRET_VALUE = /(?:bearer|basic)\s+[A-Za-z0-9._~+\/=:-]{6,}|\bsk-[A-Za-z0-9_-]{8,}|api[_-]?key\s*[=:]\s*[A-Za-z0-9_-]{6,}|https?:\/\/[^/\s]*@/i;
const PRIVATE_HOST = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(?::\d+)?(?:\/|\b)/i;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalSha256(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function exactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)));
}

function isCanonicalUtc(value) {
  return typeof value === 'string' && UTC.test(value)
    && !Number.isNaN(new Date(value).valueOf())
    && new Date(value).toISOString() === value;
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function containsForbiddenMaterial(value) {
  if (typeof value === 'string') return SECRET_VALUE.test(value) || PRIVATE_HOST.test(value);
  if (Array.isArray(value)) return value.some(containsForbiddenMaterial);
  return Boolean(value && typeof value === 'object'
    && Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || containsForbiddenMaterial(child)));
}

function assertIdentifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new Error(`responses_collector_invalid_${name}`);
}

function assertSha(value, name) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`responses_collector_invalid_${name}`);
}

function assertUtc(value, name) {
  if (!isCanonicalUtc(value)) throw new Error(`responses_collector_invalid_${name}`);
}

function assertOfficialPin(pin, expectedUrl, name, { effective = false } = {}) {
  const keys = effective
    ? ['url', 'snapshot_sha256', 'version', 'retrieved_at', 'effective_at']
    : ['url', 'snapshot_sha256', 'version', 'retrieved_at'];
  if (!exactKeys(pin, keys) || pin.url !== expectedUrl || !OFFICIAL_SOURCE.test(pin.url)) {
    throw new Error(`responses_collector_invalid_${name}_source_pin`);
  }
  assertSha(pin.snapshot_sha256, `${name}_snapshot_sha256`);
  assertIdentifier(pin.version, `${name}_version`);
  assertUtc(pin.retrieved_at, `${name}_retrieved_at`);
  if (effective) assertUtc(pin.effective_at, `${name}_effective_at`);
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
    'sources',
    'pricing',
    'usage_partition_semantics',
  ];
  if (!exactKeys(context, keys) || containsForbiddenMaterial(context)) throw new Error('responses_collector_context_rejected');
  assertIdentifier(context.attempt_id, 'attempt_id');
  assertSha(context.parent_identity, 'parent_identity');
  assertIdentifier(context.route_id, 'route_id');
  assertIdentifier(context.environment_id, 'environment_id');
  assertSha(context.configuration_sha256, 'configuration_sha256');
  if (!exactKeys(context.capture_window, ['started_at', 'ended_at'])) throw new Error('responses_collector_invalid_capture_window');
  assertUtc(context.capture_window.started_at, 'capture_started_at');
  assertUtc(context.capture_window.ended_at, 'capture_ended_at');
  if (context.capture_window.started_at > context.capture_window.ended_at) throw new Error('responses_collector_capture_window_reversed');
  if (!exactKeys(context.retention, ['opaque_locator', 'retain_until'])) throw new Error('responses_collector_invalid_retention');
  if (typeof context.retention.opaque_locator !== 'string' || !/^retained:[A-Za-z0-9._:-]+$/.test(context.retention.opaque_locator)) {
    throw new Error('responses_collector_invalid_retention_locator');
  }
  assertUtc(context.retention.retain_until, 'retain_until');
  if (context.retention.retain_until <= context.capture_window.ended_at) throw new Error('responses_collector_retention_expired');
  if (!exactKeys(context.sources, ['responses', 'prompt_caching', 'pricing'])) throw new Error('responses_collector_invalid_sources');
  assertOfficialPin(context.sources.responses, RESPONSES_CREATE_SOURCE, 'responses');
  assertOfficialPin(context.sources.prompt_caching, PROMPT_CACHING_SOURCE, 'prompt_caching');
  assertOfficialPin(context.sources.pricing, PRICING_SOURCE, 'pricing', { effective: true });
  if (!['non_overlapping', 'unknown'].includes(context.usage_partition_semantics)) {
    throw new Error('responses_collector_invalid_usage_partition_semantics');
  }
  validatePricingInput(context.pricing);
}

function validatePricingInput(pricing) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing) || containsForbiddenMaterial(pricing)) {
    throw new Error('responses_collector_invalid_pricing');
  }
  const allowed = new Set(['model_configuration', 'currency', 'service_tier', 'conversion_basis', 'components', 'accounting']);
  if (Object.keys(pricing).some((key) => !allowed.has(key))) throw new Error('responses_collector_unknown_pricing_field');
  assertIdentifier(pricing.model_configuration, 'pricing_model_configuration');
  if (typeof pricing.currency !== 'string' || !/^[A-Z]{3}$/.test(pricing.currency)) throw new Error('responses_collector_invalid_currency');
  if (!['default', 'flex', 'priority', 'batch'].includes(pricing.service_tier)) throw new Error('responses_collector_invalid_service_tier');
  if (pricing.conversion_basis !== undefined) validateAvailabilityInput(pricing.conversion_basis, 'conversion_basis');
  if (pricing.accounting !== undefined) {
    const allowedAccounting = new Set(['batch', 'background']);
    if (!pricing.accounting || typeof pricing.accounting !== 'object' || Array.isArray(pricing.accounting)
      || Object.keys(pricing.accounting).some((key) => !allowedAccounting.has(key))) {
      throw new Error('responses_collector_invalid_accounting');
    }
    if (pricing.accounting.batch !== undefined && !['service_tier_pricing', 'not_used'].includes(pricing.accounting.batch)) {
      throw new Error('responses_collector_invalid_batch_accounting');
    }
    if (pricing.accounting.background !== undefined && !['original_request_once', 'not_used'].includes(pricing.accounting.background)) {
      throw new Error('responses_collector_invalid_background_accounting');
    }
  }
  if (pricing.components !== undefined) {
    if (!pricing.components || typeof pricing.components !== 'object' || Array.isArray(pricing.components)) {
      throw new Error('responses_collector_invalid_price_components');
    }
    if (Object.keys(pricing.components).some((key) => !Object.hasOwn(PRICE_COMPONENTS, key))) {
      throw new Error('responses_collector_unknown_price_component');
    }
    for (const [name, value] of Object.entries(pricing.components)) validateAvailabilityInput(value, `price_${name}`);
  }
}

function validateAvailabilityInput(input, name) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`responses_collector_invalid_${name}`);
  if (input.availability === 'available') {
    if (!exactKeys(input, ['availability', 'value']) || typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value < 0) {
      throw new Error(`responses_collector_invalid_${name}`);
    }
    return;
  }
  if (!exactKeys(input, ['availability', 'reason'])
    || !['unknown', 'unavailable', 'withheld', 'not_comparable'].includes(input.availability)
    || typeof input.reason !== 'string' || input.reason.length === 0 || input.reason.length > 500) {
    throw new Error(`responses_collector_invalid_${name}`);
  }
}

function unavailableMetric(name, sourceIdentity, reason, provenance = 'provider_reported') {
  return {
    name,
    availability: 'unknown',
    provenance,
    source_identity: sourceIdentity,
    unit: 'tokens',
    reason,
  };
}

function usageMetric(name, value, sourceIdentity) {
  if (!isNonNegativeInteger(value)) {
    return unavailableMetric(name, sourceIdentity, `OpenAI Responses field ${name} was absent or not a non-negative integer.`);
  }
  return {
    name,
    availability: 'available',
    provenance: 'provider_reported',
    source_identity: sourceIdentity,
    unit: 'tokens',
    value,
  };
}

function unknownUsageFields(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return [];
  const unknown = Object.keys(usage).filter((key) => !USAGE_FIELDS.has(key)).map((key) => `usage.${key}`);
  if (usage.input_tokens_details && typeof usage.input_tokens_details === 'object' && !Array.isArray(usage.input_tokens_details)) {
    unknown.push(...Object.keys(usage.input_tokens_details)
      .filter((key) => !INPUT_DETAIL_FIELDS.has(key))
      .map((key) => `usage.input_tokens_details.${key}`));
  }
  if (usage.output_tokens_details && typeof usage.output_tokens_details === 'object' && !Array.isArray(usage.output_tokens_details)) {
    unknown.push(...Object.keys(usage.output_tokens_details)
      .filter((key) => !OUTPUT_DETAIL_FIELDS.has(key))
      .map((key) => `usage.output_tokens_details.${key}`));
  }
  return unknown.sort();
}

function responseTimestamp(value, name) {
  if (Number.isSafeInteger(value) && value >= 0) return new Date(value * 1000).toISOString();
  return { availability: 'unknown', reason: `OpenAI Responses field ${name} was absent or invalid.` };
}

function parseRawResponse(rawBody) {
  if (typeof rawBody !== 'string') throw new Error('responses_collector_raw_response_must_be_text');
  const byteLength = Buffer.byteLength(rawBody);
  if (byteLength === 0 || byteLength > MAX_RAW_RESPONSE_BYTES) throw new Error('responses_collector_raw_response_size_rejected');
  let response;
  try {
    response = JSON.parse(rawBody);
  } catch {
    throw new Error('responses_collector_raw_response_not_json');
  }
  if (!response || typeof response !== 'object' || Array.isArray(response)
    || response.object !== 'response' || typeof response.id !== 'string' || !IDENTIFIER.test(response.id)
    || typeof response.model !== 'string' || !IDENTIFIER.test(response.model)) {
    throw new Error('responses_collector_not_responses_primary_evidence');
  }
  return response;
}

function buildUsageRecord(response, rawIdentity, capturedAt, partitionSemantics) {
  const usage = response.usage && typeof response.usage === 'object' && !Array.isArray(response.usage) ? response.usage : {};
  const inputDetails = usage.input_tokens_details && typeof usage.input_tokens_details === 'object' && !Array.isArray(usage.input_tokens_details)
    ? usage.input_tokens_details : {};
  const outputDetails = usage.output_tokens_details && typeof usage.output_tokens_details === 'object' && !Array.isArray(usage.output_tokens_details)
    ? usage.output_tokens_details : {};
  const input = usageMetric('input_tokens', usage.input_tokens, rawIdentity);
  const cached = usageMetric('cached_tokens', inputDetails.cached_tokens, rawIdentity);
  const cacheWrite = usageMetric('cache_write_tokens', inputDetails.cache_write_tokens, rawIdentity);
  const output = usageMetric('output_tokens', usage.output_tokens, rawIdentity);
  const reasoning = usageMetric('reasoning_tokens', outputDetails.reasoning_tokens, rawIdentity);
  const total = usageMetric('total_tokens', usage.total_tokens, rawIdentity);
  const canDeriveUncached = partitionSemantics === 'non_overlapping'
    && [input, cached, cacheWrite].every(({ availability }) => availability === 'available');
  const uncached = canDeriveUncached ? {
    name: 'uncached_input_tokens',
    availability: 'available',
    provenance: 'derived',
    source_identity: rawIdentity,
    unit: 'tokens',
    value: input.value - cached.value - cacheWrite.value,
    formula: 'input_tokens - cached_tokens - cache_write_tokens',
    component_ids: ['input_tokens', 'cached_tokens', 'cache_write_tokens'],
  } : unavailableMetric(
    'uncached_input_tokens',
    rawIdentity,
    partitionSemantics === 'non_overlapping'
      ? 'One or more cache partition fields are unknown.'
      : 'The pinned source does not confirm non-overlapping input cache partitions.',
    'derived',
  );
  return sealBenchmarkV3Record({
    schema_id: 'responses-usage',
    schema_version: '1.0.0',
    record_id: `usage-${rawIdentity.slice(0, 20)}`,
    captured_at: capturedAt,
    track: 'provider_native',
    response_id: response.id,
    input_tokens: input,
    input_tokens_details: {
      cached_tokens: cached,
      cache_write_tokens: cacheWrite,
    },
    output_tokens: output,
    output_tokens_details: { reasoning_tokens: reasoning },
    total_tokens: total,
    uncached_input_tokens: uncached,
  });
}

function availabilityComponent(name, unit, input) {
  const owner = `provider-price-${name.replaceAll('_', '-')}`;
  if (input?.availability === 'available') {
    return {
      component_id: `price-${name.replaceAll('_', '-')}`,
      name,
      availability: 'available',
      unit,
      unit_price: input.value,
      attribution_owner: owner,
    };
  }
  return {
    component_id: `price-${name.replaceAll('_', '-')}`,
    name,
    availability: input?.availability ?? 'unknown',
    unit,
    attribution_owner: owner,
    reason: input?.reason ?? `The pinned pricing snapshot has no admitted ${name} component.`,
  };
}

function buildPricingRecord(response, context, capturedAt) {
  const { pricing, sources } = context;
  const components = Object.entries(PRICE_COMPONENTS).map(([name, unit]) => availabilityComponent(name, unit, pricing.components?.[name]));
  const conversionInput = pricing.conversion_basis;
  const conversionBasis = conversionInput?.availability === 'available' ? {
    availability: 'available',
    source_identity: sources.pricing.snapshot_sha256,
    rate: conversionInput.value,
  } : {
    availability: conversionInput?.availability ?? 'unknown',
    reason: conversionInput?.reason ?? 'Currency conversion basis was not supplied by the pinned pricing source.',
  };
  const complete = components.every(({ availability }) => availability === 'available')
    && conversionBasis.availability === 'available';
  return sealBenchmarkV3Record({
    schema_id: 'pricing-identity',
    schema_version: '1.0.0',
    record_id: `pricing-${sources.pricing.snapshot_sha256.slice(0, 20)}`,
    captured_at: capturedAt,
    track: 'provider_native',
    provider_id: 'openai',
    model_configuration: response.model,
    currency: pricing.currency,
    price_source: {
      url: sources.pricing.url,
      snapshot_sha256: sources.pricing.snapshot_sha256,
      version: sources.pricing.version,
      retrieved_at: sources.pricing.retrieved_at,
      effective_at: sources.pricing.effective_at,
    },
    service_tier: pricing.service_tier,
    token_unit: 'per_1m_tokens',
    conversion_basis: conversionBasis,
    accounting: {
      retry: 'each_provider_request_once',
      batch: pricing.accounting?.batch ?? 'not_used',
      background: pricing.accounting?.background ?? 'not_used',
      polling: 'not_billable_as_new_request',
    },
    components,
    final_cost_availability: complete
      ? { availability: 'available' }
      : { availability: 'unknown', reason: 'One or more billed components or the conversion basis is unknown.' },
  });
}

function allProviderUsageAvailable(record) {
  return [
    record.input_tokens,
    record.input_tokens_details.cached_tokens,
    record.input_tokens_details.cache_write_tokens,
    record.output_tokens,
    record.output_tokens_details.reasoning_tokens,
    record.total_tokens,
  ].every(({ availability }) => availability === 'available');
}

function buildRetainedArtifact(response, rawIdentity, usage, context, evidenceClass) {
  const removedFields = Object.keys(response).filter((key) => !SAFE_RESPONSE_FIELDS.has(key)).sort();
  const unsupportedUsageFields = unknownUsageFields(response.usage);
  const retained = {
    schema_id: 'responses-retained-export',
    schema_version: '1.0.0',
    evidence_class: evidenceClass,
    track: 'provider_native',
    response_identity: {
      id: response.id,
      object: 'response',
      created_at: responseTimestamp(response.created_at, 'created_at'),
      completed_at: responseTimestamp(response.completed_at, 'completed_at'),
      status: typeof response.status === 'string' ? response.status : 'unknown',
      model: response.model,
      service_tier: typeof response.service_tier === 'string' ? response.service_tier : 'unknown',
      background: typeof response.background === 'boolean' ? response.background : 'unknown',
    },
    raw_evidence_sha256: rawIdentity,
    usage_availability: {
      input_tokens: usage.input_tokens.availability,
      cached_tokens: usage.input_tokens_details.cached_tokens.availability,
      cache_write_tokens: usage.input_tokens_details.cache_write_tokens.availability,
      output_tokens: usage.output_tokens.availability,
      reasoning_tokens: usage.output_tokens_details.reasoning_tokens.availability,
      total_tokens: usage.total_tokens.availability,
      uncached_input_tokens: usage.uncached_input_tokens.availability,
    },
    source_pins: {
      responses: context.sources.responses.snapshot_sha256,
      prompt_caching: context.sources.prompt_caching.snapshot_sha256,
      pricing: context.sources.pricing.snapshot_sha256,
    },
    redaction: {
      policy_id: RESPONSES_REDACTION_POLICY_ID,
      policy_version: RESPONSES_REDACTION_POLICY_VERSION,
      result: 'passed',
      findings_count: removedFields.length + unsupportedUsageFields.length,
      removed_fields: removedFields,
      unsupported_usage_fields: unsupportedUsageFields,
      content_retained: false,
    },
    claim_boundary: {
      observation_scope: 'exact_response_only',
      savings_claim: 'withheld_pending_paired_report_admission',
      fixture_evidence_sufficient: false,
      runtime_telemetry_sufficient: false,
    },
  };
  if (containsForbiddenMaterial(retained)) throw new Error('responses_collector_retained_artifact_secret_or_host');
  return retained;
}

function buildProvenance(response, rawIdentity, retainedIdentity, retained, usage, pricing, context, evidenceClass) {
  const responseTierMismatch = typeof response.service_tier === 'string'
    && response.service_tier !== context.pricing.service_tier;
  const reasons = [];
  if (evidenceClass !== 'provider_primary') reasons.push('Fixture-only evidence is never admitted as a real provider observation.');
  if (response.status !== 'completed') reasons.push('The Responses request is not completed.');
  if (!Number.isSafeInteger(response.created_at) || response.created_at < 0) reasons.push('The primary response created_at identity is unknown.');
  if (!allProviderUsageAvailable(usage)) reasons.push('One or more required Responses usage fields are unknown.');
  if (retained.redaction.unsupported_usage_fields.length > 0) reasons.push('The response contains usage fields outside responses-usage@1.0.0.');
  if (pricing.final_cost_availability.availability !== 'available') reasons.push('One or more pricing components are unknown.');
  if (responseTierMismatch) reasons.push('The returned service tier does not match the pinned pricing tuple.');
  const admitted = reasons.length === 0;
  return sealBenchmarkV3Record({
    schema_id: 'evidence-provenance',
    schema_version: '1.0.0',
    record_id: `provenance-${rawIdentity.slice(0, 20)}`,
    captured_at: context.capture_window.ended_at,
    track: 'provider_native',
    capture_method: 'responses_export',
    collector: { id: RESPONSES_COLLECTOR_ID, version: RESPONSES_COLLECTOR_VERSION },
    tuple: {
      runtime_id: 'responses-api',
      runtime_version: context.sources.responses.version,
      adapter_id: RESPONSES_COLLECTOR_ID,
      adapter_version: RESPONSES_COLLECTOR_VERSION,
      provider_id: 'openai',
      model_configuration: response.model,
      configuration_sha256: context.configuration_sha256,
      route_id: context.route_id,
      environment_id: context.environment_id,
    },
    capture_window: structuredClone(context.capture_window),
    attempt_id: context.attempt_id,
    parent_identity: context.parent_identity,
    source_response_id: response.id,
    raw_evidence_sha256: rawIdentity,
    retained_evidence_sha256: retainedIdentity,
    redaction: {
      policy_id: RESPONSES_REDACTION_POLICY_ID,
      policy_version: RESPONSES_REDACTION_POLICY_VERSION,
      result: 'passed',
      findings_count: retained.redaction.findings_count,
    },
    retention: {
      access_class: 'private_retained',
      opaque_locator: context.retention.opaque_locator,
      retain_until: context.retention.retain_until,
      disposal_status: 'retained',
    },
    source: {
      authority: 'openai_responses',
      reference: context.sources.responses.url,
      snapshot_sha256: context.sources.responses.snapshot_sha256,
      retrieved_at: context.sources.responses.retrieved_at,
    },
    admission: admitted
      ? { disposition: 'admitted' }
      : { disposition: 'withheld', reason: reasons.join(' ') },
  });
}

function terminal(reasonCode, reason, retryTrigger) {
  return Object.freeze({
    schema_version: '1.0.0',
    collector_id: RESPONSES_COLLECTOR_ID,
    collector_version: RESPONSES_COLLECTOR_VERSION,
    track: 'provider_native',
    status: 'unavailable',
    reason_code: reasonCode,
    reason,
    claim_disposition: 'withheld',
    retry_owner: 'operator',
    retry_trigger: retryTrigger,
    network_attempted: false,
  });
}

async function validateProducedRecords(records) {
  for (const [name, record] of Object.entries(records)) {
    const result = await validateBenchmarkV3Record(record);
    if (!result.valid) throw new Error(`responses_collector_invalid_${name}_record:${JSON.stringify(result.errors)}`);
  }
}

function sanitizeFixture(rawBody, context) {
  validateContext(context);
  const response = parseRawResponse(rawBody);
  const rawIdentity = sha256(rawBody);
  const usage = buildUsageRecord(response, rawIdentity, context.capture_window.ended_at, context.usage_partition_semantics);
  const pricing = buildPricingRecord(response, context, context.capture_window.ended_at);
  const retained = buildRetainedArtifact(response, rawIdentity, usage, context, 'fixture_only');
  const retainedIdentity = canonicalSha256(retained);
  const provenance = buildProvenance(response, rawIdentity, retainedIdentity, retained, usage, pricing, context, 'fixture_only');
  return {
    response,
    rawIdentity,
    retained,
    retainedIdentity,
    records: { provenance, usage, pricing },
  };
}

/**
 * Sanitize a synthetic response for checked-in test fixtures. The output is
 * permanently fixture-only and can never pass real-provider admission.
 */
export async function sanitizeResponsesFixture(rawBody, context) {
  const result = sanitizeFixture(rawBody, context);
  await validateProducedRecords(result.records);
  return {
    retained_artifact: result.retained,
    retained_evidence_sha256: result.retainedIdentity,
    records: result.records,
    claim_disposition: 'withheld',
  };
}

/**
 * Invoke an operator-owned, credential-aware transport only after both gates
 * pass. The transport returns exact raw response JSON text; this collector is
 * deliberately never given the credential or authorization header.
 */
export async function captureOpenAIResponsesEvidence({
  capability,
  credential_available: credentialAvailable,
  authorized_transport: authorizedTransport,
  context,
}) {
  if (capability !== true) {
    return terminal(
      'capability_absent',
      'CAP_OPENAI_RESPONSES_REAL is not explicitly authorized.',
      'Authorize CAP_OPENAI_RESPONSES_REAL in the private execution environment.',
    );
  }
  if (credentialAvailable !== true) {
    return terminal(
      'credential_unavailable',
      'The approved secret mechanism did not attest that a credential is available.',
      'Provision an approved OpenAI credential and repeat the private capture.',
    );
  }
  if (typeof authorizedTransport !== 'function') {
    return terminal(
      'authorized_transport_unavailable',
      'No operator-owned authorized Responses transport is available.',
      'Configure the approved credential-aware transport and repeat the private capture.',
    );
  }
  validateContext(context);
  let rawBody;
  try {
    rawBody = await authorizedTransport();
  } catch {
    return {
      ...terminal(
        'provider_capture_failed',
        'The authorized Responses transport failed without exposing provider or credential details.',
        'Review the private transport log and repeat after the provider failure is resolved.',
      ),
      network_attempted: true,
    };
  }
  const response = parseRawResponse(rawBody);
  if (response.model !== context.pricing.model_configuration && context.pricing.model_configuration !== undefined) {
    throw new Error('responses_collector_model_configuration_mismatch');
  }
  const rawIdentity = sha256(rawBody);
  const usage = buildUsageRecord(response, rawIdentity, context.capture_window.ended_at, context.usage_partition_semantics);
  const pricing = buildPricingRecord(response, context, context.capture_window.ended_at);
  const retained = buildRetainedArtifact(response, rawIdentity, usage, context, 'provider_primary');
  const retainedIdentity = canonicalSha256(retained);
  const provenance = buildProvenance(response, rawIdentity, retainedIdentity, retained, usage, pricing, context, 'provider_primary');
  const records = { provenance, usage, pricing };
  await validateProducedRecords(records);
  return {
    schema_version: '1.0.0',
    collector_id: RESPONSES_COLLECTOR_ID,
    collector_version: RESPONSES_COLLECTOR_VERSION,
    track: 'provider_native',
    status: provenance.admission.disposition === 'admitted' ? 'captured' : 'withheld',
    network_attempted: true,
    raw_evidence_sha256: rawIdentity,
    retained_evidence_sha256: retainedIdentity,
    retained_artifact: retained,
    records,
    observation_scope: 'exact_response_only',
    claim_disposition: 'withheld_pending_paired_report_admission',
  };
}

function pathInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Persist the raw identity and sanitized retained evidence only in a private
 * directory outside the repository. Raw payload bytes are never written.
 * Existing capture directories are never overwritten.
 */
export async function writePrivateResponsesCapture({
  private_directory: privateDirectory,
  repository_root: repositoryRoot = process.cwd(),
  raw_body: rawBody,
  capture,
}) {
  if (typeof privateDirectory !== 'string' || !isAbsolute(privateDirectory)) throw new Error('responses_collector_private_directory_must_be_absolute');
  if (!capture || !['captured', 'withheld'].includes(capture.status)) throw new Error('responses_collector_capture_not_persistable');
  parseRawResponse(rawBody);
  if (sha256(rawBody) !== capture.raw_evidence_sha256) throw new Error('responses_collector_raw_identity_mismatch');
  if (containsForbiddenMaterial(capture.retained_artifact) || containsForbiddenMaterial(capture.records)) {
    throw new Error('responses_collector_persisted_material_rejected');
  }
  const repositoryPath = await realpath(resolve(repositoryRoot));
  const requestedPath = resolve(privateDirectory);
  if (pathInside(repositoryPath, requestedPath)) throw new Error('responses_collector_private_directory_inside_repository');
  await mkdir(requestedPath, { recursive: true, mode: 0o700 });
  const rootInfo = await lstat(requestedPath);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('responses_collector_private_directory_rejected');
  await chmod(requestedPath, 0o700);
  const privateRoot = await realpath(requestedPath);
  if (pathInside(repositoryPath, privateRoot)) throw new Error('responses_collector_private_directory_resolves_inside_repository');
  const captureDirectory = resolve(privateRoot, `response-${capture.raw_evidence_sha256.slice(0, 20)}`);
  if (!pathInside(privateRoot, captureDirectory)) throw new Error('responses_collector_private_capture_path_rejected');
  await mkdir(captureDirectory, { recursive: false, mode: 0o700 });
  await chmod(captureDirectory, 0o700);
  const rawIdentityPath = resolve(captureDirectory, 'raw-identity.json');
  const retainedPath = resolve(captureDirectory, 'retained-response.json');
  const recordsPath = resolve(captureDirectory, 'collector-records.json');
  const rawIdentity = {
    raw_evidence_sha256: capture.raw_evidence_sha256,
    response_id: capture.records.provenance.source_response_id,
    captured_at: capture.records.provenance.captured_at,
    payload_retention: 'operator_owned_private_store_only',
  };
  await writeFile(rawIdentityPath, `${JSON.stringify(rawIdentity, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await writeFile(retainedPath, `${JSON.stringify(capture.retained_artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await writeFile(recordsPath, `${JSON.stringify(capture.records, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await Promise.all([rawIdentityPath, retainedPath, recordsPath].map((path) => chmod(path, 0o600)));
  return {
    opaque_locator: `retained:${capture.raw_evidence_sha256.slice(0, 20)}`,
    capture_directory: captureDirectory,
    files: { raw_identity: rawIdentityPath, retained: retainedPath, records: recordsPath },
  };
}
