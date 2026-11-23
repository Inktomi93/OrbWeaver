---
kind: bug
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# A client tRPC input literal writes its router schema's keys

## What

The unwired graph's flow walk never pairs an object literal handed to a tRPC procedure's mutate or mutateAsync with the router schema members its keys fill. Those keys fill tRPC's inferred input, whose properties declare at the router's schema keys. So an input key only the client sends, such as commitMessageSchema.attachmentAssetIds, is member-read-only with no writer.

## Why

A live input key reads as never written. Only the literal stage keeps it out of dead, and that stage is a backstop, not the graph's answer.

## Done when

A planted client-to-router case gives the schema key a write in the graph, and the case fails without the change.

## Evidence

Filled at landing: what ran and where its output is.
