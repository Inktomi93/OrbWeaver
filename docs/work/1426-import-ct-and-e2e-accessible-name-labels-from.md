---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: testing
plan: test-foundation
---

# Import CT and e2e accessible-name labels from production

## What

CT and e2e specs hand-type accessible names in getByRole, getByLabel and getByText that production does not export, across many files; the surface walkthrough drivers alone hold several hundred. Spine-Testing §9 requires labels to come from their production home. Hoist each feature's user-facing labels into a zero-import per-feature copy module (the existing \*-copy.ts pattern), have production render from it, and rewrite the spec sites to import it with a repo codemod (tooling/src/codemods/; load the codemod skill). orb/no-hand-copied-label already refuses a literal that a production module exports; once the labels are exported it covers these sites.

## Why

A hand-typed label is a second copy of production: a copy change breaks tests that never imported the source, and the walkthrough cannot follow a renamed control.

## Done when

Every accessible name a CT or e2e spec targets is imported from its production copy module or derived from a production registry; orb/no-hand-copied-label reports zero findings over tests/; the codemod ships with fixtures; affected suites pass.

## Evidence

Partial: the chat rename controls are hoisted, and the item stays open for the rest. The sweep is far larger than one lane: 2456 `name: "…"`, `getByLabel("…")` and `getByText("…")` literal sites across 266 CT and e2e files, with `tests/e2e/support/surface-sections.ts`, `surface-character.ts`, `surface-chat.ts` and `surface-config.ts` holding about 450 of them. Each feature needs a copy module that its production components render from, so the hoist is a production edit per label and not a mechanical rewrite.

Built:

- `packages/client/src/lib/chat-rename-names.ts`, a zero-import module: `RENAME_CHAT_NAME`, `CHAT_NAME_FIELD_NAME`, `CHAT_TITLE_FIELD_NAME`, `renameChatButtonIdentity` and `renameChatButtonName`. `chat-header-title.tsx` and `rename-chat-dialog.tsx` render from it.
- `tooling/src/codemods/literal-to-binding` now substitutes captured metavariables in a `pattern` rewrite's `expression` (`renameChatButtonIdentity($CAST, $TITLE)`), so a hand-built template label rewrites to a label-producing call. Its fixture in `tests/rewrites` covers the template rewrite and a similar template that must stay.
- Applied to `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx`, `tests/e2e/support/chat-room.ts` and `tests/e2e/support/surface-chat.ts`. The remaining specs of the sweep are not rewritten.

`orb/no-hand-copied-label` reported zero findings over `tests/client`, `tests/e2e` and `tests/ui` before and after (`pnpm exec eslint` on those trees, no rule hits). It judges only label-named constant exports, so it cannot see the 2456 sites; this is why zero findings is not the done line here. Extending it to label-producing functions is item 1509 and was not done: no site in this slice needed it to be found, and `renameChatButtonIdentity` stays unindexed until it is.

Ran, with `CT_PORT=3421`: `app-shell-topbar.ct.tsx` and `chat-header-title-name.ct.tsx`, 32 passed on Chromium. `pnpm codemod jssg test` on the codemod, 2 passed. `pnpm typecheck` on `packages/client/tsconfig.json`, `packages/ui/tsconfig.json`, `tsconfig.tests-dom.json`, `tsconfig.node.json` and `tooling/src/codemods/tsconfig.json` passed. `pnpm depcruise` and `pnpm knip:prod` passed.
