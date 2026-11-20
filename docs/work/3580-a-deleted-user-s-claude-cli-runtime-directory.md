---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: user-admin
---

# A deleted user's Claude CLI runtime directory is released

## What

Removing a wire's last key releases its runtime state in packages/server/src/domain/credentials/verbs/remove.ts. The app has no delete-user verb, so nothing releases the runtime state of every wire a removed user owned.

## Why

A deleted user's CLI config and session files outlive the account, and the directory has no owner to clean it.

## Done when

When a delete-user verb exists, it releases every wire's runtime state the user owned, with a test; until then this item waits on that feature.

## Evidence

Filled at landing: what ran and where its output is.
