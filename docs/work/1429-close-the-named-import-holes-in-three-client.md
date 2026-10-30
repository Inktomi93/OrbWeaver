---
kind: tooling
status: open
updated: 2026-10-30
priority: P3
area: client
---

# Close the coverage holes in the client lint rules

## What

The law audit found client rules that a different spelling or scope slips past:

- `no-raw-zustand-persist` and `mutation-only-in-factory` match only a named import, so a namespace or aliased import passes.
- `no-effect-on-shared-selection` covers only `*-selection-store.ts` and `active-chat-store.ts` hooks, and only in features outside app-shell.
- `VIEWPORT_CLASSES` in `eslint.config.ts` does not refuse the `shell-mobile`, `shell-desktop`, `shell-narrow` and `shell-short` variants outside app-shell.
- `orb/anchor-provides-container` passes any file holding any `*Dialog` or `*Drawer` element, not only the dialog it anchors (`tooling/src/eslint/ui-feature-policy.ts`).
- `orb/surface-consumes-container` matches only `<Container>`, the `container` attribute on Section and Stack, and `bodyProps`.
- The class-string `animate-*` rule passes `animate-[orb-word-reveal…]`, which the motion law's enforcer list does not name; decide whether the rule or the law changes.

## Why

A guard that a different import spelling bypasses is not a guard.

## Done when

Each rule refuses the namespace and aliased spellings, with planted failing cases and passing controls in the rule tests.

## Evidence

Filled at landing: what ran and where its output is.
