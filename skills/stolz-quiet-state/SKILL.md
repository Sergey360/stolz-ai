---
name: stolz-quiet-state
description: Wait until a requested check is due, monitor an external operation to completion, or suppress duplicate wakes in polling. Use for timers that continue the current task, handoffs, cursors, or retry decisions.
---

# Quiet State

Use when the current task needs a timed check, when external work can continue
without model decisions, or when repeated snapshots need wake admission. Give
one tool or controller ownership of the wait. Use the host's scheduling
feature for standalone reminders, recurring reports, and standing alerts.

Load [waiting and continuation rules](references/handoff-and-continuation.md)
for a timed check, before yielding to external work, or when recovering a
continuation. Automatic resumption after the turn requires a verified host
wake path.

Load [material transition rules](references/material-transitions.md) when
implementing or diagnosing cursor acceptance, backoff, debounce or wake
admission. A material event is not automatically a user notification.

At a requested check, read the source once and continue at the requested
cadence until the stop condition. When using wake admission, persist accepted
state and emit at most one admitted wake for a material transition. After a
handoff, verify the external result, stop its watcher and continue the
original task.
