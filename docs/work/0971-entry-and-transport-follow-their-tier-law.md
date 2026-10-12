---
kind: work
status: open
updated: 2026-10-12
priority: P1
---

# Entry and transport follow their tier law

## What

Move data logic out of entry/boot into owning domains: repair-stale-join-seq.ts (raw SQL on chat participants) and seed-owner.ts (users updates beyond the sanctioned role backfill), and the users imports in boot-secrets.ts and seed-local-light.ts. transport/trpc/stream/sources/rpg.ts imports two domain front doors (Tier-4 forbids it); transport/jobs/workload-schedule-scheduler.ts imports a domain value where drivers import types only; foundation/observability/structured-retry.ts imports @orb/inference (Tier-2 allows kit, contracts and db); domain/sessions constructs its own SecretBox and password hasher that Tier-3 says entry builds and injects; entry deep-imports transport/jobs, which has no front door. Add dependency-cruiser rules for each tier rule that has none: two front doors in transport, type-only driver imports, foundation package imports, entry writes to domain tables.

## Why

Each is a written tier rule with no check, so the tree drifted from it.

## Done when

Each site follows its tier rule; each new dependency-cruiser rule has a planted failing control.

## Evidence

Filled at landing: what ran and where its output is.
