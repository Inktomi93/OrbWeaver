---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: tests
plan: test-foundation
---

# surface-data synthetic preparation fails: the corpus image request exceeds its supplied image bytes after the 1735 count wiring

## What

Make the surface-data synthetic preparation supply the corpus image bytes that its image requests need.

## Why

After the count wiring, a request with a customized count neither reads nor seeds the reuse rows, and the corpus asked for more images than it supplies. The Evidence holds the cause and the fix.

## Done when

The surface-data synthetic case in tests/support/node and the corpus chat imagery test both pass.

## Evidence

Cause: after the count wiring, a request with a customized count (n > 1) neither reads nor seeds the reuse rows (`customizesPicture` in `packages/server/src/domain/imagery/verbs/generate-picture.ts`). `seedCorpusImagery` asked for `n: 2` in five cohorts, so the two reuse cohorts generated and the corpus needed 10 images against the 6 it supplies. The corpus responder was right; the producer asked for a count production no longer reuses.

Fix: `tests/support/node/corpus-imagery.ts` uses the default count; `tests/support/node/corpus-chat-imagery.int.test.ts` expects one row per cohort.

Red: `pnpm test tests/support/node/corpus-chat-imagery.int.test.ts` failed with "corpus image request exceeds its supplied physical image bytes"; `surface-data.int.test.ts` synthetic case failed with "Surface preparation failed". Green after the fix: both pass. The standalone-startup case in `surface-data.int.test.ts` timed out at its 30 s budget once at load 43 and passed alone.
