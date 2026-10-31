---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# Server suites that boot a plugin host per case time out under load

## What

tests/server/domain/chat/persistence/continue-return-rows.suite.int.test.ts (privateContinuation) and the chat verbs and engine suites turn-rpg-teaching-policy, turn-rpg-tool-metadata, turn-cancellation, turn-lifetimes-draft and managed-compaction-thresholds boot the composed root and a plugin host per case; under contention the boot alone eats the timeout. Share one room per file the way continue-physical.ts signedRoom() now does, with a fresh chat per case. Also check that budget() reads the box load only once at config load.

## Why

These suites are red on main under load, which hides real regressions.

## Done when

Each suite passes ten runs in a row while another suite runs; no timeout raised and no assertion weakened.

## Evidence

Ten sequential runs of the eight touched files with the chat persistence directory running beside them, box load 53-74: ten of ten green under the repository's own load-scaled budget. Per-case wall time, before (one loaded run, box load about 25-35, each failed case hit the 5.6 s test timeout) and after (minimum to maximum over the ten runs):

| Case | Before | After |
| - | - | - |
| continue-return-rows, 12 cases | 5.4-5.7 s, nine timed out | 0.5-1.9 s |
| turn-rpg-teaching-policy, SEND omits tools with an installed contributor | timed out | 1.8-3.7 s |
| turn-rpg-teaching-policy, SEND omits tools with no contributor | 1.2 s | 0.2-0.7 s |
| turn-rpg-teaching-policy, plugin deactivation | timed out | 1.9-4.7 s |
| turn-rpg-teaching-policy, two installers | timed out | 2.8-6.4 s |
| turn-rpg-tool-metadata | timed out | 0.2-0.5 s (boot is in the hook) |
| turn-cancellation, 6 cases | 4.8-5.7 s, two timed out | 0.1-2.1 s |
| turn-lifetimes-draft, draft-stop | 5.4 s, 5.4 s | 0.2-0.7 s |
| managed-compaction-thresholds | hook failed before either case ran | 1.3-4.0 s per case; search is in the hook |
| collect-garbage, sweep over every reference kind | 2.3 s quiet | 1.4-3.4 s; planting is in the hook |

Cause per suite: continue-return-rows, turn-cancellation and the draft files booted a root and a plugin host per case; they now boot one room per file in a hook. turn-rpg-tool-metadata and collect-garbage are single-case files, so their boot and planting moved into the hook and gain the hook's larger budget. turn-rpg-teaching-policy shares one root, sets guest state and saved model per case, and starts a fresh chat per case. managed-compaction-thresholds has no plugin host; its hook ran eight sequential room boots and sidecar spawns, and the search now probes three counts per round.

Open: with the budget factor pinned to 1 through ORB_BOX_LOAD at a real load of 70-80, the hooks of five files timed out at 10 s and the two-installers case at 5 s. The scaled budget passes; the unscaled one does not at that load. budget() reads the box once, when vitest.config.ts is evaluated (lines 85, 86 and 143), so a run that starts quiet and then meets load keeps the quiet budget.