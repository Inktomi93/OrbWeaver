---
kind: work
status: doing
updated: 2026-10-25
priority: P0
area: client
lane: cb-compat
---

# Browser floor lint and the entry-first polyfill land

## What

orb/browser-support and orb/browser-support-css refuse APIs and CSS missing at the BROWSER_TARGETS floor; the client calls Temporal, RegExp.escape and Error.isError, which Safari 18, Chrome 136 and Firefox 138 lack. Owner ruling: a polyfill entry. packages/client/src/entry.ts installs the shims and the Temporal polyfill before it imports the app graph.

## Why

Without the entry the app throws on supported browsers wherever date code runs.

## Done when

The entry-first branch passes review, tests/e2e/polyfill-floor.spec.ts passes in Chromium and WebKit with the builtins deleted and fails on a planted load-time use inside the entry graph, whole-tree ESLint reports 0 orb/browser-support, and cold load on a native-Temporal browser gains no round trip.

## Evidence

Filled at landing: what ran and where its output is.
