---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: cross-surface-consistency
---

# Lint dependencies on css-names, brand-names and unwired answer to D333

## What

eslint.config.ts still imports css-names, brand-names and unwired. D333 keeps self-contained custom rules and removes lint dependencies on custom analysis infrastructure. Move each shared judgement to a self-contained module under tooling/src/eslint, as class-owners moved, or record why the tool is not custom analysis.

## Why

A ledger ruling covers these imports, and the consistency work showed the direction can flip cleanly.

## Done when

eslint.config.ts imports no analysis tool, or the ledger states why each stays.

## Evidence

Filled at landing: what ran and where its output is.
