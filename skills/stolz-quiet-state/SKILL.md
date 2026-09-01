---
name: stolz-quiet-state
description: Report only material operation transitions through one deterministic controller.
---

# STOLZ A.I. Quiet State

Use this skill for polling, retries, cursors, asynchronous operation status, or
handoffs that could otherwise create repeated model narration.

1. Assign one controller owner for each operation.
2. Emit `started`, `progressed`, `waiting`, `needs_decision`, `failed`, or
   `done` only when state, cursor, retry count, or reason materially changes.
3. Keep unchanged polls outside the model; they emit no heartbeat narrative.
4. Escalate a failure or a human decision with the compact reason and next safe
   action.

Load [material transition rules](references/material-transitions.md) only when
classifying a state change. Quiet reporting preserves attention for evidence
and decisions.
