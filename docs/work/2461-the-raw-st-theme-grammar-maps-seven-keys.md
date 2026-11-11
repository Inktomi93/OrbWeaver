---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: testing
---

# The raw ST theme grammar maps seven keys and asserts one

## What

packages/server/src/primitives/serde/theme/st.ts translates a raw SillyTavern theme into an orb ThemeOverride across seven key mappings and reports the keys that found no orb seat. The only test that ever runs it is the import door fixture (tests/server/domain/import/persistence/\_st-tree-door.ts:162,234), which ships {name, blur_tint_color} theme objects to prove tree distinctness, not mapping. Six keys and the unmapped-key residue list have no assertion anywhere; on the color side only the rgba tint path rides that fixture, not hex or the flatten-over-surface rule. Source: reports/codebase-review/units/server-primitives.md.

## Why

The residue report exists so an operator can see what ST bundled that found no seat; that half of the contract is unproved, and a drifted key mapping passes the whole suite today.

## Done when

One contract test feeds an ST theme object carrying all seven mapped keys plus unmapped junk keys and asserts the canonical ThemeOverride and the residue list; a hex color and a translucent tint over a painted surface ride the same input.

## Evidence

Filled at landing: what ran and where its output is.
