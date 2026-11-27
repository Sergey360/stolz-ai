# Codex adapter

The Codex adapter connects the provider-neutral STOLZ A.I. contracts to a
local Codex workspace. It can hash artifacts, execute an explicit program and
argument vector without a shell, and persist compact JSON state.

`measurement_capture` is deliberately `false`: the adapter does not invent
token usage when the runtime does not expose an authoritative measurement.
`stolz-benchmark` therefore selects the provider-neutral measurement route
until a trustworthy collector is supplied.

The optional [Codex waiting guide](async-wait.md) maps timed checks,
continuation, and standalone reminders to tools supplied by the host.

Other AI providers can implement the same declaration from
`contracts/adapter-capability.schema.json`. Missing capabilities always use
the provider-neutral fallback and never reduce outcome or verification gates.
