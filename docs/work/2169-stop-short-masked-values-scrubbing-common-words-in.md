---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Stop short masked values scrubbing common words in snap output

## What

A masked key or code value of four or more characters is scrubbed as a substring everywhere in tooling/src/snap/lib/private-values.ts, so a value like home masks every home in page text.

## Why

Over-masking hides real page text in evidence files.

## Done when

Values noted from key and code names scrub only when long enough to be a secret, or only in URL context, with a unit case each way.

## Evidence

Filled at landing: what ran and where its output is.
