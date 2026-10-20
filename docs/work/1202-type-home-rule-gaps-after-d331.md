---
kind: bug
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# Type-home rule gaps after D331

## What

server-factory-type-home.ts:153-156 walks into function bodies, so a nested arrow (x: Local) => ... makes Local signature-owned, contradicting the file header; showcase-plugins has an ungated interface; the native type-home cache goes stale when a type is reached through another file's return; Spine-TypeScript 7.4 rows tooling result shape to contract/ and helper API result to the function's file overlap with no tiebreak, and Core-Tooling-Law 2.5 still says contract/ holds result shapes.

## Why

Each lets a shape pass or flag for the wrong reason, or leaves the law ambiguous.

## Done when

The walker stops at function bodies with a red-first row, showcase-plugins is gated, the cache invalidates through returns with a test, and 7.4 and Core-Tooling-Law 2.5 state the tiebreak (signature-owned unless wire-named plain data).

## Evidence

Filled at landing: what ran and where its output is.
