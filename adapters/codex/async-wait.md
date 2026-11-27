# Waiting in Codex

For a check in the active chat, use one interruptible wait for the remaining
interval, such as `clock.sleep` when exposed by the host. The wait depends on
the active execution. Use an existing event source or deterministic tool
controller when it can handle the wait and meet the requested timing. An
idle CLI needs a verified external wake path to resume automatically.

For a standalone reminder, recurring report, or standing alert, use the
desktop scheduling tool (`mcp__codex_app__automation_update` when available).
Confirm creation before reporting the first scheduled time. Each scheduled
model run can process chat context even if it stays silent. Cached input can
still count toward usage. For billing questions, consult
[Codex pricing](https://developers.openai.com/codex/pricing#token-rates) and
report observed token counters and billed credits as distinct measurements.

This adapter documents host capabilities. The host supplies the wait tool,
scheduling, and wake delivery.
