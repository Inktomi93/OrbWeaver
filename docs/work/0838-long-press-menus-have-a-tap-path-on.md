---
kind: bug
status: open
updated: 2026-10-10
priority: P2
area: client
---

# Long-press menus have a tap path on iOS

## What

The tag chip at `packages/client/src/features/character/components/character-filter-rail-parts.tsx:224` opens its edit action only from onContextMenu, which iOS WebKit does not fire on long-press. Unverified on device. The row body in `packages/client/src/features/chat/components/member-row.tsx:81` is the menu trigger, so a tap already opens it; its onContextMenu serves the keyboard ContextMenu key only.

## Why

The owner uses iOS; a long-press-only door is dead there.

## Done when

The tag chip has a visible tap path to its edit action, or a long-press handler that fires on iOS, with a CT for the tap path.

## Evidence

- Survey: the only two `onContextMenu` handlers in `packages/client/src` are `character-filter-rail-parts.tsx` (tag chip) and `member-row.tsx:81`. ast-grep (tsx rule on `jsx_attribute`) scanned 816 `.tsx` files; 771 `.ts` files hold no JSX. A second `rg` over `packages/client/src` agrees. No other long-press or touch-hold door exists.
- Fix: each tag chip now has a coarse-pointer-only edit button (`EditableTagChip iconOnly`, the pattern at `character-tag-suggestions.tsx:149`), hidden at fine pointers with `SHOW_ONLY_AT_COARSE`. Right-click and F2 are unchanged.
- CT: `tests/client/features/character/components/filter-rail-tag-edit.ct.tsx`. It failed on the old source (no `Edit tag` button) and passes now.
- `pnpm typecheck` exit 0. `pnpm lint:eslint` on the changed files exit 0.
