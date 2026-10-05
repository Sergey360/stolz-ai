# Ledger and invalidation rules

- The ledger stores producing command, exact input identities, invalidation
  identities, tool version, timestamps, verification, and evidence.
- Any identity mismatch, expiry, or failed verification forces a new execution.
- Equivalent commands use an executable and an argv array. Shell text is not a
  safe identity format.
- A waiting coalesced caller receives the controller result and its evidence;
  it does not run a competing operation.
- Keep the prior result's producer, inspected scope, supporting evidence and
  gaps when using it for analysis or reporting. Verified reuse proves the
  admitted result/identity, not new personal reading or completed downstream
  work. A repeated summary cannot strengthen its original claim support.
