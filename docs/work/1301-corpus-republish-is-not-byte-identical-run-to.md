---
kind: tooling
status: open
updated: 2026-10-24
priority: P2
area: tests
plan: test-foundation
---

# Corpus republish is not byte-identical run to run

## What

While adding the shell-ambient cohort, about half of repeated corpus publishes from one tree differed in one id in notificationInbox.readerFinal, and a baseline without the new cohort also differed in asset and database bytes between runs. tests/support/README.md says two publishes from one tree are byte-identical because every producer draws ids from the injected source in a fixed order.

## Why

A corpus that republishes differently makes every capture-backed CT and e2e case depend on which publish was committed, and hides real drift.

## Done when

The producer that varies under load is named (the notifications inbox producer is the first suspect) and draws its ids and order deterministically; a loop of repeated publishes from one tree is byte-identical, run as a test or a recorded check.

## Evidence

Cause: `releaseOwnedBinding` (`packages/server/src/infra/plugin-host/process-runtime.ts`) drew `seams.mintId()`, the business id source, to label a settlement task. It runs when a plugin worker answers its dispose command, so the draw landed between other producers' draws at a timing the worker sets. A plugin runtime retired in the background (a disabled or crashed plugin) therefore shifted every later seeded id by one in some runs: a ledger asset id embedded in the plugin bundle PNG, the bundle zip's asset id, and the plugin zip bytes and hash. Fix: the label uses a host-local counter and draws no id.

Reproduction before the fix, 8 publishes from one clean tree, `diff -rq` of each against the first, started only at 1-minute load under 24:
- First run of 8 (load about 20 at start, not recorded per publish): 0 of 7 differ.
- Gated run of 8 (load at start 18.8 to 23.5): 1 of 7 differs (publish 7: load 21.1 at start). The `assets` rows of the two `corpus-refused` plugin bundle assets (zip and PNG) and the `plugins` row of that bundle differ: `asset_...21v` against `asset_...21t`, zip size 753 against 754, and the PNG metadata asset id `...21t` against `...21s`. `corpus.json` and `replay.json` are identical.
- A seeded-id trace of one publish shows draw 2105 made by `releaseOwnedBinding` (`process-runtime.ts:973`) from a process tick, between the PNG mint and the install that follow it.
- No `readerFinal` difference appeared in these runs. The notifications producer retires crashed plugin runtimes on the same path, and every producer shares this one counter, so the same draw can move an id there.

Red then green: `process-runtime-lifecycle.int.test.ts` "retiring a disabled guest's runtime draws no business id, whenever its worker answers" holds the dispose response, lets the disable verb return, releases the response and compares the id cursor. Before the fix it failed (`expected 14 to be 13`); after, it passes. No load is needed.

After the fix, 8 publishes from one tree (load at start 15.8 to 22.4): 0 of 7 differ. The committed `corpus-data` was republished from the first of them.

Determinism check in the suite: `tests/support/node/corpus-determinism.int.test.ts` publishes twice (about 60 s each) and compares every file byte for byte. With `Math.random()` planted as the plugin id in `corpus-notifications.ts` it failed on the asset files; unplanted it passes. A double publish is heavy, so the case is tagged `slow`.
