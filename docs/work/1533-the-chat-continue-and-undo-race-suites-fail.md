---
kind: bug
status: open
updated: 2026-10-31
priority: P1
area: chat
plan: test-foundation
---

# The chat continue and undo race suites fail on main

## What

tests/server/domain/chat continue-revert-row-races, continue-revert-snapshot-races and continue-undo-snapshot-races (.suite.int.test.ts) fail on main, three of twenty tests, a different set each run. Decide whether each failure is a product race or a test that depends on timing, fix the cause, and inject the clock and ids so the order is fixed.

## Why

A red suite on main hides real regressions in the continue and undo paths, which guard against data loss.

## Done when

Each suite passes ten runs in a row on main at load under 24 and at high load; a product race, if found, has a case that fails before the fix.

## Evidence

- [x] Cause: every failing case is a test timeout, not a product race and not broken split setup. Each case booted its own room, and enabling the plugin guest spawns the plugin host process. Under contention that boot took 2.4 to 4.2 s of a 3.5 to 7 s case, over the 5 s base `testTimeout`. The race itself, from the held write to the read-back, took 10 to 224 ms in every case.
- [x] Not the split: `d697b095fd` moved the race cases verbatim. Each case still builds its own held database and root, so no state crosses cases.
- [x] Before the fix, at load 28 to 41, `pnpm test tests/server/domain/chat` timed out 5 of the 24 race cases at 7025 ms. Both restore methods and both race families failed, plus `continue-return-rows`.
- [x] Fix: `signedRoom` in `tests/server/domain/chat/persistence/continue-physical.ts` boots the held database, the root and the enabled guest once per file in `beforeAll`. Each case continues in a fresh chat through `imageRoom().openChat`, with its own finite provider script. The assertions are unchanged. A case now takes 0.25 to 1.8 s.
- [x] Control: with the `preContinueContent` predicate removed from `prepareContinueRestore`, only the `undoContinue / preContent` case fails. The fresh-chat cases still discriminate.
- [x] Sequential runs of the four suites at load 21 to 32: 10 of 10 passed, 24 of 24 tests each. The box stayed near 24 from sibling lanes, so no run was fully quiet.
- [x] Sequential runs under two concurrent `pnpm test tests/server/domain/chat` runs, at load 31 to 49: 10 of 10 passed, 24 of 24 tests each.
- [x] Both concurrent chat directory runs passed all four race suites. Other plugin-booting suites still time out: `continue-return-rows` and engine and verbs cases.
