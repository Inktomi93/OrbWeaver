---
kind: bug
status: open
updated: 2026-11-02
priority: P2
area: ui
plan: css-system
---

# usePrintAnchor does not hold a scrolled-up reader through a real print, and its test reads too early: fix it or delete it

## What

`MessageList` no longer measures the rows it mounts only for paper, so a print leaves every screen row size and offset as it was. `usePrintAnchor` is deleted because nothing moves for it to put back. The test now waits for the reader to be at rest before the print, and for a settled layout after it.

## Why

A scrolled-up reader who printed came back about two rows off. The cause was in the `beforeprint` commit, not after the print. Rows mounted for paper were measured on screen, and their estimated sizes above the reader were replaced without moving `scrollTop`. Chromium keeps `scrollTop` through a print. `usePrintAnchor` took its anchor after that shift, so it restored the wrong row.

The old test passed about half the time because it printed within virtual-core's scrolling window (`isScrollingResetDelay`). In that window the list does not measure a row as it mounts, so the defect never ran. A real reader prints long after scrolling stops, so the failing path was the normal one.

No law or ADR line requires print to keep the reading position. The behaviour stays because printing must not move the reader, and the fix is smaller than the hook it replaces.

## Done when

- [x] With the reader at rest, the row at the top of the transcript after a real print (`page.pdf`) is the same row at the same offset as before it.
- [x] The test fails on the old source on every repeat and passes on every repeat with the fix.

## Evidence

- Probe on the old source: `scrollTop` stayed 3880 through the print in every repeat. In the failing repeat, `scrollHeight` went from 6476 to 6154 during the `beforeprint` commit, and the top row went from 29 at -35 px to 31 at -55 px.
- Red on the old source: `pnpm test:ct tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx -g "scrolled-up reader" --repeat-each=8` failed 8 of 8, each with index 29 read as 31.
- Green with the fix: `pnpm test:ct tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx -g "printing a room" --repeat-each=20` passed 40 of 40, which is 20 repeats of each print test.
- The other suites that mount the list passed: `scrollport-lifecycle`, `input-channels`, `jump-to-latest`, `platform-history-pagination`, `platform-chat-arrival`, `transcript-retry` and the whole `platform-text-scale` suite.
