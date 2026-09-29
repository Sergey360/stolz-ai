---
name: stolz-quiet-state
description: Hand off a long-running external operation and resume its task, or suppress duplicate wakes in polling. Use for waiting, continuation, cursor or retry decisions.
---

# Quiet State

Use when external work can continue without model decisions and the task still
has work after it finishes, or when repeated snapshots need wake admission.
One durable controller owns scheduling and cursors; unchanged polls stay
outside the model. A one-off status answer needs no controller.

Load [handoff and continuation rules](references/handoff-and-continuation.md)
before yielding a task to external work or recovering its continuation. The
host must provide a durable wake path; the skill itself cannot resume a task.

Load [material transition rules](references/material-transitions.md) when
implementing or diagnosing cursor acceptance, backoff, debounce or wake
admission. A material event is not automatically a user notification.

Done: persist accepted state and emit at most one admitted wake for a failure,
decision revision or terminal result. After a handoff, verify the external
result, stop its watcher and continue toward the original objective. Report
an actionable blocker without hiding it in retries.
