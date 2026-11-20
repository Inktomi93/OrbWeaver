---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: user-admin
---

# A deleted user's Claude CLI runtime directory is released

## What

`schema/credentials.ts:37-42` declares the credential cascade on user delete, but nothing calls `releaseRuntimeState` when a user is deleted. The per-owner Claude CLI directory stays on disk. Call the release from the user delete path.

## Why

A deleted user's CLI config and session files outlive the account, and the directory has no owner to clean it.

## Done when

A test deletes a user who has a Claude CLI directory through the production delete verb and finds the directory gone.

## Evidence

Filled at landing: what ran and where its output is.
