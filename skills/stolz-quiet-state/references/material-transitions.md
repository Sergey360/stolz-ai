# Material transition rules

- A transition is material when state, cursor, retry count, or reason changes.
- Timestamps alone are not material.
- A cursor is monotonic and durable. A lower cursor is stale; an equal cursor
  with different material state is a conflict. Neither can wake or overwrite
  the accepted cursor.
- Debounce counts consecutive equal material fingerprints, not timestamps or
  poller identities. A flap resets the count.
- Retry delay is derived only from the bounded policy and consecutive failure
  count. Transient failures below the attempt ceiling stay quiet.
- `needs_decision` and `failed` must name the reason; no silent retry loop may
  hide either state.
- A terminal result identity and every emitted wake identity are durable, so a
  restart or concurrent follower cannot replay their notification.
- The single controller owns retry/cursor updates so parallel watchers cannot
  create competing status stories.
