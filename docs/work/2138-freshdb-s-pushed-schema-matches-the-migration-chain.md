---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# freshDb's pushed schema matches the migration chain's clause order

## What

freshDb pushes a schema that differs from the migration chain in clause order only, in image_analyses, message_variants, rpg_checkpoints, rpg_snapshots, workload_schedules and workloads. Columns, constraints and CHECKs match.

## Why

A schema-equality check that compares text has to special-case these tables, and a real drift could hide among them.

## Done when

freshDb and the migration chain produce identical schema text, or the comparison normalises clause order with a case that still fails on a real column drift.

## Evidence

Filled at landing: what ran and where its output is.
