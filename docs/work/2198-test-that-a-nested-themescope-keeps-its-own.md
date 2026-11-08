---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: tests
lane: wt/agent-a9d600876102df860
plan: test-foundation
---

# Test that a nested ThemeScope keeps its own border under colorization

## What

No test proves a nested ThemeScope keeps its own border once colorization applies; the claim lives only in a test title in app-shell-modals.ct.tsx.

## Why

The behaviour can regress silently now that the title no longer promises it.

## Done when

A CT case builds a nested scope and fails when the inner border falls back to the outer one.

## Evidence

Filled at landing: what ran and where its output is.
