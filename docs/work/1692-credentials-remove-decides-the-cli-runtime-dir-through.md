---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: server
plan: unwired-code
---

# credentials.remove decides the CLI runtime dir through findProvider, which misses disabled plugin providers (unconfirmed; reproduce first)

## What

Reproduce whether credentials.remove skips releasing the CLI runtime directory when the removed key belongs to a disabled plugin provider. Fix the lookup if it does.

## Why

packages/server/src/domain/credentials/verbs/remove.ts finds the wire through findProvider. If the registry hides a disabled plugin's provider, the wire is undefined and the owner's runtime state is never released. The claim is unconfirmed.

## Done when

A test removes the last credential of a disabled plugin provider and asserts whether the runtime state is released. The test passes after the fix, or it shows the state is already released and the item lands with that evidence.

## Evidence

Filled at landing: what ran and where its output is.
