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

- `rg __orb tests/e2e` finds nothing. Stream open waits on the production `data-room-attached` attribute on the transcript surface (`useChatBus` returns true once the room's `chatOpened` attach frame arrives). Members tab opens the chat by unique list-row title. The chatUpdated bus-event ring read is replaced by the bus-driven room/list refetch order in the network timeline.
- `CLIENT_BUILD` is a plain production `vite build`.
- Production build, single-user and local: `event-sequence.spec.ts` and `members-tab-views.local.spec.ts` pass (4 passed). Smoke selection from the design doc: 32 passed, 1 corpus skip, 1 failure in `oidc-pending-join.oidc.spec.ts` (lands signed in on the join dialog instead of `/login?pendingJoin=1`); it fails identically with the old development build, so it is not caused by this item. Corpus: `corpus-home-launch` and `corpus-conversation` pass on `corpus-desktop-bubble`.
- `pnpm typecheck` exit 0; Biome and ESLint on changed files exit 0.
