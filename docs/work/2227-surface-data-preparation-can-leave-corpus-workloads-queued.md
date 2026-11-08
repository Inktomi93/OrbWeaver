---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: testing
plan: surface-walk
---

# Surface data preparation can leave corpus workloads queued until it times out

## What

One synthetic surface preparation failed with the selected native corpus workloads timed out: databank-reindex and distill-characters stayed queued and never started, while index and memory-backfill succeeded. A rerun passed.

## Why

A stuck workload fails a walk before any case runs, at random.

## Done when

The queued-never-started cause is found with workload scheduler evidence and fixed, and repeated preparations settle every selected workload.

## Evidence

Filled at landing: what ran and where its output is.
