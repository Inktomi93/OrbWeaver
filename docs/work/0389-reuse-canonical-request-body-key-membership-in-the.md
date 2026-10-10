---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: client
---

# Reuse canonical request-body key membership in the connection editor

## What

Use isBeltOwnedBodyKey for connection-editor membership and type the gloss subsets against the canonical key union.

## Why

The editor implements membership separately from the existing contract guard.

## Done when

Membership uses the canonical guard and subset keys remain type-checked. Preserve current user-facing explanations and affected tests.

## Evidence

Source audit: `/tmp/claude-launch-alias-audit/results.json` and its summary. Main checked the relevant declarations and canonical ownership. Implementation and affected checks remain pending.

Done in cb-ui-cleanup. `beltKeyGloss` now gates on `isBeltOwnedBodyKey`; `BELT_STREAM_KEYS` and `BELT_IDENTITY_KEYS` are typed `readonly BeltOwnedBodyKey[]`. The local `BELT_KEYS` alias was deleted rather than kept: replacing its only use left it unused. `connection-editor-model.test.ts` passes (56 tests) and the client typecheck passes. Behaviour is unchanged, so there is no red run; a mistyped subset key now fails typecheck.
