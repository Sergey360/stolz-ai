---
name: stolz-quiet-state
description: Report only material operation transitions through one deterministic controller.
---

# STOLZ A.I. Quiet State

Use this skill for polling, retries, cursors, asynchronous operation status, or
handoffs that could otherwise create repeated model narration.

1. Assign one durable controller owner for each operation. Persist its monotonic
   cursor before reporting a transition so a restart cannot replay old state.
2. Poll only when the persisted schedule is due. Retry transient poll errors
   with bounded deterministic backoff and debounce flapping state using the
   declared consecutive-poll threshold.
3. Emit `started`, `progressed`, `waiting`, `needs_decision`, `failed`, or
   `done` only when state, cursor, retry count, or reason materially changes.
4. Keep unchanged, stale, duplicate, debouncing, and not-due polls outside the
   model; they emit no notification or heartbeat narrative.
5. Wake once for each new failure, `needs_decision` revision, or terminal result.
   Escalate only the compact reason identity and next safe action.

Load [material transition rules](references/material-transitions.md) only when
classifying a state change. Quiet reporting preserves attention for evidence
and decisions.
