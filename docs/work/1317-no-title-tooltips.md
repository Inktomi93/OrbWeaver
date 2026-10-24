---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: client
---

# No `title` attribute carries meaning in the client

## What

About 300 `title=` props across `packages/client/src` (Button, Badge, ListRow and others), many carrying the only explanation of a control, such as the rpg tracker write-axis toggle. `.claude/rules/ui-and-client.md` already says essential copy never lives only in `title`, but no lint enforces it.

## Why

`title` is invisible on touch and is not the accessible name.

## Owner ruling

2026-10-24: build the rule and migrate the sites.

## Done when

An ESLint rule refuses `title` on JSX in the client (a named exception only where a primitive owns a native `title` semantic, with its reason); every site moves to the Tooltip primitive with `aria-describedby`, visible copy, or is deleted when it duplicates the accessible name; planted controls fail.

## Evidence

`orb/no-native-title` (`tooling/src/eslint/native.ts`) runs over `packages/client/src/**`. It is type-aware: a JSX `title` is flagged when the props type the element expects binds `title` to React's DOM attribute declarations, so an intrinsic, or a primitive that forwards the DOM attribute (Button, Text, Badge, MenuItem), fails, while a prop a component declares for itself (a dialog heading, `EmptyState`, `ListRow`) passes. The one named exception is the intrinsic `iframe`, whose title is its accessible name; `SandboxFrame` declares its own `title` and passes structurally.

The client held 101 native titles, not about 300: the rest of the `title=` text is component-declared heading props. Each moved to one of: the client `Tip` (the `@orb/ui` Tooltip, described through `aria-describedby` by the seal), visible copy (`DescribedMenuItem` detail lines, visible disabled reasons, the rpg write-axis gloss, the edited time), a `HintTrigger` for a non-interactive datum's explanation, an `sr-only` description where the visible count stays for the eye, or deletion where it repeated visible text or the accessible name. The `native-title-to-tip` codemod (`tooling/src/codemods/native-title-to-tip`) did the mechanical rpg shapes in 9 files.

`pnpm test:tools tests/tooling/eslint-native-title.test.ts` passes 7 tests: three planted controls fail, the iframe, a primitive's own heading prop and a local component's title pass, and a ui path is outside the population. Removing the iframe exception turned its control red. The rule over `packages/client/src` reports 0.
