---
kind: tooling
status: open
updated: 2026-10-24
priority: P2
area: tests
plan: test-foundation
---

# E2E specs depend on the dev-only window.\_\_orb handle

## What

Specs read window.\_\_orb through tests/e2e/support/chat-room.ts (busLive, busEventTypes) and tests/e2e/support/browser-actors.ts (openMembersTab). A production build folds that handle away, so the e2e client is built with NODE_ENV=development and the OIDC mode lost its plain production build.

## Why

E2E is production qualification; a client built in development mode can differ from what owners run.

## Done when

Each spec that reads window.\_\_orb waits on a production-visible signal instead (rendered state or an existing production attribute such as data-app-ready); CLIENT_BUILD in playwright.config.ts builds a plain production client; the e2e smoke and corpus selections pass on it.

## Evidence

- `rg __orb tests/e2e` finds nothing, and there is no production change. The live stream is a POST event-stream, not a WebSocket, so `tests/e2e/support/stream-tap.ts` reads its frames through Chromium `Network.streamResourceContent`. Stream open waits on the room's `chatOpened` frame; the rename test waits on the `chatUpdated` frame on the chat room's stream; the live turn spec reads message and turn frame order. The members tab opens the chat by unique list-row title.
- `CLIENT_BUILD` is a plain production `vite build`.
- Production build: `event-sequence.spec.ts` and `members-tab-views.local.spec.ts` pass (4 passed). Control: with the chat-room `chatUpdated` emit removed from `hostRowUpdate`, the rename test fails (`chatUpdated` never arrives); the emit is restored. Smoke selection: 32 passed, 1 corpus skip, 1 failure in `oidc-pending-join.oidc.spec.ts`, which fails the same way on the old development build. Corpus: `corpus-home-launch` and `corpus-conversation` pass on `corpus-desktop-bubble`.
- The `@live` specs were not run (no local engine in the worktree).
- `pnpm typecheck` exit 0; Biome and ESLint on changed files exit 0.
