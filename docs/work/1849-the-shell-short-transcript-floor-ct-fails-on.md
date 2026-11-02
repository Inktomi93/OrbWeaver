---
kind: bug
status: open
updated: 2026-11-02
priority: P2
area: client
plan: cross-surface-consistency
---

# The shell-short transcript floor CT fails on main at 844x190: the probe reads 0px where the floor is 160px

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

`tests/support/browser/platform-shell.suite.ct.tsx:126` fails 3 of 3 alone in Chromium on main e192df303e: `expect(probed).toBe("160px")` receives "0px" at line 146. The whole CT run on that tree: 2,282 passed, 2 failed. The other failure, `tests/ui/primitives/message-list/scrollport-lifecycle.ct.tsx:74`, passed 3 of 3 alone. Suspect the short-regime merge (3ba26115be) or 1815 (0a81a0ca06).
