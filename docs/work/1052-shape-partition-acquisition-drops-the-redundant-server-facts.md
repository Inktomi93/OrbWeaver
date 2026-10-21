---
kind: tooling
status: blocked
updated: 2026-10-21
priority: P3
area: tooling
blocked: owner
---

# Shape partition acquisition drops the redundant server facts worker

## What

demandShapePartitions builds server facts (shape-4) that the server pairs stage (shape-6) always supersedes once the DB catalog rebuilds with pairs. Build only the catalog owners' facts before plan.prepare and fold the other descriptors' base families into the pair stage. The cold currentness replays stay, per D328.

## Why

The mixed native-Drizzle shape/schema case spends most of its time in partition workers, and the server facts worker is wasted work on every run. Evidence: reports/review/1016-bounded-owner-reads-final.md in lane wt/agent-a5b507cf43168bf04.

## Done when

The mixed case no longer builds the superseded server facts partition, its final generation is unchanged, and the atomic-publication controls pass.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
