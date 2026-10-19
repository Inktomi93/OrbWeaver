---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# compose-wiring-only flags the canonical Principal mint in entry/auth/seam.ts

## What

On main, tests/tooling/verify/gates/compose-wiring-only.test.ts fails 'the real canonical mint is admitted': the gate reports packages/server/src/entry/auth/seam.ts at the role fallback in principalFromRow (fields?.role ?? captureUserRole("user")) before the test overlay applies. principalFromRow is the one Principal mint under its own policy. Security: route to security-executor.

## Why

A real-corpus red on the one Principal construction site means either the gate misreads the sanctioned mint or the mint holds a capture the compose rule forbids; both touch identity.

## Done when

The finding is classified with evidence: a gate correction with a planted control on both sides, or a seam change that keeps the one-mint rule and its security tests. The real-corpus case passes on main.

## Evidence

Filled at landing: what ran and where its output is.
