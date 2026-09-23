---
kind: adr
status: active
updated: 2026-09-23
---

# one work graph, one documentation catalog, no wiki

## Context

Not recorded in the ledger row.

## Decision

**AMENDED (owner ruling, `docs/adr/0164-docs-plans-adrs.md`): the hash-bound fact-check receipt is REMOVED — the catalog is an inventory (path, lane, kind, status, authority) plus frontmatter validation over the legacy tree, and mutable work state lives in `docs/work/`; the text below is the original ruling.** GitHub Issues + Project 1 own mutable status, priority, lane, dependencies, disposition, review, and verification progress for migrated items; the repository owns Authority (current law/decisions), Program (committed future work), Evidence (re-derived findings), and Archive/Snapshot (resolved history/vendor captures). `proposed/` is COMMITTED future-program inventory: parked means unscheduled and non-authoritative now, not abandoned; each distinct program owns one GitHub sprint issue and revalidates its shape at activation. Evidence routes its findings into Work, Decision, or Program, never a parallel backlog. Existing fine-grained frontmatter kinds map to those roles and phase out by natural replacement, not a bulk rewrite. An item moves once and leaves a pointer, never a mirrored status. Every tracked Markdown document belongs to exactly one `docs/catalog/lanes.json` lane and one receipt row; a completed receipt requires a full read, current content SHA-256, full verification commit, date, evidence, authority class, and disposition. Editing the document invalidates the receipt by hash. `tooling/src/doc-catalog/` generates the disposable catalog and ratchets pending/frontmatter debt downward; GitHub issue #1 and its sub-issues carry the documentation migration state. Vendor snapshots retain upstream metadata and are verified as snapshots rather than rewritten. A GitHub Wiki or narrative status sync would create a second authority and is forbidden.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
