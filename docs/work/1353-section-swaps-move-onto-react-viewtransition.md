---
kind: work
status: open
updated: 2026-10-25
priority: P3
area: client
---

# Section swaps move onto React ViewTransition

## What

React 19.3 makes <ViewTransition> and addTransitionType stable; we are on 19.3.1. The shell hand-rolls document.startViewTransition through withViewTransition (packages/client/src/lib/view-transition.ts) because the router's transition never fires on in-app section switches, with a content-only capture rule in UI-Architecture-and-Layout.md section 4a and MODAL_CONTENT_LIFETIME applied in withContentSwap.

## Why

React's component ties transitions to startTransition, Suspense reveals and transition types, which could give direction-aware section swaps and animated fallback-to-content reveals without the hand-rolled helper.

## Done when

A design note compares the React component with the current helper against the content-only capture rule, the float lifetime rule and reduced motion; the owner rules adopt or keep; if adopted, the helper is replaced, the law text is updated, and the shell motion CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
