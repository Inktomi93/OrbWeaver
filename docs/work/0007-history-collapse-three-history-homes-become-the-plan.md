---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: docs
plan: doc-migration
---

# History collapse: three history homes become the plan archive

## What

Triage `docs/history/`, `docs/architecture/history/` and `docs/history/design/`: a landed program record or a built spec becomes `docs/plans/archive/YYYY-MM-DD-<slug>/design.md` (frontmatter `plan`, status `archived`, the date from its own `updated`); a dated workboard, a cleared ledger, an audit record or a pain ledger is deleted (git holds it); a doc a live gate or ledger cites by path (`tooling/src/verify/contract/resource-document.ts` names `docs/law/Core-Debt-Cleared-Ledger.md`) moves with its citer re-pointed. Every code and doc citation of a moved or deleted file is rewritten or dropped in the same commit; the audit per-lane folders formerly nested under the historical reviews subtree went with the reviews item (`docs/work/0008-reviews-leave-docs.md`).

## Why

History has three homes and none of them is read; the archive is the one home and the checker enforces its shape.

## Done when

`docs/history/` and `docs/architecture/history/` are gone; `LEGACY_ROOTS` in `tooling/src/doc/lib/rules.ts` loses the `history` row; `pnpm check:structure` and `pnpm check:agents` are green.

## Evidence

Filled at landing: what ran and where its output is.
