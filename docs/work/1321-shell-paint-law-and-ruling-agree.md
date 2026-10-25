---
kind: bug
status: doing
updated: 2026-10-25
priority: P2
area: client
lane: closeout/css
plan: css-system
---

# The shell paints only its own regions, and lint holds that line

## What

`docs/law/client-architecture-lockdown.md` §4.2 gives `shell.css` "shell geometry, region paint, responsive regime, and coordinated compositor motion". An owner ruling quoted at `packages/client/src/features/app-shell/components/context-bracket.tsx:10` says "shell.css is geometry", with colour coming from theme tokens elsewhere. The shell region files carry 41 paint declarations (pane backgrounds, rail tints, hairlines, the scrim).

## Why

Two homes that disagree about who paints the frame let paint drift into whichever file a lane happens to edit.

## Decision

D150 already rules it (ADRs outrank the UI law): `shell.css` owns the shell's own structural surfaces — region fills, seams, elevation — from tokens only, and a component's paint never lands there. The `context-bracket.tsx:10` phrase "shell.css is geometry" is a narrower note about the bracket's ember edge; reword it to match D150. The shell files still break D150: `shell/grid.css` styles `[data-slot="message-bubble"]`, `[data-slot="composer"]` and skins `[data-slot="empty-state-root"]` (padding, radius, fill, blur).

## Done when

A stylelint rule scoped to the shell region files allows colour only as a semantic token reference (or a relative/`color-mix` colour over one) and refuses any selector that targets a component (`[data-slot]` values the shell does not own, or `@orb/ui` classes); the component rules in `grid.css` move to their components' variants or the client styles home; `@scope` with a lower boundary at component roots is evaluated as the mechanism, if the browser targets support it; the lockdown §4.2 row cites D150 instead of restating it; planted controls fail.

## Evidence

- `orb/shell-paint-law` in `stylelint-rules.ts`, enabled for `shell/*.css` in `stylelint.config.ts` with `color-named`. The old `grid.css` (git `HEAD`) fails it with four slot findings; the new one passes `pnpm lint:css`.
- Planted controls in `tests/tooling/stylelint-rules.test.ts` ("a shell region paints from tokens and names no component"): hex, `oklch()` literal, `color-mix` over a hex, a named colour, a foreign `data-slot`, an `@orb/ui` class. `pnpm test:tools tests/tooling/stylelint-rules.test.ts` passes.
- The `text-shadow` reset on the bubble and composer and the chats empty-state plate moved to `packages/client/src/styles/globals.css`, same selectors and a later layer than before, so no winner changes.
- `@scope` is rejected: Firefox ships it in 146 and the floor is Firefox 138 (`web-features` 3.43.0, `docs/plans/css-system/design.md` candidates table).
- D150 (`docs/adr/0150-*`) is the context bracket ADR and is superseded by D313; it states no shell paint rule. The lockdown §4.2 row carries the rule and names the lint; it cites no ADR.
