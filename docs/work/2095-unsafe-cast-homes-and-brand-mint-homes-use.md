---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tooling
plan: type-law
---

# UNSAFE_CAST_HOMES and BRAND_MINT_HOMES use the home helper

## What

UNSAFE_CAST_HOMES and BRAND_MINT_HOMES in tooling/src/eslint/unsafe-cast.ts sit outside the home helper and match a path by endsWith.

## Why

A suffix match can admit a file outside the intended home.

## Done when

Both lists go through the home helper with exact paths, and a plant with a lookalike path fails.

## Evidence

Filled at landing: what ran and where its output is.
