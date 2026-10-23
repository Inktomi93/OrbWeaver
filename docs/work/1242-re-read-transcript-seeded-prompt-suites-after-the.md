---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: tests
---

# Re-read transcript-seeded prompt suites after the seq-0 fix

## What

The factories rewrite seeds history through the native chat import, which numbered canon from seq 0 while the readers in `assembly/shape.ts` dropped that row (item 1236). The verifier showed a prompt-cache-prefix prompt on the branch missing its first transcript line where main had it, while the test still passed because it asserts only later indexes. Suites in that position: `prompt-cache-prefix` (departed, unstamped row, placement), `solo-byte-identical`, `turn-prompt-input`, `turn-generate-policy`, `turn-speaker-policy` and the engine history cases under `tests/server/domain/chat/`.

## Why

Those suites passed on prompts the product would not build for a native room; once 1236 lands, each must be re-read with the first line present so its claims are about the real prompt.

## Done when

Each listed suite is re-run on main after 1236 merges, its first transcript line is asserted present where the prompt is read, and any assertion that was indexing around the missing row is corrected. Also: the stray blank line inside the `ChatRoot` interface in `tests/support/node/chat/composed.ts` is removed.

## Evidence

Filled at landing: what ran and where its output is.
