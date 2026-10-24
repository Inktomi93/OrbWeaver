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

Filled at landing: what ran and where its output is.
