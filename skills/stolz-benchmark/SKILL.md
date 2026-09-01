---
name: stolz-benchmark
description: Evaluate equivalent baseline and optimized routes and accept efficiency evidence only after outcome and verification gates pass.
---

# STOLZ A.I. Benchmark

Use this skill to assess a proposed efficiency improvement; it does not create
a claim from prose, intuition, or one unverified run.

1. Run baseline and optimized routes on the same versioned fixture.
2. Capture route IDs, token counts, model wakeups, tool calls, wall time,
   interventions, outcomes, verification, and raw evidence locations.
3. Accept a comparison only when both routes verify and have equivalent
   required outcomes.
4. Treat a lower-token run with weaker outcome or verification as rejected,
   never as a saving.
5. Do not publish a token-saving statement until reproducible benchmark
   evidence exists.
6. Use `npm run benchmark:check` to verify the checked-in example and inspect
   `benchmarks/README.md` before adding a new suite or collector.

Use [outcome-gate rules](references/outcome-gates.md) for benchmark decisions.
STOLZ A.I. does not make the model think less; it helps it waste less.
