---
kind: decision
status: doing
updated: 2026-10-12
priority: P2
area: tooling
lane: codex/ct-checker-990
plan: test-foundation
---

# Decide the maintained CT live-read assertion checker

## What

Compare ct-no-oneshot-live-read-assert with maintained Playwright lint rules on the strict CT population. Preserve live-read and imported-snapshot semantics where native tools do not cover them; move syntax-only enforcement to maintained lint where equivalent. Legacy CT repairs are excluded.

## Why

The lint migration does not establish equivalent coverage for typed live-read identity. Population shrink alone is not a reason to delete a real invariant.

## Done when

Record the coverage comparison and keep, replace or narrow the checker with focused positive and negative controls; do not retrofit legacy CTs or duplicate the shared reference reader.

## Evidence

Filled at landing: what ran and where its output is.
