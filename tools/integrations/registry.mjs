const definitions = Object.freeze({
  filesystem: Object.freeze({
    integration_id: 'filesystem',
    version: '1.0.0',
    trigger_id: 'integration:filesystem:approved-file-access',
    capabilities: Object.freeze(['approved-file-access']),
  }),
  gitlab: Object.freeze({
    integration_id: 'gitlab',
    version: '1.0.0',
    trigger_id: 'integration:gitlab:approved-project-access',
    capabilities: Object.freeze(['approved-project-access']),
  }),
  'benchmark-capture': Object.freeze({
    integration_id: 'benchmark-capture',
    version: '1.0.0',
    trigger_id: 'integration:benchmark-capture:raw-evidence',
    capabilities: Object.freeze(['raw-evidence']),
  }),
});

export const OPTIONAL_INTEGRATION_DESCRIPTORS = Object.freeze(
  Object.values(definitions).map((definition) => Object.freeze({ ...definition, capabilities: [...definition.capabilities] })),
);

function unavailable(integration_id, reason) {
  return Object.freeze({
    resolution: 'unavailable',
    integration_id,
    reason,
    gates: Object.freeze({ outcome: 'required', verification: 'required' }),
  });
}

function declaredIntegration(profile, integration_id) {
  if (!profile || !Array.isArray(profile.optional_integrations)) return null;
  return profile.optional_integrations.find((integration) => integration?.integration_id === integration_id) ?? null;
}

function declarationMatches(declaration, descriptor) {
  return declaration && typeof declaration.version === 'string' &&
    Array.isArray(declaration.capabilities) && declaration.capabilities.length > 0 &&
    declaration.capabilities.every((capability) => descriptor.capabilities.includes(capability));
}

/**
 * Resolves only metadata for one profile-scoped optional integration. It has no
 * credential, filesystem, or network side effect. Callers may provide a loader
 * only after this boundary returns `resolved`.
 */
export function resolveOptionalIntegration({ profile, integration_id, trigger_id, available = true } = {}) {
  const descriptor = definitions[integration_id];
  if (!descriptor) return unavailable(integration_id ?? null, 'unknown_integration');

  const declaration = declaredIntegration(profile, integration_id);
  if (!declaration) return unavailable(integration_id, 'integration_undeclared');
  if (!declarationMatches(declaration, descriptor)) return unavailable(integration_id, 'integration_malformed');
  if (trigger_id !== descriptor.trigger_id) return unavailable(integration_id, 'integration_trigger_required');
  if (available !== true) return unavailable(integration_id, available === false ? 'integration_denied' : 'integration_unavailable');

  return Object.freeze({
    resolution: 'resolved',
    integration: Object.freeze({ ...descriptor, capabilities: [...descriptor.capabilities] }),
    trigger_id,
    gates: Object.freeze({ outcome: 'required', verification: 'required' }),
  });
}

/** Creates a lazy registry whose loader is never invoked before boundary checks pass. */
export function createOptionalIntegrationRegistry(loaders = {}) {
  const loaded = new Map();
  return async function resolve(request = {}) {
    const result = resolveOptionalIntegration(request);
    if (result.resolution !== 'resolved') return result;
    const loader = loaders[result.integration.integration_id];
    if (loader === undefined) return result;
    if (typeof loader !== 'function') return unavailable(result.integration.integration_id, 'integration_malformed');
    try {
      if (!loaded.has(result.integration.integration_id)) loaded.set(result.integration.integration_id, Promise.resolve().then(loader));
      return Object.freeze({ ...result, module: await loaded.get(result.integration.integration_id) });
    } catch {
      return unavailable(result.integration.integration_id, 'integration_unavailable');
    }
  };
}
