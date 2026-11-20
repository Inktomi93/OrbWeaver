---
kind: tooling
status: open
updated: 2026-11-20
priority: P2
area: testing
plan: cross-platform
---

# Firefox runs as a component-test and surface-walk project beside Chromium and WebKit

## What

Owner ruling: Firefox is a supported browser. playwright-ct.config.ts and playwright-surface.config.ts run Chromium and WebKit only. Playwright's own Firefox build (firefox-1555, Firefox 157) is installed for the main pin and launches headless on this box, so a Firefox project can run here now.

## Why

A defect that only Firefox shows ships unseen while Firefox is a supported browser.

## Done when

A Firefox project runs the CT suites through the house runner (a pnpm script beside test:ct:webkit), using Playwright's Firefox build or a proven driver for the system Firefox, with the choice and reason recorded; the browser-tests rule and the cross-platform plan name it; known Firefox-only failures are boarded.

## Evidence

Filled at landing: what ran and where its output is.
