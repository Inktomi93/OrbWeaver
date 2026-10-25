---
kind: work
status: open
updated: 2026-10-25
priority: P1
area: client
plan: css-system
---

# The chat row skin table speaks primitive props

## What

The chat row skin table in `packages/client/src/features/chat/lib/message-row-variants.ts`, keyed by chat style, hands class strings and class-building functions to art-slot, message-row, ghost-message-row, message-row-bubble, message-row-parts, message-name-row-frame, message-row-avatar, swipe-strip and message-actions-row. These are the last sites the drain rules `orb/feature-classname-layout-only` and `orb/no-built-class-string` refuse; `docs/plans/css-system/feature-classname-sites.md` lists them.

## Why

Whole-tree ESLint stays red until they drain. Chat-style skins cannot move into `@orb/ui`: it holds only domain-agnostic primitives and cannot import `ThemeChatStyle` from contracts.

## Done when

The table stays in the chat feature and each skin field is a set of `@orb/ui` primitive props (Card shape, reading-plate prop, radius props); `pnpm lint:eslint packages tooling tests` exits 0; a CT covers each chat style with and without a wallpaper, and one capture set shows all eight styles unchanged or the change is listed.

## Evidence

- `pnpm lint:eslint packages tooling tests` exits 0.
- `tests/client/features/chat/components/chat-style-skins.ct.tsx` mounts the production `AppShell` on a corpus room once per chat style, with and without a wallpaper, and holds the row's track, alignment, body tracks, message box, art corners, swipe foot, action reveal and pinned header to the style's skin row and the resolved tokens.
- The same measurements taken on main's sources and on this change matched in every case.
