---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: server
plan: stored-data-integrity
---

# Plugin card-data reads and writes guard json_valid, so getCardData on an over-deep row does not raise

## What

Guard readPluginCardData and writePluginCardData with json_valid, as findPluginCardData already does, so an over-deep extensions value does not raise.

## Why

findPluginCardData wraps its JSON functions in a json_valid case because an uploaded card can nest past the SQLite JSON limit. The read and the write call json_type, json_extract and json_set on the same column with no guard, so getCardData on such a row raises.

## Done when

A test in tests/server/domain/character/persistence/plugin-card-data.int.test.ts stores an over-deep extensions value on a card. The read and the write each answer without raising.

## Evidence

Filled at landing: what ran and where its output is.
