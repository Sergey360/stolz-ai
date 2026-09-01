# Architecture

STOLZ A.I. is a small routing layer around five independent skills. Its job is to remove repeated work while preserving the required outcome and verification.

## Flow

```text
task
  -> stolz-route selects one concern
     -> stolz-context      loads only verified, required inputs
     -> stolz-reuse        reuses an identity-matched, verified result
     -> stolz-quiet-state  emits only material state transitions
     -> stolz-benchmark    compares equivalent routes
  -> required checks pass
  -> result
```

`stolz-route` loads one focused skill and its reference. It does not preload the whole suite.

## Core rules

### Context has an identity

A context manifest names the selected route, source artifacts, and invalidation inputs. A source is trusted only after its version or SHA-256 matches. Changed inputs are new inputs.

### Reuse follows verification

A cached result is reusable only when:

- the previous verification passed;
- input and invalidation identities still match;
- the entry has not expired;
- the operation is the same executable plus argument vector.

Otherwise the operation runs again and its result is verified before being recorded.

### Unchanged state stays quiet

Polling timestamps alone are not progress. The state route reports only a changed state, cursor, retry count, or reason. Failures and decisions remain visible.

### Benchmarks protect the outcome

Baseline and optimized routes use one versioned fixture. Both must produce the required outcome and pass verification before a token delta is reportable.

## Repository map

- `skills/` contains the five user-facing skills and their just-in-time references.
- `tools/foundation.mjs` implements identity, reuse, state, routing, and benchmark gates.
- `contracts/` documents the small JSON records used by the foundation.
- `benchmarks/` contains one reproducible synthetic comparison and its raw inputs.
- `test/` checks product behavior, public documentation, and package contents.

## Trust boundary

The core does not call a model provider, collect credentials, or infer token usage. Adapter capability declarations are optional inputs to route selection; missing capabilities select the provider-neutral route. Commands are represented as a program and argument array, never as a shell string.
