# Architecture

STOLZ A.I. is a provider-neutral skill suite with explicit profile, adapter,
evidence, and admission boundaries. It reduces avoidable work around reasoning
without asking a model to skip required reasoning or verification.

## Product surface

The public v0.7.1 package contains five skills:

```text
task
  -> stolz-route chooses one sufficient concern
     -> stolz-context loads only required, identity-checked inputs
     -> stolz-reuse admits only an identity-matched verified result
     -> stolz-quiet-state suppresses unchanged external state
     -> stolz-benchmark compares equivalent verified outcomes
  -> required checks pass
  -> result
```

Installing the package adds skills, profiles, and lazy adapters. It does not
provide a daemon, shared cache, durable state store, background worker, or
automatic polling controller.

## Capability and evidence matrix

| Surface | Shipped capability | Evidence ceiling in v0.7 | Meaning |
| --- | --- | --- | --- |
| Five skills | installable | package and install smoke | Provider-neutral instructions are present. |
| Runtime profiles | resolvable for Codex, Claude Code, Qwen Code | deterministic profile resolution | Selection does not infer a provider or model. |
| Lazy adapters | included for all three runtimes | adapter conformance | Inclusion does not prove a provider call. |
| Claude Code 2.1.251 + adapter 1.0.0 | exact-version runtime evidence | C2 | Any runtime or adapter drift requires new evidence. |
| Qwen Code 0.22.3 + adapter 1.0.0 | exact-version runtime evidence | C2 | Any runtime or adapter drift requires new evidence. |
| Codex CLI 0.153.4 | four verified installed-local executions | below v0.7 C2 | No Codex C2 row is published for v0.7. |
| Provider pairs | fail-closed admission implemented | C3 withheld | No current pair may support a provider-call or savings claim. |

C0 fixture support, C1 CLI/profile checks, C2 runtime evidence, and C3 paired
provider evidence are different claims. A higher row is never inferred from a
lower one.

## Identity and invalidation

Context, reuse, and evidence are valid only while their recorded identities
still match. Relevant identities include source content, task input,
configuration, runtime and adapter version, required verification, and expiry.
A change produces a new input; it is not a reason to reuse stale output.

Minimal context selection therefore means selecting the smallest sufficient
route and loading only that route's verified inputs. It never means omitting an
input required by the task or its checks.

## Correct refusal of unsafe reuse

```json
{
  "decision": "execute",
  "reason": "input_identity_changed",
  "reused": false
}
```

This is a successful safety outcome. When an input identity, invalidation
identity, expiry, outcome, or verification identity differs, STOLZ must refuse
reuse and run the operation again.

## Runtime and provider separation

A runtime profile identifies an agent runtime and a lazy adapter. A provider
overlay is a separate declarative record. Neither one proves that a provider
was called. Provider-native claims require sanitized primary provider exports,
paired scenario identity, equal outcomes, equal required verification, and all
privacy gates. v0.7 implements that admission path but admits no current C3
pair.

## Repository map

- `skills/` — five user-facing skills and just-in-time references.
- `profiles/` — deterministic runtime profiles.
- `adapters/` — lazy adapters and conformance declarations.
- `contracts/` — public JSON schemas.
- `tools/` — profile, evidence, and benchmark validation tools.
- `benchmarks/` and `reports/` — fixture and sanitized scenario evidence.

Private context-state and verified-reuse implementations are not executable
public package surfaces. Public instructions describe the contracts and safe
decisions; they do not claim a bundled service that does not exist.
