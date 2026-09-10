import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

export const IDENTITY_SCHEMA_ID = 'reuse-identity';
export const IDENTITY_SCHEMA_VERSION = '1.0.0';
export const CANONICALIZATION_VERSION = '1';

const schema = JSON.parse(await readFile(new URL('../../contracts/verified-reuse/identity.schema.json', import.meta.url), 'utf8'));
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const SHA256 = /^[a-f0-9]{64}$/;

function canonical(value) {
  if (typeof value === 'string') return value.normalize('NFC').replace(/\r\n/g, '\n');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function safeRelativePath(path) {
  return typeof path === 'string' && path === path.normalize('NFC') && !path.includes('\\') && !path.startsWith('/') && !path.split('/').some((part) => !part || part === '.' || part === '..');
}

function semanticErrors(identity) {
  const errors = [];
  if (!Array.isArray(identity?.argv)) errors.push('argv_missing');
  for (const collection of ['declared', 'discovered']) {
    const inputs = identity?.inputs?.[collection];
    if (Array.isArray(inputs)) {
      const paths = inputs.map(({ path }) => path);
      if (new Set(paths).size !== paths.length) errors.push(`duplicate_${collection}_input`);
      if (inputs.some(({ path, digest_sha256: digest }) => !safeRelativePath(path) || !SHA256.test(digest))) errors.push(`invalid_${collection}_input_path`);
    }
  }
  if (!safeRelativePath(identity?.cwd?.normalized_resolved_path)) errors.push('invalid_cwd_path');
  const environment = identity?.environment;
  if (Array.isArray(environment) && new Set(environment.map(({ name }) => name)).size !== environment.length) errors.push('duplicate_environment_name');
  return errors;
}

/** Returns only the canonical UTF-8 bytes defined by the v1 identity contract. */
export function canonicalReuseIdentityBytes(identity) {
  const result = validateReuseIdentity(identity);
  if (!result.valid) throw new TypeError(`invalid reuse identity: ${result.errors.join(', ')}`);
  return Buffer.from(JSON.stringify(canonical(identity)), 'utf8');
}

export function reuseIdentitySha256(identity) {
  return createHash('sha256').update(canonicalReuseIdentityBytes(identity)).digest('hex');
}

export function validateReuseIdentity(identity) {
  const schemaValid = validateSchema(identity);
  const errors = [
    ...(schemaValid ? [] : (validateSchema.errors ?? []).map(({ instancePath, keyword }) => `schema:${instancePath || '/'}:${keyword}`)),
    ...semanticErrors(identity),
  ];
  return { valid: errors.length === 0, errors };
}
