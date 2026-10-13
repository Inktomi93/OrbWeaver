---
kind: tooling
status: doing
updated: 2026-10-13
priority: P2
area: tooling
lane: codex/native-exceptions-1008
plan: test-foundation
---

# Remove source-proven native exceptions

## What

Apply batch A from the native suppression audit: remove stale dialog exclusions and unreachable accessibility options, inert UI directives and the unnecessary motion observer cast. Preserve all runtime expressions and unrelated configuration.

## Why

These exceptions either admit reintroduction of fixed violations or have no native effect. Their source evidence supports removal without a wider suppression reset.

## Done when

Exact effective-config comparisons preserve unrelated settings and restore dialog restrictions. Affected source lint and client/UI types pass. No runtime behavior changes, weaker assertions or new suppressions. Unresolved audit entries remain separate.

## Evidence

Filled at landing: what ran and where its output is.
