---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: client
plan: cross-surface-consistency
---

# Remove em dashes from feature UI copy

## What

Feature UI strings in rpg, chat, preset, user-admin and other features still use em dashes in labels, notices and accessible names. The persona feature, shared components, forms, app-shell, auth, home, notifications and @orb/ui are already clear. Replace them with the punctuation the copy rules name, and keep developer diagnostics as they are. Acceptance part 2 also found em dashes in packages/client/src/data/new-room-persona-notice.ts, packages/client/src/lib/chat-rename-names.ts, the chat topbar Members and Memory chip names, and the Home section tooltips; the client data and lib folders are in scope.

## Why

Chrome copy that mixes em dashes with the rest of the product reads as two voices, and the persona review found the pattern across features.

## Done when

No user-facing string under packages/client/src/features or packages/ui/src holds an em dash, apart from developer diagnostics named with their reason, and no test asserts a removed spelling.

## Evidence

Filled at landing: what ran and where its output is.
