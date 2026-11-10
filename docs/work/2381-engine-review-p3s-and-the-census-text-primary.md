---
kind: tooling
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# Engine review P3s and the census-text primary-label test

## What

census-text.ts reads a control's primary label as any text at least the ancestor text length less 8 characters, so a long paragraph alone in a region reads as interactive text; the datum voice's doc comment in text/variants.ts calls it the label step while the recipe sets text-micro.

## Why

The first forced two empty states to change voice instead of being judged as body text; the second contradicts the code.

## Done when

The primary-label test judges a paragraph by its role and length with a fixture, and the datum comment matches its recipe.

## Evidence

Filled at landing: what ran and where its output is.
