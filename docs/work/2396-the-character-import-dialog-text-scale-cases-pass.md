---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: testing
plan: cross-surface-consistency
---

# The character Import dialog text-scale cases pass on WebKit

## What

In tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx the character Import dialog cases at 200% and 300% time out in WebKit waiting for the Import button by role; the old source fails the same way, so the failure predates the enlarged-text fixes.

## Why

The Import dialog's enlarged-text proof has no WebKit result, and a red suite hides the next real failure.

## Done when

Both Import dialog cases pass in test:ct:webkit, with the cause named: a test locator that misses the button, or a product defect that hides it in WebKit, fixed at its owner.

## Evidence

Filled at landing: what ran and where its output is.
