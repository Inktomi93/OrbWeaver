---
kind: work
status: doing
updated: 2026-11-11
priority: P2
area: contracts
lane: wt/agent-ad0e85a8b8ba4ff64
---

# The prose baseline manifest has a test that reads it

## What

`packages/contracts/src/prose/prose-baseline.json` records a hash and version per prose slot. Comments in `packages/contracts/src/prose-slot/index.ts` and `packages/contracts/src/preset/index.ts` say it enforces a version bump with every text change, but nothing reads the file. The same comments cite PROSE-1 sections that no document in the tree holds. Ruling under the delegated-rulings memory: keep the manifest with an ordinary test, which D333 allows. Source: `docs/work/codebase-review/units/contracts.md`.

## Why

A stored base version is a staleness signal only while a text change cannot ship without its version bump.

## Done when

A repository test fails when a slot's text hash changes while its version does not rise, and when the manifest and the registry disagree on the slot set. The comments name that test and cite ADR 0132 or a section that exists.

## Evidence

Filled at landing: what ran and where its output is.
