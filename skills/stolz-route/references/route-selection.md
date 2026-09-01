# Route selection rules

| Task concern | Skill | Required capability |
| --- | --- | --- |
| Verified source selection | `stolz-context` | `artifact_identity` |
| Known result or command | `stolz-reuse` | `artifact_identity`, `command_execution` |
| Status / retry / cursor | `stolz-quiet-state` | `durable_state` |
| Comparable measurement | `stolz-benchmark` | `measurement_capture` |

If an adapter does not declare every required capability, use the
provider-neutral route. It may be less automated, but it must not omit a
verification step.
