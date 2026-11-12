---
kind: decision
status: blocked
updated: 2026-11-12
priority: P3
area: security
blocked: owner
plan: authorization-and-visibility
---

# Write-time and dial-time admission agree on a private IP literal issuer

## What

Write-time admission in packages/server/src/infra/network/egress.ts ignores the allowlist for a private IP literal, so a literal issuer on its own port is refused when written but admitted when dialled. Rule which side changes, then make both gates use one rule.

## Why

Two gates that disagree make the write refusal misleading. It fails closed today, so this is consistency, not exposure.

## Done when

The owner rules which gate changes, both gates read one admission function, and a test covers a private IP literal issuer on a non-default port at both gates.

## Evidence

Filled at landing: what ran and where its output is.
