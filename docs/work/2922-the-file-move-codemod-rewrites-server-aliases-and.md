---
kind: tooling
status: doing
updated: 2026-11-14
priority: P3
area: tooling
lane: wt/agent-a253b95f39b2389ae
---

# The file move codemod rewrites server aliases and mock strings

## What

The codemod in `tooling/src/codemods/move-module-files` rewrites relative imports, the source alias, re-exports and dynamic imports. It skips the server alias, module names inside mock calls and path citations in comments.

## Why

A move that touches one of those forms leaves a broken import or a stale citation for a later check to find.

## Done when

The codemod rewrites each of those forms and has a fixture for each.

## Evidence

Filled at landing: what ran and where its output is.
