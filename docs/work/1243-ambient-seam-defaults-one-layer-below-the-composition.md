---
kind: work
status: open
updated: 2026-10-23
priority: P2
area: server
---

# Ambient seam defaults one layer below the composition root

## What

The root now requires every seam (`ServicesDeps`, every sub-compose deps type, `createProcessSeams`), but optional seams with ambient fallbacks remain one layer down, reachable only from direct tests: notifications `context.ts:17` and `verbs/record.ts:24`; stats `wiring.ts:13`, `apply-delta.ts:138,146`, `rebuild-rollups.ts:593,678`, `rebuild-from-canon.ts:65,91`; `foundation/observability/audit.ts:47,71,85,109`; rpg `tools/mints.ts:5` and `rounds/resync.ts:272`; the optional `random` and `scheduleTimeout` on the inference contracts; and `createScopedTimers` in infra. The `require-seam-properties` codemod under `tooling/src/codemods/` covers the interface-property cases by changing its interface pattern parameter.

## Why

A seam that defaults to the ambient clock or id source is the shape that hid two production defects this week; a direct test of one of these modules can still pass against the real process.

## Done when

Every listed seam is required at its type and supplied by its caller; the codemod run and the hand edits are one commit; a type test per module asserts the seam is required; `pnpm typecheck` and the affected suites are green.

## Evidence

Filled at landing: what ran and where its output is.
