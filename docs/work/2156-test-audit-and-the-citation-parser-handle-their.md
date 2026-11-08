---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tooling
plan: test-foundation
---

# test-audit and the citation parser handle their edge inputs

## What

pnpm test-audit proves, touches or bench before build dies with a raw stack; the comment citation parser drops the second line of path:12, 15 and en-dash ranges; tests/support/node/db.ts states a stale OwnedDb fact in a comment; the audit has no scored model reader yet.

## Why

A raw stack and a dropped citation line both give a false picture of what the tool checked.

## Done when

test-audit before build names the missing build step, the parser keeps every line of a multi-line or en-dash citation with a test, the OwnedDb comment matches the code, and the model reader is scored or ruled out in Evidence.

## Evidence

Filled at landing: what ran and where its output is.
