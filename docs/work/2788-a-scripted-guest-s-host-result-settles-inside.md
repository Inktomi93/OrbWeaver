---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A scripted guest's host result settles inside a CPU window

## What

The resolve path of a scripted guest's host call in `packages/client/src/features/plugin/lib/ui-guest/ui-guest-realm.ts` resolves the guest promise with a parsed object outside any interrupt handler, so a guest-defined `then` getter runs unbounded.

## Why

Guest code runs only inside a CPU window. A wedged worker sends no crash report, so the strike policy cannot see it. The harm stays in the plugin's own worker in its own user's browser.

## Done when

Both settle paths run under the bound the pump uses, or the resolve does not read `then`; a component test shows a guest with a looping `then` getter is stopped and reported.

## Evidence

Filled at landing: what ran and where its output is.
