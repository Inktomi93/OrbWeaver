---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: testing
plan: cross-surface-consistency
---

# WebKit component tests and the polyfill floor e2e pass on main

## What

The 1396 verification run at 5cd18734b8 failed WebKit component cells in platform-document-pinned-strip, platform-corpus-context-scroll, platform-sequence-chip-height, platform-history-pager, platform-short-room, platform-moonlit-card-shape and the menu platform-positioning suite (pnpm test:ct:webkit), and the default e2e polyfill-floor spec, webkit without the polyfilled builtins renders Home and a chat. Logs: v1396-ct-webkit.log and v1396-e2e.log under reports/surface-consistency-private/full-verification.

## Why

Integrated verification needs the eligible WebKit population and the default e2e projects green, and WebKit runs nowhere else.

## Done when

Each failing cell is fixed at its source, or is a load or Chromium-only case recorded with the reason, and pnpm test:ct:webkit and pnpm e2e pass on main.

## Evidence

Filled at landing: what ran and where its output is.
