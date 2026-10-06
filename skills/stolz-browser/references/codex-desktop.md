# Codex Desktop browser guidance

Load this only when the current host exposes Codex Desktop browser tools.
This is guidance for available host capabilities, not a browser adapter,
transport, scheduler or compatibility certification.

For `cua_repl`, use the current tool's documented entrypoint. The first call
after initialization or reset contains exactly one documented entrypoint,
with no extra state call, wait or snapshot. After compaction, use the prescribed
documentation refresh before continuing browser work. Do not invent an API,
use hidden CDP access, edit profiles or switch computer-use transports.

Preserve the selected provider and tab mention. An in-app browser task does
not silently move to Chrome. A REPL reset does not require a new tab: observe
fresh supported state and reconcile returned ids and aliases before attaching.
Follow [tab lifecycle rules](tab-lifecycle.md) for intentional cleanup and
ambiguous closure.

For necessary, authorized session preservation or a requested restart, use
the host's available recovery mechanism. No separately installed personal
skill is required. If recovery is unavailable, retain the task checkpoint
through an available authorized artifact mechanism and report what remains.
Recheck ambiguous external mutations before repeating them.

Agent-directed lifecycle rules do not control host-managed webview cleanup.
Finish normally without promising that a tab survives turn completion.
These precautions have not been validated as native crash prevention and
provide no safe tab-count, request-rate or settling-delay threshold.
