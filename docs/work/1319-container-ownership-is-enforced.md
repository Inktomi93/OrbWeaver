---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: client
---

# Container ownership follows the anchor and surface roles, enforced

## What

`docs/law/UI-Architecture-and-Layout.md` §4 says feature code never writes raw `container-type`/`container-name` (it uses `<Container>` or `<Section container>`), an ANCHOR provides containment and a SURFACE only consumes it. Nothing enforces either: 43 raw `@container` classes or container props sit in 39 feature files, 18 `surfaces/` files declare their own container, and 3 `anchors/` files declare none (`chat/anchors/character-gallery-anchor.tsx`, `chat/anchors/join-invite-dialog.tsx`, `persona/anchors/first-run-persona-dialog.tsx`).

## Why

A surface that declares its own container cannot adapt to the pane it is dropped into; the container model's "build once, place anywhere" payoff depends on the split.

## Done when

An ESLint rule refuses the raw Tailwind `@container` utility and `containerType`/`containerName` style props in `packages/client/src/features/**`; a rule (or the existing `tests/client/feature-layout.suite.test.ts`) refuses `<Container>` and `<Section container>` in `surfaces/` and requires each non-dialog `anchors/` file to render one, with the dialog-box anchors named as their own case; every existing site moves to its role; planted controls fail.

## Evidence

Filled at landing: what ran and where its output is.
