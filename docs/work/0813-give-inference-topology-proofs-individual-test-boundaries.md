---
kind: tooling
status: doing
updated: 2026-10-09
priority: P1
area: ci
lane: codex/inference-proof-boundaries
---

# Give inference topology proofs individual test boundaries

## What

Replace the aggregate inference topology conformance assertion with individually reported native proof cases while preserving the complete declared proof population and production runner.

## Why

Hosted weekly run 37897598461 passes 6047 of 6048 tooling tests; the single aggregate 13-row inference topology proof exceeds the ordinary 5000ms test deadline at 7523ms.

## Done when

Every declared inference topology proof remains exercised through verifyPolicyProofs, failures identify their proof kind and row, no global budget or retry changes are added, focused checks and hosted weekly qualification pass.

## Evidence

Filled at landing: what ran and where its output is.
