---
kind: tooling
status: open
updated: 2026-10-31
priority: P3
area: tests
plan: test-enforcement
---

# Refuse vacuous assertions and spread corpus captures in tests

## What

Extend orb/ct-negative-only-case to report an a || b inside toBe(true), and add a rule that refuses spreading a corpus capture (corpus.reads\[...]) inside tests/\*\*, pointing at serveCorpusProcedures.

## Why

An OR inside toBe(true) passes when the first operand is false, and a spread capture serves stale data past playback custody.

## Done when

Both refuse a planted case and accept the correct form; existing sites are fixed; both report zero.

## Evidence

Filled at landing: what ran and where its output is.
