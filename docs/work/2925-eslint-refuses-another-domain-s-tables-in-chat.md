---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# ESLint refuses another domain's tables in chat's co-participant art gate

## What

Add a native `no-restricted-imports` entry to `eslint.config.ts` for `packages/server/src/domain/chat/persistence/co-participant-assets.ts`, `packages/server/src/domain/chat/verbs/load-co-participant-owner.ts` and `packages/server/src/domain/chat/verbs/load-chat-asset-refs.ts`: `paths: [{ name: "@orb/db", importNames: ["assets", "characters", "personas"], message: "chat reads these rows through the owner ops its contract declares" }]`. Widen the file list as the other chat files stop importing those tables.

## Why

Dependency-cruiser cannot tell the named exports of the `@orb/db` door apart (D335), so nothing stops the art gate from joining those tables again. The gate decides which co-participant art a room member may load, and a direct join would skip the owner reads it now depends on.

## Done when

The entry is on, the gate files lint clean, and a planted `import { assets } from "@orb/db"` in `packages/server/src/domain/chat/persistence/co-participant-assets.ts` fails `pnpm lint:eslint`.

## Evidence

Filled at landing: what ran and where its output is.
