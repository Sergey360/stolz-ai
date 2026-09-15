---
name: stolz-reuse
description: Admit an existing prior result or coalesce an identical in-flight command. Use only when a reusable result or competing execution actually exists.
---

# Verified Reuse

Use for an actual prior result or competing equivalent execution, not a first
read or general performance tuning. Reuse requires matching identities,
policy, verification and freshness. A miss takes the normal verified route.

Load [ledger and invalidation rules](references/ledger-and-invalidation.md)
when admitting a cached result, diagnosing a miss, or coalescing callers.
Command identity is executable plus argv, never shell text.

Done: return the verified result and evidence, join its current owner, or
execute and verify after a miss. Reuse never reduces the required outcome.
