---
name: stolz-reuse
description: Reuse only verified, identity-matched results and coalesce equivalent argv-form operations.
---

# STOLZ A.I. Reuse

Use this skill immediately before an already-known read, command, tool call, or
derived result might be repeated.

1. Compare input and invalidation identities with a verified ledger entry.
2. Reuse only when verification passed, the entry has not expired, and every
   identity matches.
3. On a miss, invalidation, expiry, or failed verification, execute once and
   verify before recording a replacement result.
4. Coalesce only exactly equivalent program-plus-argv operations under one
   controller owner. Never parse or deduplicate shell strings.

Consult [ledger and invalidation rules](references/ledger-and-invalidation.md)
only while making that decision. A result without verification is not a saving;
it is a miss.
