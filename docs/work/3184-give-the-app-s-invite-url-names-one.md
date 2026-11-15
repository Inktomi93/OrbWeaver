---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: snap-secret-hygiene
---

# Give the app's invite URL names one home that tooling can read

## What

The invite pair and path names `join` and `invite` are spelled in `packages/client/src/data/join-token.ts`, `packages/client/src/features/auth/lib/sso-redirect.ts`, `packages/server/src/entry/http/join.ts` and, for snap's masks, `tooling/src/floor/browser/url-secret-names.ts`. None of the app homes exports the name, and tooling cannot import the client's DOM world.

## Why

A rename in the app leaves snap's masks on the old name, so the invite token would reach argv, artifact names and traces again with no test turning red.

## Done when

The names live in one zero-import module that the client, the server and tooling read, and `tooling/src/floor/browser/url-secret-names.ts` imports them instead of spelling them.

## Evidence

Filled at landing: what ran and where its output is.
