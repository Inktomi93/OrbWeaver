---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: color-contrast on the rails and Characters, Chat

## What

The axe rule color-contrast fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat. Runs: surface-Nn5cKU, surface-q297LL under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

Text under the WCAG contrast ratio is hard to read.

## Done when

The color-contrast finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Part, in dedb6854f9 (checked at merge): the reaction pill's count took the gloss voice's muted ink inside a Toggle (1.78 to 1); it now inherits the control's own ink. The per-message portrait monogram is an axe false positive: axe paired the ink with a dark surface above the opaque pigment tile and does not read mask-image, while the house audit measures 8.09 to 1 and declines a masked foreground. Ruling (claude-b under delegation): the Home chip's muted-seat monogram (3.42 to 1 at the 60% receded step) is fixed in product with a meaning-named opacity step for a muted seat that stays legible, used only there; the audit and the shared receded step are unchanged. Remaining: build that step.
