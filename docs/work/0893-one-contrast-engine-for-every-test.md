---
kind: work
status: doing
updated: 2026-10-11
priority: P2
area: tests
lane: wt/agent-a9105ec4f81eb78cd
plan: test-mirror
---

# One contrast engine for every test

## What

The WCAG luminance and contrast kernel is hand-copied in rules-section, appearance-sizing, app-shell, home-surface (with a different knee, 0.04045), part-vs-surface, badge.ct and the palette-contrast suite, which also re-implements three kit colour functions; a kit suite grades itself with kit's own math. Pass the shared engine (tooling/src/floor/instrument/wcag.ts or the kit) into page.evaluate and delete the copies.

## Why

Copies disagree today, so contrast verdicts depend on which test measured.

## Done when

One kernel; every contrast test calls it; the diverging knee is gone; the kit suite is checked against an independent reference.

## Evidence

Filled at landing: what ran and where its output is.

Owner ruling: yes, add fixed OKLab known-answer vectors as the independent oracle for the kit colour maths. The partial branch 63a00505fb+cc1cffc47f does not carry them; the item stays open until they land.

Partial merged 74c87d5967 (63a00505fb, verifier CONFIRMED): every hand-copied kernel in tests/ now uses tooling/src/floor/instrument/wcag.ts node-side. Still open: (a) the owner-ruled independent OKLab known-answer vectors; palette-contrast.suite.test.ts grades the kit derivation with the kit's own oklchToSrgb/compositeSrgb, and the only independent check is the pure-red answer at tests/kit/theme-derivation/index.test.ts:200; (b) the kit's second WCAG engine (packages/kit/src/theme-derivation/index.ts:253-266) still serves tests/kit/theme-derivation/index.test.ts, accepted-base-foreground.suite.test.ts and tests/ui/content/theme-scope/clamp.test.ts; (c) stale "house oklch math" comments at palette-contrast.suite.test.ts:6 and :34-36 and tests/ui/tokens/index.test.ts:196-198; (d) the literal floors list from the lane report.
