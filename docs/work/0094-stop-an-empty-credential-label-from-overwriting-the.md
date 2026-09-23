---
kind: bug
status: open
updated: 2026-09-23
priority: P1
area: credentials
---

# Stop an empty credential label from overwriting the default key

## What

credentials/verbs/add.ts:32-45: adding a credential with an empty label rotates the provider's default key in place instead of adding a new one.

## Why

A user adding a second key silently loses the first. Security-sensitive: route to security-executor.

## Done when

An empty label adds a distinct credential (or is refused with a reason); the default key changes only by an explicit action. Red-first test on the verb.

## Evidence

Filled at landing: what ran and where its output is.
