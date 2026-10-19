---
kind: bug
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a2116416a43c64c6e
---

# Root typecheck is red on three legacy support harnesses

## What

pnpm typecheck --config tsconfig.json fails on main: tests/legacy/inference/\_support.ts line 201 (TS2322), tests/legacy/server/domain/embeddings/\_support.ts line 300 and tests/legacy/server/domain/search/\_support.ts line 296 (TS2554). Each harness hand-builds an op whose production signature changed. The pre-commit types:native stage fails on them, so every lane bypasses the check hook.

## Why

D320 keeps native typecheck for legacy tests, and a standing red in the commit hook trains every lane to bypass it.

## Done when

Each harness matches its production signature by a mechanical fix under D320, the root typecheck passes, and the legacy suites that import these harnesses still pass.

## Evidence

Filled at landing: what ran and where its output is.
