---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: wt/agent-a53049a5655c3c496
plan: cross-surface-consistency
---

# Chip remove targets meet the coarse-pointer floor

## What

The combobox chip remove target is a 24px square at every pointer. D62 sets a higher floor for a coarse pointer. Give the remove mark a coarse-pointer target that meets that floor without covering the next chip or the input, for example by widening the chip gap at a coarse pointer.

## Why

A remove mark under the coarse floor is hard to hit on a phone, and growing it into its neighbours deletes the wrong keyword.

## Done when

At a coarse pointer the remove target meets the D62 floor, a tap just inside the next chip or the input still hits that control, and a CT measures both.

## Evidence

Fixed in the shared owner, `packages/ui/src/primitives/combobox/variants.ts`. The remove box is the glyph step. Its `::before` hit area bleeds by the pointer-conditional `glyph-bleed`. Chips on a line keep `glyph-gap`, and wrapped lines keep the new `combobox-wrap-*` spacing tokens, so the target never covers the next chip, the line below or the draft input.

CT `tests/ui/primitives/combobox/platform-combobox-chips.suite.ct.tsx` measures `hitExtent` at a fine and a coarse pointer against the floor and probes one pixel inside each neighbour. It fails on the prior source and passes now. The tag, rule and autocomplete suites that mount a combobox pass.
