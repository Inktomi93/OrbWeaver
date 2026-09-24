---
kind: decision
status: blocked
updated: 2026-09-24
priority: P1
area: infra
blocked: owner
plan: network-and-auth-modes
---

# Rule the network-and-auth-modes forks

## What

Rule the forks listed at the end of section 9 of docs/plans/network-and-auth-modes/design.md: keep or delete AUTH_FALLBACK; warn or refuse a cookie mint over plain http from a public client; the sharing UI option; reversing the never-auto-detect cookie ruling in favour of per-request transport; the relay header set. Record each ruling here.

The owner accepted every default:

1. Keep `AUTH_FALLBACK`.
2. A cookie mint over plain http from a public client warns and does not refuse.
3. Sharing stays an env var. A read-only settings panel shows the `.env` line. There is no runtime mode switch.
4. Reverse the never-auto-detect cookie ruling in favour of per-request transport (Rule C).
5. `x-forwarded-proto` and `x-forwarded-host` count as relay tells.

## Why

Each fork changes a recorded ruling or a user-visible refusal, so a lane may not decide it.

## Done when

Every fork has a ruling in this item and the plan reflects it.

## Evidence

Filled at landing: what ran and where its output is.
