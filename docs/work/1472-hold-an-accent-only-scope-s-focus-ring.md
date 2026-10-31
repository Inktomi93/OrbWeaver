---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Hold an accent-only scope's focus ring above the outer carried edge

## What

An accent-only ThemeScope over a carried palette emits --color-ring as its own fill without re-holding it above the outer scope's solved input-border edge, so D159's ceiling can fail inside a character accent on a custom theme. Found by the 1464 work.

## Why

D159 says focus out-shouts rest under every carried scope.

## Done when

The accent-only scope solves its ring against the ambient carried edge with the kit solveFocusRing, pinned by a clamp test over the accepted bases.

## Evidence

- `nestedRingOn` in `packages/ui/src/content/theme-scope/derive-vars.ts` holds an accent-only scope's ring above the edge its carried ambient solves, through the kit's `solveFocusRing`. It shares `carriedEdgeOn` and `heldRingOn` with the carried scope's own `inputBorderOn`, and leaves `--color-primary` as painted. D159 states the rule.
- `tests/ui/content/theme-scope/input-border.test.ts` nests three accents in a carried scope on every accepted base and judges the cascade's ring against the outer edge on the card. It failed on main with about four thousand misses, and it passes with the fix. A seed-palette case pins that the ring stays the fill there.
- The floor ran: the theme-scope, kit and token-contract suites; the theme-scope CTs on Chromium and WebKit; typecheck kit, ui, client, tests-dom and node; lint, lint:css, ESLint on the changed paths, depcruise, knip:prod and generated-css-drift. The commit body records each result and the pinned sweep timing.
