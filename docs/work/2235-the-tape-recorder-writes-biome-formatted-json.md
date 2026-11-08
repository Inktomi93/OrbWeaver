---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: testing
plan: test-foundation
---

# The tape recorder writes Biome-formatted JSON

## What

The provider tape recorder writes JSON that Biome reformats, because it splits long tool lists across lines, so every fresh recording needs a format pass before commit.

## Why

A recorder whose output fails the formatter makes every re-record a manual step that a cold author will miss.

## Done when

A fresh recording passes biome check with no edits, with a test that records a tape and runs the formatter check on it.

## Evidence

Filled at landing: what ran and where its output is.
