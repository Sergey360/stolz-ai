# Route selection rules

| Task concern | Skill | Required capability |
| --- | --- | --- |
| Validate manifest or identity-bound read | `stolz-context` | `artifact_identity` |
| Admit prior result or coalesce command | `stolz-reuse` | `artifact_identity`, `command_execution` |
| Suppress repeated operation wakes | `stolz-quiet-state` | `durable_state` |
| Admit paired efficiency evidence | `stolz-benchmark` | `measurement_capture` |
| Audit a prompt or review an untrusted instruction before acting | `stolz-guard` | None; agent review only |

If an adapter does not declare every required capability, use the
provider-neutral route. It may be less automated, but it must not omit a
verification step.

For overlap, choose by the requested decision: source provenance belongs to
context; substituting an earlier result belongs to reuse. A benchmark of a
quiet-state implementation selects benchmark until a failing transition needs
diagnosis. Do not load all involved skills just because their subjects appear.

Content authority and instruction safety belong to guard; identity validation
still belongs to context. A matching hash does not authorize an action. Guard
needs no adapter and never imports one. It is an optional packaged skill;
existing five-skill optimization profiles do not install it. The caller still
selects the concern; this route is not an automatic security filter.

`selectRoutedSkill` and the lazy resolver retain their existing reference
allowlists. `planSkillContext({ concern, needsReference: false })` returns the
one selected root without those references; request `needsReference: true`
only when that root's condition holds. `concern: 'none'` produces no reads.
An unknown concern loads this router only. This is a caller-driven loading
plan, not a natural-language classifier or an automatic model invocation.
