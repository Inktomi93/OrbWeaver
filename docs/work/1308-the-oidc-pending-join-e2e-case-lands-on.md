---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: auth
---

# The OIDC pending-join e2e case lands on the root instead of the login page

## What

tests/e2e/oidc-pending-join.oidc.spec.ts:60 expects /login?pendingJoin=1 and the page lands on /. It fails the same way on the tree before the e2e build change, with a plain production build, and after it.

## Why

The plan records this journey as qualified; a red qualified journey means either the product or the case regressed.

## Done when

The cause is named (product redirect or case expectation) and fixed; the case passes in the e2e smoke selection.

## Evidence

Filled at landing: what ran and where its output is.
