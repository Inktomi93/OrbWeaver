---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: credentials
plan: unwired-code
---

# The Claude sign-in check names the API backend it reached

## What

The agent SDK's accountInfo reports apiProvider, its health signal, but the old fields scan dropped it from verifyAuthAccountSchema, and signInVerdict in packages/client/src/features/credentials/lib/connection-account-model.ts says signed in whatever the backend; apiKeySource is on the wire and unread too.

## Why

Owner rule: data the app receives and never shows is a product item, and a sign-in that reached the wrong backend reads as healthy.

## Done when

The verdict names a non-first-party backend and an unexpected key source, with a test on signInVerdict, and the wire field returns with its writer.

## Evidence

Filled at landing: what ran and where its output is.
