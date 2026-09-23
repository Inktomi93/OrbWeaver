---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: docs
plan: doc-migration
---

# Reviews leave docs

## What

Done (cb-docsout): the historical reviews subtree under docs/history/ is gone entirely. docs/reviews/
is deleted down to three survivors, each a real dependency this pass proved, not archived output:

- docs/reviews/gate-runtime/ — live tool input, not a report. tooling/src/verify/ops/gen/read-first-costs.ts
  and tooling/src/verify/ops/ledgers-fresh-rollup.ts list this directory's files at runtime (the
  refutation ledger, the family-conversion and audit-wave records, the ResourceHost access-pattern ruling, …)
  to price `docs/law/gate-runtime-read-first.md`'s read-list and to cross-check citations for
  `pnpm check:ledgers-fresh`. It is the working set of the live gate-runtime cutover program, so its real
  home is a new gate-runtime plan folder under `docs/plans/` (a plan, not a review folder) rather than
  beside its reader under `tooling/src/verify/` — only the files those two tools actually enumerate are
  gate input; the rest is the program's authored record. Remaining work: mint the plan folder, move the
  directory into it, re-point the two tools' path constants, and archive the plan through `pnpm doc
  archive` once the program finishes.
- the AST codebase audit folder under docs/reviews (deleted by item 0016) — the control plane of an unfinished audit with open findings
  (its running ledger and its goal file, and every file cited anywhere under the tree by repo-relative
  path — a scripted sweep of every citation caught seven that had been deleted along with the trees that
  formerly held them, restored from the pre-migration commit at their original paths). Remaining work: its
  open findings become individual work items, then the tree goes.
- `tooling/src/verify/gates/caught-failure-ownership.population.json` (moved there by its own item) — a sibling lane's item; not touched here.

Every other citation is rewritten or dropped: dozens of code-comment citations of a deleted review now
name a date or finding id instead of the dead path (no fabricated commit sha — not cheap to derive at
this volume); the stickler and side-eye role files' write-destinations move to the gitignored
`reports/stickler/` and `reports/side-eye/`; the tool-guard hook's own citations are rewritten. Catalog:
the repository-audits lane and its catalog row are dropped (zero matches once the repository-audit
history tree was gone); the reviews lane stays (it still matches real `.md` files under the three
survivors above) and its catalog row is pruned to just them. `LEGACY_ROOTS` keeps its reviews row for the
same reason — the folder is not gone.

## Why

A review is evidence about a commit; git holds the commit. Keeping the output in the tree is the sprawl
the system exists to end — but the sweep found two live tool-input trees masquerading as review output,
which get a plan or program home instead of deletion, the same shape as the base-ui vendor mirror in the
vendored-docs item.

## Done when

The historical reviews subtree under docs/history/ is gone (done). docs/reviews/ holds only the
three named survivors, each on its own path to leaving: the audit's findings land as work items and the
tree is deleted; gate-runtime moves into its own plan folder with its two readers re-pointed, then
archives when the program finishes; the caught-failure-ownership one belongs to its own item. A sweep for
stray citations of the deleted trees names only citers of those three survivors. `pnpm check:structure`
and `pnpm check:agents` are green (verified this pass, before the survivor moves).

## Evidence

Filled at landing: what ran and where its output is.
