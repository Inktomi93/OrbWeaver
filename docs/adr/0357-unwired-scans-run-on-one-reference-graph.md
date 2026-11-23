---
kind: adr
status: active
updated: 2026-11-22
---

# The unwired scans run on one typed reference graph

## Context

Each unwired scan walked and resolved the tree on its own, with its own role reader and engine, one program per world. A prototype index over one merged program answered the same questions in one build, and its port now lives in tooling/src/unwired/graph/.

## Decision

tooling/src/unwired/graph/ is the one core of the unwired tool. It builds the typed reference graph fresh on every call over one merged in-memory program, and every unwired verb is a query over it. A world the merge cannot hold, listed in `WORLDS_APART`, is walked as its own program, and its reads credit the same declarations. A scan moves onto the graph only after a row-by-row diff against its current output, with every moved row explained. When a scan has moved, its old engine path is deleted in the same change. The prototype under reports/api-play/ is reference material only and is deleted once every parity row is closed. Homes: tooling/src/unwired/graph/, the graph verbs in tooling/src/unwired/run.ts, plan docs/plans/unwired-code/design.md.

## Consequences

Fixes to the per-scan engines stop; their items wait on the move of their scan. The one exception is a heap fix to the scans that was reviewed before this ruling; it lands because those scans still run until they move; it adds no new path-text library test. One site-role reader and one resolver serve every verb. A read counts as use only in product code, a dev-bridge global read, or a read by `tooling/src/snap/`, since snap drives the real app; other tooling and test reads annotate a finding. A full build is the cost of every call; a dev-only dump and --from run may skip it.

## Alternatives rejected

Keep patching each scan engine: rejected, every fix lands twice and the engines disagree. Persist the graph and update it incrementally: rejected by the owner, a fresh build proves itself.
