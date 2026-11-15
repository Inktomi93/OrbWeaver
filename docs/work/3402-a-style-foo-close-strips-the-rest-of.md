---
kind: work
status: open
updated: 2026-11-15
priority: P3
---

# A '\</style foo>' close strips the rest of a reply on the inert path

## What

stripStyleElements reads a close tag with trailing text as no close, so everything after an unclosed-looking style element is removed. It hides text, it shows none.

## Why

The reader loses the end of the reply on a Tier A row.

## Done when

The strip ends a style element at a close tag with attributes or trailing text, proven by a row in tests/kit/content/.

## Evidence

Filled at landing: what ran and where its output is.
