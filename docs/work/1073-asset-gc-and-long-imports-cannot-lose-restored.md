---
kind: bug
status: open
updated: 2026-10-19
priority: P2
area: server
---

# Asset GC and long imports cannot lose restored blobs

## What

The single-run lock is per workload kind, so the weekly assets-gc can run during an import-bundle. An import longer than the grace window can lose restored blobs whose referencing rows are not yet written.

## Why

A large restore that overlaps the weekly sweep can lose owner data.

## Done when

A test proves an import that overlaps a sweep loses no restored blob.

## Evidence

Filled at landing: what ran and where its output is.
