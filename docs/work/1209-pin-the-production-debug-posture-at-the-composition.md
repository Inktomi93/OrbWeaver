---
kind: bug
status: open
updated: 2026-10-20
priority: P1
area: security
---

# Pin the production debug posture at the composition root

## What

Nothing tests the production posture wiring: entry/http/app.ts:115 passes resolveOwnerFallbackCredential(ownerFallbackCredentialInput()), and every composed-root test runs with a non-production NODE_ENV, so the value is true either way; production assertions build createAuthSeam by hand without the dependency. Changing line 115 to true would open /api/\_debug whole-database reads and wire captures on every production single-user box behind a same-host proxy with no red test.

## Why

The debug surface's production refusal rests on one unpinned line.

## Done when

A composed-root int test forces the posture input to production and asserts a bare loopback owner gets 404 with no DEBUG_TOKEN and 401 with one, red-first by planting true at the wiring site.

## Evidence

Filled at landing: what ran and where its output is.
