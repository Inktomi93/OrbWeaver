---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: tests
---

# Test support gaps found during round two

## What

`tests/ui/content/theme-scope/input-border.test.ts` runs for minutes alone and timed out under load. The sideways reach helper in `tests/support/browser/sideways-reach.ts` measures against the scroller's border edge, so a classic scrollbar hides an element that reaches exactly that edge, and it skips text that spills inside a box that fits. Nothing refuses a caller that sends a toast priority, which would bring back the second alert node. The above-composer story is copied between the chat and automation test features because a helper cannot be shared across features. `Select layout=inline` now wraps its value and its one caller has no component test. Item text for the Select work still names a prop that no longer exists.

## Why

Each gap lets a fixed defect return unseen or turns a busy run red for no defect.

## Done when

The slow test is tagged or fast, the reach helper covers both blind spots with a control case each, a type or rule refuses a toast priority, the story has one testkit home, and the inline Select caller has a reflow case.

## Evidence

Filled at landing: what ran and where its output is.
