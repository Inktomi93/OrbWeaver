---
kind: work
status: doing
updated: 2026-10-13
priority: P1
area: server
lane: codex/compose-import-998
plan: test-foundation
---

# Move portability and import policies out of entry

## What

Continue compose cleanup across entry/compose/portability.ts, portability-runner.ts and entry/import drivers. Move parsing, import planning, accounting and per-call decisions to production owners; keep entry limited to graph wiring and explicit filesystem adapters.

## Why

Profile and bundle drivers still hold application policy and report decisions outside their owning domains. Their copied test assemblies cannot become the production composition harness.

## Done when

Preserve ownership before private parsing, import refusal before effects, deduplication and provenance, dry-run behavior, cancellation, per-file failure isolation, confirmed writes and report accounting. Reuse owning-domain write factories rather than raw foreign writes. Delete obsolete entry policy in one cohesive batch with preserved meaningful cases and discriminating production controls. Add no grants or fake consumers.

## Evidence

Filled at landing: what ran and where its output is.
