---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: credentials
---

# A credential's health says when it was last checked

## What

Every variant of credentialHealthSchema (packages/contracts/src/credentials/index.ts) carries checkedAt; the reachability panel shows the verdict but never the time.

## Why

A verdict with no age cannot be told apart from a stale one.

## Done when

The health line shows how long ago it was checked, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
