---
kind: work
status: doing
updated: 2026-10-25
priority: P2
area: client
lane: closeout/dom
---

# Container ownership follows the anchor and surface roles, enforced

## What

`docs/law/UI-Architecture-and-Layout.md` §4 says feature code never writes raw `container-type`/`container-name` (it uses `<Container>` or `<Section container>`), an ANCHOR provides containment and a SURFACE only consumes it. Nothing enforces either: 43 raw `@container` classes or container props sit in 39 feature files, 18 `surfaces/` files declare their own container, and 3 `anchors/` files declare none (`chat/anchors/character-gallery-anchor.tsx`, `chat/anchors/join-invite-dialog.tsx`, `persona/anchors/first-run-persona-dialog.tsx`).

## Why

A surface that declares its own container cannot adapt to the pane it is dropped into; the container model's "build once, place anywhere" payoff depends on the split.

## Done when

An ESLint rule refuses the raw Tailwind `@container` utility and `containerType`/`containerName` style props in `packages/client/src/features/**`; a rule (or the existing `tests/client/feature-layout.suite.test.ts`) refuses `<Container>` and `<Section container>` in `surfaces/` and requires each non-dialog `anchors/` file to render one, with the dialog-box anchors named as their own case; every existing site moves to its role; planted controls fail.

## Evidence

- Rules in `tooling/src/eslint/ui-policy.ts` and `ui-feature-policy.ts`, wired in `eslint.config.ts`: `orb/no-raw-container-in-features`, `orb/surface-consumes-container`, `orb/anchor-provides-container`. Lint covers the layout rule, so `feature-layout.suite.test.ts` is unchanged.
- Planted controls: `pnpm test:tools tests/tooling/eslint-container-ownership.test.ts` fails 18 of 33 with the three rules off and passes 33 of 33 with them on. It plants a raw class, a `cn()` class, a template class, style props, a surface `<Container>`, an anchor with none, and a correct anchor and surface pair.
- `Section` had no `container` prop; `Section` and `Stack` now carry one (`container="size"` on `Stack` contains the block axis). `tests/ui/layout/container-props.ct.tsx` fails 3 of 9 with the variants blanked and passes 9 of 9.
- `character-gallery-anchor.tsx` is the dialog case: it mounts `CharacterGalleryDialog`, which renders the dialog box.
- Sites moved: 21 `Section` classes by codemod `section-container-prop`; the rest by hand. Surfaces with a redundant `<Container>` dropped it to the region or content host container; surfaces whose container sat inside a padded box moved it to an anchor.
- CTs run: config, tag, preset, chat, plugin, refinery, discovery, databank, shell and dialog suites, all green.
