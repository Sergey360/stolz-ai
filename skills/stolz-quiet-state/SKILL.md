---
name: stolz-quiet-state
description: Suppress duplicate wakes in a polled operation. Use for durable cursor, retry or notification decisions.
---

# Quiet State

Use when an operation has repeated snapshots, not for a one-off status answer
or ordinary handoff. One durable controller owns scheduling and cursors;
unchanged state never invokes the model.

Load [material transition rules](references/material-transitions.md) when
implementing or diagnosing cursor acceptance, backoff, debounce or wake
admission. A material event is not automatically a user notification.

Done: persist accepted state and emit at most one admitted wake for a failure,
decision revision or terminal result. Suppressed snapshots remain outside the
model. Report an actionable blocker without hiding it in retries.
