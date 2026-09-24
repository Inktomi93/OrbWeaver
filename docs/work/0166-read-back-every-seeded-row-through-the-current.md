---
kind: work
status: open
updated: 2026-09-24
priority: P2
area: chat
---

# Read back every seeded row through the current wire schemas

## What

Add an integration test that seeds a fresh install (default cards, example chats, the persona and the RPG game) and then reads every seeded row back through its current contracts wire schema and read path.

## Why

Seeds are validated at write time through the domain verbs. Nothing catches a seeded field that has drifted from what the read path or the UI now expects.

## Done when

The test fails when a seeded field is removed from its wire schema, which a planted control shows, and passes on the shipped pack.

## Evidence

Filled at landing: what ran and where its output is.
