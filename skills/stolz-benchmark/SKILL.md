---
name: stolz-benchmark
description: Admit or reject paired STOLZ efficiency evidence. Use to compare baseline and optimized runs.
---

# Benchmark Evidence

Use for a paired efficiency claim, not general tests or an unmeasured estimate.
Both routes must pass verification and match the required outcome on the same
versioned fixture. Fewer tokens never compensate for lower quality.

Load [outcome-gate rules](references/outcome-gates.md) when evaluating a record
or adding a collector. The reference includes available local checks.

Done: return an admission decision with raw evidence locations and the measured
scope, or withhold the claim with a concrete rejection reason. Synthetic units
and source bytes are not provider token telemetry.
