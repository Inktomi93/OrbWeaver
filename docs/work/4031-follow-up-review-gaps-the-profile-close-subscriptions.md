---
kind: work
status: open
updated: 2026-11-25
priority: P3
area: client
plan: test-foundation
---

# Follow-up review gaps: the profile close subscriptions, the transparency switch save, the density theme check and the held inset reset

## What

The follow-up code review (reports/code-reviewer) found: no test pins the beforeClose subscriptions in tooling/src/unwired/graph/scan.ts and tooling/src/brand-flow/profile.ts; the reduced-transparency switch's save has no CT; the app-shell-modals density case has no check of its own that the theme is applied; --held-inset in packages/ui/src/layout/variants.ts is inherited, so a section bleed nested in an uncramped section box would read the wrong inset; the stored-update review JSDoc in plugin-row-leaves.tsx omits the standing-refusal line.

## Why

Each is a control or doc a later edit could break or mislead with every suite green.

## Done when

A case pins each subscription, the switch save and the theme application; PADDING_INLINE.section resets --held-inset with a CT of a nested uncramped bleed; the JSDoc names the standing line.

## Evidence

Filled at landing: what ran and where its output is.
