# Ledger and invalidation rules

- The ledger stores producing command, exact input identities, invalidation
  identities, tool version, timestamps, verification, and evidence.
- Any identity mismatch, expiry, or failed verification forces a new execution.
- Equivalent commands use an executable and an argv array. Shell text is not a
  safe identity format.
- A waiting coalesced caller receives the controller result and its evidence;
  it does not run a competing operation.
