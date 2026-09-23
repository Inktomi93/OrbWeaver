---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: chat
---

# Keep the reasoning-time stat correct after a continue

## What

On a continue, the engine's stats delta adds the continuation's reasoning time and subtracts the base's, but the continue update leaves variant metadata insert-only, so the row keeps the base's reasoning_duration. After a reasoning continue, the live reasoning_ms rollup and a reconcileStats rebuild disagree.

## Why

The live stats drift from the canon they are rebuilt from, and the stats page shows a reasoning total that a reconcile silently changes.

## Done when

A continue either rewrites reasoning_duration in the variant's metadata or stops swapping it in the delta; a test runs a reasoning continue and shows the live rollup equals the reconcile rebuild.

## Evidence

`continueVariantStatements` (`packages/server/src/domain/chat/persistence/canon-write.ts`) left the
variant's `metadata` sidecar out of its `.set()`, so `reasoning_duration` stayed insert-only — the row kept
the base generation's window forever. The engine's continue stats delta (`buildTurnStatsDeltas` in
`packages/server/src/domain/chat/engine/engine.ts`) already treats every continue economic (tokens, cost,
the gen window) as a REPLACEMENT of the base's with the continuation's own — never a sum — so the fix makes
`reasoning_duration` follow the same convention: the update now writes `metadata: params.variant.metadata`,
the continuation's own sidecar, matching what the delta already counted as the row's new value.

Red-first: `tests/server/domain/chat/engine/engine-stats.suite.int.test.ts` — the new
`engine stats — a reasoning continue keeps the row's reasoning window in step with the delta (#146)` describe
block drives a real new-slot reasoning turn (400ms window) followed by a real reasoning continue (150ms
window), then asserts the persisted `message_variants.metadata` holds the continuation's 150ms and that the
live rollup and a `reconcileStats` rebuild both settle on 150ms. Confirmed red against the unmodified
source (`expected { reasoning_duration: 400 } to deeply equal { reasoning_duration: 150 }`), green after the
one-line `metadata` fix.

Floor run: `pnpm test:scoped` on the chat engine/turn/continue suites (`engine.int.test.ts`,
`engine-stats.suite.int.test.ts`, `pipeline.test.ts`, `turn.int.test.ts`, `turn-accept-slot.suite.int.test.ts`,
`fork.int.test.ts`, `volatile-freeze-record.suite.int.test.ts`, `recover-narrative.test.ts`) and the stats
write suites (`apply-delta.int.test.ts`, `drift-gate.suite.int.test.ts`, `rebuild-from-canon.int.test.ts`,
`stats-delta.test.ts`) — all passed. `pnpm typecheck` on `packages/server/tsconfig.json` and
`tsconfig.tests-iso.json` — clean. Scoped `biome check` and `eslint` on both touched files — clean.
