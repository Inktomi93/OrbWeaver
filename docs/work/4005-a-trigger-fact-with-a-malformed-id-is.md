---
kind: work
status: open
updated: 2026-11-24
priority: P3
area: tests
plan: test-foundation
---

# A trigger fact with a malformed id is refused by both gates

## What

The automation engine parses a TriggerFact's wire id into its brand in engine/fact-scope.ts; an unparseable id reads as null and both scope gates refuse it, but no test feeds a malformed id.

## Why

The parse is the boundary that keeps an unbranded wire id out of canon reads; without a case a later change could cast or pass the text through unseen.

## Done when

A test runs the engine's own door with a fact whose id fails the brand's parse and asserts both gates refuse it, and it fails when the parse is replaced by a pass-through.

## Evidence

Filled at landing: what ran and where its output is.
