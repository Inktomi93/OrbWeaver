---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: tooling
lane: wt/agent-aeccf4a46cc731178
plan: unwired-code
---

# The unwired analyzer keeps a union's ownership when vocabularies share a literal

## What

The test audit recommended a fix: the unwired analyzer can lose ownership by flattening union evidence into shared literal text, so unrelated vocabularies that share a word count as each other's evidence. Confirm it on the current scan and fix it.

## Why

A member can read as built or wired because a different union spells the same word, which hides unwired code.

## Done when

A fixture where two unrelated unions share a literal reports each by its own evidence, red on the old analyzer.

## Evidence

Filled at landing: what ran and where its output is.
