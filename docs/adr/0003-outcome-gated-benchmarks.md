# ADR-0003: Outcome-Gated Benchmark Claims

- Status: accepted
- Date: 2026-08-28
- Requirements: `REQ-001`, `REQ-006`, `AC-009`

## Context

Token count alone can hide degraded correctness, skipped verification, or an unrepresentative fixture. The project charter prohibits unbenchmarked claims.

## Decision

Every public efficiency claim compares a pinned baseline and optimized route on the same versioned fixture. Reports retain raw token, wakeup, tool-call, wall-time, and intervention measurements along with required outcome and verification results. Any quality mismatch invalidates the claim.

## Consequences

Benchmark execution may cost more than the optimized route itself, but claims remain reproducible and trustworthy. No aggregate saving is published from an anecdotal or quality-weakened run.
