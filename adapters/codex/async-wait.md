# Codex Desktop waiting fallback

Use this reference only when no existing external controller or completion
event can resume the task and the available Codex host exposes
`mcp__codex_app__automation_update`. Follow the tool's current schema. A skill
cannot wake an idle CLI task; use that host's scheduler or report the pending
operation identity when no wake path exists.

A Desktop heartbeat may attach a scheduled continuation to the same task.
Every run invokes the model and consumes context even when it stays silent.
This is a bounded fallback, not the quiet-state controller's model-free route,
and it must not be added beside a domain controller that already owns waiting.

Before creating it, inspect the host's existing automations for an equivalent
active watcher. Reuse or update that watcher instead of creating a duplicate.
Confirm the target is the original task, preserve fields on update, choose a
cadence from expected duration and response needs, and keep notification
preferences in the tool's notification fields. Do not default to minute checks.
Persist the returned watcher id and handoff record before ending the turn.

Use concrete values in a scheduled prompt such as:

```text
Continue the original task after operation <provider/id/URL> finishes.
Check only <authoritative status source>. Success is <exact signal>;
failure/cancellation is <exact signal>; the stuck threshold is <condition>.
For unavailable status, retry at the next scheduled interval up to <threshold>.
While healthy and unfinished, stay quiet and end this run.
On a terminal state, pause this heartbeat, retain its terminal identity, verify
<required result>, then <specific remaining step toward the original goal>.
Recheck current state before any side effect. Do not repeat the operation,
create another watcher or treat this intermediate success as task completion.
```

Keep the watcher active through bounded transient status-read failures. Pause
it on success, failure, cancellation or the recorded stuck threshold, even if
remaining task work is blocked. Record a cleanup failure and report its active
id. Verify subsequent work against the original task's completion criteria.

The shipped adapter supplies guidance only. It does not install a scheduler,
create an automation or certify heartbeat availability on every Codex host.
