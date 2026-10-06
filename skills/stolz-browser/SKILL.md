---
name: stolz-browser
description: Manage controlled browser tabs with deliberate reuse, ownership and lifecycle checks. Use for tab creation, navigation, closure or session recovery; ordinary web search needs no browser workflow.
---

# Browser Workflow

Use an authorized connector, API or CLI when it can deliver and verify the
required result. Preserve an explicitly selected browser, provider or tab,
and keep rendered UI work when the task requires it.

Reuse a suitable live task-owned tab or the user's selected tab. Track its
provider, returned id, purpose, ownership, aliases and last observed state.
An existing user-selected tab is borrowed; a matching URL does not establish
ownership. Create additional tabs for a concrete need, such as comparison or
preserving an unsaved form. Leave unrelated tabs alone.

Before creating, attaching, navigating or closing tabs, load
[tab lifecycle rules](references/tab-lifecycle.md). Await pending work and
serialize this task's lifecycle operations. Reconcile fresh state after an
interruption; an old handle or snapshot does not establish current state.

When using Codex Desktop browser tools, also load the conditional
[Desktop guidance](references/codex-desktop.md). Follow the available tool's
current initialization and API documentation. Missing tools preserve the
required outcome through an available authorized route, or leave the UI
portion explicitly pending.

Done: verify the requested result, retain required artifacts, and report any
ambiguous operation or unmet UI check. Close temporary owned tabs only when
useful or requested. This workflow creates no controller, restarts no app and
establishes no crash-prevention, runtime-certification or savings guarantee.
