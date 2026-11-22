---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The unwired scans judge in one program instead of one per world

## What

The scans open one program per tsconfig world and bridge @orb/server to source, so one file is decoded and judged in up to nine programs, the client world holds most of the server, results are merged across worlds, and design.md's limits keep a member wired across worlds reported. A probe with one merged program over every package src, the three test worlds, tooling and scripts (DOM and Node libs together, the same source bridge, codemods left out) resolved the members of every type all fourteen worlds declare with no member lost and none missing; the only changed member types were fetch-typed members gaining the DOM overload, three performance-entry types gaining navigationId, and one transformers.js loader. The worlds.ts header says merged worlds lose members, which this probe does not reproduce. Probe scripts: reports/api-play/merge-test3.ts and diag-all.ts.

## Why

One program removes the duplicate decoding and judging, the source bridge, the cross-world merge and the cross-world limit, and gives every declaration one symbol identity.

## Done when

The non-package errors the merged program reports (tooling/src/snap and a few test files) are explained, the merged program's peak memory on the whole tree is measured under the memory bar, a full fields report from the merged program is diffed row by row against the per-world run with every moved row explained, then the scans load one program, the bridge, the per-world merge and the cross-world limit are deleted, and the worlds.ts header states what the scans do. The tsconfig worlds, scripts/typecheck.ts, the solution tsconfig and every other tool keep the per-world split; the merged program exists only inside the unwired scanner, built in memory from the world configs, with no tsconfig file added or changed.

## Evidence

Filled at landing: what ran and where its output is.
