import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { validateReuseIdentity } from './identity.mjs';

const schema = JSON.parse(await readFile(new URL('../../contracts/verified-reuse/policy.schema.json', import.meta.url), 'utf8'));
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const REQUIRED_OPERATION_FLAGS = Object.freeze(['side_effects', 'network_mutation', 'idempotent', 'deterministic', 'secret_data', 'user_data', 'mutable_external_state', 'unknown_influence', 'discovery_complete', 'path_resolved']);

export function validateReusePolicy(policy) {
  const valid = validateSchema(policy);
  return { valid, errors: valid ? [] : (validateSchema.errors ?? []).map(({ instancePath, keyword }) => `schema:${instancePath || '/'}:${keyword}`) };
}

export function createPolicyRegistry(policies = []) {
  const registry = new Map();
  for (const policy of policies) {
    const validation = validateReusePolicy(policy);
    if (!validation.valid) throw new TypeError(`invalid reuse policy: ${validation.errors.join(', ')}`);
    const key = `${policy.policy_id}@${policy.policy_version}`;
    if (registry.has(key)) throw new TypeError(`duplicate reuse policy: ${key}`);
    registry.set(key, structuredClone(policy));
  }
  return registry;
}

function reject(reason) { return Object.freeze({ admission: 'rejected', lookup_permitted: false, reason }); }

/**
 * Evaluate every influence before a caller may perform a reuse lookup.
 * An omitted flag, unknown policy, or invalid identity is a rejection.
 */
export function admitReuseOperation({ identity, operation, registry }) {
  const identityValidation = validateReuseIdentity(identity);
  if (!identityValidation.valid) return reject('identity_invalid');
  if (!(registry instanceof Map)) return reject('policy_registry_unavailable');
  const policy = registry.get(`${identity.policy.policy_id}@${identity.policy.policy_version}`);
  if (!policy) return reject('policy_unknown');
  if (!operation || typeof operation !== 'object' || REQUIRED_OPERATION_FLAGS.some((flag) => typeof operation[flag] !== 'boolean')) return reject('operation_incomplete');
  if (operation.side_effects || operation.network_mutation) return reject('unsafe_side_effect');
  if (!operation.idempotent) return reject('non_idempotent');
  if (!operation.deterministic || operation.mutable_external_state) return reject('nondeterministic');
  if (operation.secret_data || operation.user_data) return reject('sensitive_data');
  if (operation.unknown_influence) return reject('unknown_influence');
  if (!operation.discovery_complete || !operation.path_resolved) return reject('discovery_incomplete');
  if (identity.inputs.discovery.method_id !== policy.discovery_method_id) return reject('discovery_method_mismatch');
  if (identity.environment.some(({ name }) => !policy.allowed_environment_names.includes(name))) return reject('environment_not_allowlisted');
  return Object.freeze({ admission: 'admitted', lookup_permitted: true, policy_id: policy.policy_id, policy_version: policy.policy_version, required_outcome_oracle_id: policy.required_outcome_oracle_id, required_verification_oracle_id: policy.required_verification_oracle_id });
}
