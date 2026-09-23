---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: docs
plan: doc-migration
---

# Split the law docs that exceed the size cap

## What

Split each law doc over the 48 KiB cap into docs that each own one topic. The largest is `Core-Enforcement-Active-Gates.md`, which is a gate catalog: consider generating it from the gate modules instead of keeping it by hand. Keep section numbers that code cites stable, or re-point every citer in the same commit.

## Why

Oversized law docs are read in part and patched in the middle, which is the failure the docs system exists to stop.

## Done when

`pnpm check:agents` reports no size-cap finding under `docs/law/`, and the citation gates in `pnpm check:structure` are green.

## Evidence

Filled at landing: what ran and where its output is.
