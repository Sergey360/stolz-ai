# Handoff and continuation

## Choose the waiting route

Finish useful independent work first, then check the identified operation.
Prefer its existing controller, completion event or callback. A domain workflow
that already owns waiting also owns continuation; do not add a second watcher.

For a process that must stay attached and is likely to finish soon, use one
deterministic tool controller for its lifetime. Keep unchanged checks outside
the model. Before yielding a local export or copy, establish that it survives
the tool session, with a job or process id, log and authoritative terminal
marker. An unverified background process is not a durable handoff.

For longer work, use the host's durable scheduler or event bridge. Record the
original task as the continuation target. If no durable wake path is available,
report the waiting state and exact operation identity; do not promise automatic
resumption. Runtime-specific scheduled model checks are a fallback with model
overhead, not model-free polling. In Codex Desktop, consult the optional
[Codex waiting adapter](../../../adapters/codex/async-wait.md) only when that
fallback is needed. Standalone skill installations may not include the adapter;
its absence leaves the provider-neutral routes available.

## Retain a handoff record

Persist enough information in the original task or durable workspace to resume
without rediscovery:

- Original objective, remaining work and the next step after completion.
- Provider, operation id, exact URL or output path, and source revision when
  relevant. Keep credentials outside the record and scheduled prompt.
- Authoritative success, failure, cancellation and timeout signals. Elapsed
  time or a growing log is not evidence of completion.
- Status-read method, cadence, deadline or stuck threshold, and a bounded
  transient-read-error policy.
- Controller or watcher id, continuation target, accepted terminal identity
  and continuation status, so recovery reuses the owner and avoids duplicates.
- For source-dependent work, the existing evidence/coverage record, exact
  artifact or fragment identities, actual inspected scope, attributions,
  corrections and material unread dependencies. Do not duplicate its ledger.

The existing quiet-state controller stores polling and wake state. The host or
caller owns this task-level record, scheduling and delivery; installing the
skill does not create that infrastructure or extend the stable state API.

## Resume the original task

An event is a hint: reread the exact operation's authoritative status. If it is
still healthy and unfinished, retain state and remain quiet. A temporary status
read failure follows the recorded retry policy; it does not authorize repeating
the external operation.

On terminal success, stop or pause the watcher, record the terminal identity,
verify the result against the original objective, then continue the remaining
work. A successful CI job may be only an intermediate step. Recover a failed
verification within existing authorization or report the concrete blocker.

On failure, cancellation or a reached stuck threshold, stop or pause the
watcher, retain the smallest useful diagnostics, then repair within existing
authorization or report the required decision. Persist continuation progress;
after interruption, inspect current state before repeating a side effect.

Watcher cleanup and task completion are separate checks. If cleanup fails,
retain and report the active watcher id and prevent a duplicate continuation.
Do not claim exactly-once external actions: durable wake deduplication alone
does not make a later merge, upload or other side effect transactional.

Dispatch and a reported terminal result are distinct from verified acceptance.
Attribute inherited checks until their evidence is accepted; do not present
the sender's reading as the receiver's. Separate created files, local checks,
target-system observation and publication in completion reports.
