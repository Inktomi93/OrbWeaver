---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: client
plan: css-system
---

# The motion law's named gates exist

## What

`docs/law/motion-and-animation-guide.md` names `orb/no-unruled-flip-inversion` with its `homes` list ("enforced, not prose-only") and `orb/baseui-state-data-attributes`, and says CTs pin `transitionProperty` for dialog, popover, toast and tabs. None exists. requestAnimationFrame-driven motion sits in `packages/ui/src/art/web-weave/web-weave.tsx:381`, `packages/ui/src/stream/use-smooth-text.ts:103` and `features/character/components/character-filter-rail-parts.tsx:116`.

## Why

Lifecycle styling off Base UI state attributes and a closed FLIP list keep motion compositor-only and reduced-motion-safe; unenforced, they drift.

## Done when

Both rules exist with planted controls and a `homes` list that names the sanctioned rAF sites with reasons; the transition-property CTs exist for the four primitives (or the law names what does pin them); current sites conform.

## Evidence

Rules: `orb/no-unruled-flip-inversion` and `orb/baseui-state-data-attributes` in `tooling/src/eslint/motion.ts`, registered in `tooling/src/eslint/index.ts`, scoped to `@client` and `@ui` in `eslint.config.ts`. Planted controls: `tests/tooling/eslint-motion-gates.test.ts` (36 cases). Red first: with the rules unregistered the file fails at config load (`Could not find "no-unruled-flip-inversion" in plugin "orb"`); registered, all 36 pass.

`FLIP_INVERSION_HOMES` in `eslint.config.ts`, judged against the law (§1.5, §4.2, §4.4):

| Site | Verdict | Reason |
| - | - | - |
| `packages/ui/src/primitives/tabs/tabs.tsx` `glideIndicator` | home | the law's named FLIP member: an inline transform write flushed by `getBoundingClientRect` |
| `packages/ui/src/art/web-weave/web-weave.tsx:381` | home | the rAF loop takes the frame time and re-requests itself; it paints canvas pixels, which have no CSS property to transition (§4.4) |
| `packages/ui/src/stream/use-smooth-text.ts:103` | home | same loop shape; it reveals a string prefix, not a style |
| `packages/client/src/features/refinery/hooks/use-count-up.ts:121` | home | not in the brief; same loop shape (found by the rule); the printed figure is text and must equal the Meter value |
| `features/character/components/character-filter-rail-parts.tsx:116` | no home | a one-frame chunk scheduler that sets React state; it writes no style and does not re-request itself, so the rule never matches it and a home would be stale |

Every other rAF site in `@ui`/`@client` (focus, scroll, state flips, `use-enter-motion.ts`, the two-frame shell flips) writes no style and takes no frame time; ast-grep over `packages` and `tooling/src` found 36 `requestAnimationFrame` calls (24 in `-l ts`, 12 in `-l tsx`). The `packages` scans covered 3392 ts and 934 tsx files: `.animate(` has 0 hits, and `.style.<prop> =` writes a motion property only in `tabs.tsx`. The test `every motion home still holds a shape the rule matches` fails a home the rule no longer matches.

`orb/baseui-state-data-attributes`: the tree has no hit (`pnpm lint:eslint packages/ui/src packages/client/src` clean). The law (§5.3) claimed a surface manifest and cache rejudging that do not exist; the text now states the lexical check that was built.

CTs pinning `transitionProperty` (unpolled reads): `tests/ui/primitives/dialog/native-parts.ct.tsx` and `tests/ui/primitives/popover/native-parts.ct.tsx` (`opacity, scale`), `tests/ui/primitives/toast/transition.ct.tsx` (`opacity, transform, translate`), `tests/ui/primitives/tabs/indicator.ct.tsx` (`transform` at rest, the launched transition set, and the settled landing). The motion guide §1.2 and §4.2 now name those files. Run: `CT_PORT=5871 pnpm test:ct` on the four files, 7 passed.

Not done: the CT pins assert behaviour that was already correct, so they have no red run on old code.
