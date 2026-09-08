---
name: stolz-context
description: Validate a route manifest and load only immutable, route-required context before an agent reads project material.
---

# STOLZ A.I. Context

Use this skill when a task has a route manifest or when context must be selected
before a file, instruction, or reference is read. Do not use it as a general
project-summary skill.

1. Validate the route manifest before reading anything.
2. Read every required source identity once and record its SHA-256/version in
   the durable read-fragment ledger. Store bounded fragments only; pass compact
   references, never source bytes, into model-facing context.
3. Load a conditional reference only when the selected route names it.
4. Hand the verified identities to `stolz-reuse`; unchanged inputs are not
   reread or whole-repository hashed. Invalidate on Git/content, policy,
   schema, tool, expiry, integrity, or manual-purge changes.
5. Stop safely on a malformed manifest or route mismatch. Do not guess a
   source identity.

Use [manifest and read rules](references/manifest-and-reads.md) only for a
manifest/read decision. STOLZ A.I. keeps context disciplined so an agent can
do the same quality work with less waste—not by skipping evidence.
