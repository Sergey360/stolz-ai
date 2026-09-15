# Material transition rules

- A transition is material when state, cursor, retry count, or reason changes.
- Timestamps alone are not material.
- The legacy `reportQuietState` helper returns material events (`started`,
  `progressed`, `waiting`, `needs_decision`, `failed`, `done`). It does not own
  scheduling or decide whether to invoke a model. The durable controller admits
  wakes only for a new failure, decision revision or terminal result; progress
  can update stored state while remaining quiet.
- Persist accepted state/cursor and wake identity before reporting, so restart
  cannot replay a prior notification. Poll only when the persisted schedule is due.
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
