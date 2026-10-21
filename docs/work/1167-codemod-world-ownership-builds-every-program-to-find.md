---
kind: bug
status: blocked
updated: 2026-10-21
priority: P2
blocked: owner
---

# Codemod world ownership builds every program to find one owner

## What

containingPrograms in floor/compiler/ts-workspace.ts answers sourceViews by building all 20 eligible native programs to find the one that owns a file: 61.3 s and 6.2 GiB on a scoped one-file codemod run (957). A root-only lookup would miss files a world owns through imports.

## Why

A one-file question must not pay for every program; on small hardware this alone breaks the codemod floor.

## Done when

Owner lookup answers which programs contain a file without building unrelated programs, including import-only membership, proven by a scoped one-file run with measured time and memory and unchanged owner answers.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
