# Material transition rules

- A transition is material when state, cursor, retry count, or reason changes.
- Timestamps alone are not material.
- `needs_decision` and `failed` must name the reason; no silent retry loop may
  hide either state.
- The single controller owns retry/cursor updates so parallel watchers cannot
  create competing status stories.
