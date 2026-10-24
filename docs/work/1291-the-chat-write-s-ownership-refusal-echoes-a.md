---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: chat
---

# The chat write's ownership refusal echoes a foreign character id

## What

The 1278/1280 lane found that when an upstream lookup is unscoped (a planted mutation of findByOwnerImportHash), the chat write's ownership check refuses correctly but its error text names the foreign character's id. Not live: the upstream scope holds today.

## Why

A refusal that echoes the id it refused turns any future upstream scoping bug into a cross-tenant id leak instead of a plain refusal.

## Done when

The refusal names no id it did not receive from the caller's own scope; a test with the planted unscoped lookup asserts the message carries no foreign id.

## Evidence

Filled at landing: what ran and where its output is.
