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

Planted failing cases and passing controls are in `tests/tooling/eslint-client-data-gates.test.ts`, `tests/tooling/eslint-container-ownership.test.ts` and `tests/tooling/eslint-ui-law.test.ts`. Before: 20 planted cases failed. After: 210 of 210 pass.

- `no-raw-zustand-persist` and `mutation-only-in-factory`: an aliased named import was already refused. A namespace import, `export *`, a dynamic import and a named re-export of `useMutation` are now refused (`wholeModule` in `tooling/src/eslint/syntax.ts`); a type-only namespace import passes.
- `no-effect-on-shared-selection`: an effect imported under another name (`import { useEffect as run }`) is now followed. The file scope stays as the law states it: `*-selection-store` files plus the active-chat pointer, features only, app-shell exempt (`docs/law/ui-architecture-state-and-stack.md` §5.1). Widening it is a law change, not a spelling gap.
- `VIEWPORT_CLASSES`: refuses `shell-mobile`, `shell-desktop`, `shell-narrow` and `shell-short` outside app-shell; the app-shell control passes.
- `anchor-provides-container`: a `*Dialog` or `*Drawer` counts only as the element the anchor returns (beside sibling dialogs in a fragment). One nested in a layout element no longer satisfies it. Known limit: a returned fragment holding a confirm dialog beside the real box still passes.
- `surface-consumes-container`: also refuses `<Layout.Container>`, an import of `Container` under any name, a literal `container` flag on any element, and a spread object carrying `container`. A renamed `Stack` with a non-literal `container` value still passes.
- `animate-[orb-word-reveal…]`: decided as a rule change, with the law unchanged. The motion guide's class-string enforcer names only `animate-none` and the stock loops as passing, and the word-reveal fade is a stylesheet keyframe anchored by a negative delay that no class string spells. No source uses the class string; the exemption is removed.
- Whole-tree run: `TIMING=1 pnpm lint:eslint packages/client/src packages/ui/src` reports one finding before the anchor fix (a fragment root) and none after; the changed rules stay outside the ten slowest.
