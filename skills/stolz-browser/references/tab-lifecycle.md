# Tab lifecycle rules

Keep a bounded task-local record: browser/provider, returned tab id, purpose,
owned or borrowed status, known aliases, pending work and last observation.
A tab created by this task is owned; existing tabs require explicit authority
for closure. Do not infer ownership from a similar title or URL. Use the
host's documented attachment method and inspect fresh state after interruption.

Await pending work on the affected tab. Serialize this task's create, attach,
navigate and close operations; do not overlap tool calls, use `Promise.all`
for them, or leave fire-and-forget promises. Independent API/CLI reads may
still be batched. This is no global lock on other tasks.

Reuse suitable tabs between sequential checks when necessary state survives.
Additional tabs are allowed for comparison, independent authentication or an
unsaved form. A new URL, viewport, screenshot, retry or REPL reset alone is
not a reason to create another tab. No global tab cap or fixed delay is given.

## Intentional closure

Save required results first. Do not add blanket cleanup to every completed
turn or clean the user's whole browser.

1. Observe that the target is live and owned or explicitly authorized for
   closure. Establish that it is distinct from previously closed underlying
   targets. Handles may alias one tab; a panel may be related to a tab. If the
   API does not expose the relationship, do not guess or close both.
2. Issue one documented close for one target in that tool/REPL call and await
   its result. Retire the handle; do not try a second alias as a fallback.
3. Before another necessary close, obtain fresh supported state in a separate
   call. Inspect it before closing another distinct authorized live target.
   Avoid immediately reopening or reattaching the target just closed.

One close per call and observation between closes are conservative workflow
choices. They do not prove that native teardown settled or that a particular
delay is safe. Ordinary closure remains allowed.

## Ambiguous state and recovery

If a close times out, observe once before deciding: it may have completed.
If a closed id reappears or the state remains inconsistent, stop that target's
lifecycle actions, retain the observation and report the ambiguity. Do not
force a desired state through close/recreate/reset loops.

A locator error, expired page or timeout alone is not a native app crash.
After a confirmed or reported native crash, retain the last completed action,
its evidence, ambiguous external mutations and remaining work. Reconcile
actual external state before replaying any mutation after recovery.

If a native crash recurs during the resumed attempt, stop browser automation
for that attempt. Continue independent work through an already authorized
available API/CLI when possible. Report the pending UI portion and the need
for diagnosis or an explicit decision to resume it. Do not restart the app,
message other tasks or change host settings without the applicable request.
