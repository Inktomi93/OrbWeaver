---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: tooling
---

# Snap keeps a cold clone stage for one warm retry instead of tearing it down

## What

A fresh `--stage-db` snap stage's first navigation goes degraded past the client's 20 s readiness ceiling while vite runs its cold dependency optimize under box load, snap marks the stage boot-dead and deletes it, and every retry starts cold again. A side-eye on the card archive made six attempts at load 17 to 21 and never got a live stage, so the new head was judged from CTs alone.

## Why

A reviewer cannot get a live stage while sibling lanes run, which is exactly when reviews happen.

## Done when

A stage whose server and vite both answered but whose first navigation missed readiness during a cold optimize is kept for one warm retry; the boot-dead verdict applies only when the retry also misses; `pnpm snap --stage-status` shows the stage as warming between the two; a tooling test covers the kept-for-retry path.

## Evidence

Filled at landing: what ran and where its output is.

Owed: one live `pnpm snap --stage-db` run under real load, once the box is quiet, to confirm a cold vite optimize ends with the stage kept warming and the retry settling.
