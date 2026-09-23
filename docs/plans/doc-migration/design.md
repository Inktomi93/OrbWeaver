---
kind: plan
status: active
updated: 2026-09-23
---

# Doc migration: the legacy tree moves into the four homes

## Goal

Move every document that survives out of `docs/architecture/`, `docs/design/`, `docs/history/` and `docs/reviews/` into `docs/law/`, `docs/adr/`, `docs/plans/` or the plan archive under `docs/plans/`, delete what does not survive, and remove the attestation catalog and the GitHub board tool, so that `pnpm check:agents` is the one docs checker and `tooling/src/doc/lib/rules.ts` its one rule home. The vendored-doc mirrors this plan formerly named already landed a straight deletion instead of a migration (`docs/work/0010-vendored-docs-leave-git.md`) — nothing there survived to move. The ruling is `docs/adr/0164-docs-plans-adrs.md`; the design of the tool is `docs/plans/doc-system/design.md`.

## Shape

One bounded lane per task, in the order `tasks.md` lists. Each lane moves a set with its citers in the same commit and deletes the old copy; a moved file must pass the new checker on landing, and a red it cannot clear is the lane's report, never an exemption (owner ruling: no grandfather path, no shim, no alias stub).

The standing rules every lane inherits:

1. Before a move, run the citer sweep from `.claude/rules/docs.md` ("Moving or deleting a doc") over `packages`, `tooling`, `tests`, `scripts`, `.claude`, `AGENTS.md` and the root configs; `pnpm check:structure` (`dangling-doc-cite`, `dangling-refs`, `dangling-ref-citations`, `d-citation-integrity`) is the proof, not the method.
2. A path-stable move keeps section numbers; `§` citations by basename resolve unchanged. Only full-path citations are rewritten, by literal prefix.
3. The tooling constants that spell a legacy path are coupled sites of the lane that moves that path: `tooling/src/verify/contract/resource-document.ts`, `tooling/src/verify/lib/dangling-ref-corpus.ts`, `tooling/src/verify/lib/dangling-ref-citations.ts`, `tooling/src/verify/gates/d-citation-integrity.ts`, `tooling/src/verify/lib/selection.ts`, `tooling/src/doc-catalog/lib/vocab.ts`, `tooling/src/doc-catalog/ops/tree.ts`, `tooling/src/doc-catalog/ops/format.ts`, `docs/catalog/lanes.json`.
4. Frozen evidence is deleted, not moved: dated reviews and audit folders are claims about a commit that git already holds.
5. `LEGACY_ROOTS` in `tooling/src/doc/lib/rules.ts` shrinks by one row per folder that empties; the checker refuses a row whose folder is gone, so the row and the folder leave together.

The work items under `docs/work/` carrying `plan: doc-migration` hold each task's scope, coupled sites and done bar; `tasks.md` beside this file is generated from them.

## Rejected

| Option | Why not |
| - | - |
| one big migration lane | thousands of files and a hundred coupled sites; a bounded lane per set is the shape a cold agent can finish |
| a union D-id resolver so the ledger can split over several commits | a shim; the split is one commit that re-points the gate, deletes the registry and rewrites the citers |
| grandfathering migrated prose that breaks the writing rules | the red is the to-do list; a relaxed check for old rows is a second style law |
| moving frozen reviews into the archive | they are evidence about a commit, not a plan; git holds them |
| keeping the catalog for the legacy tree indefinitely | it is the churn the system exists to end; it leaves with the last legacy folder |

## Coupled sites

| Site | Which task |
| - | - |
| `docs/adr/` (the ledger split wrote one decision per file and deleted the registry and its index doc) | ledger split |
| `tooling/src/verify/contract/resource-document.ts` (the ledger resource), `tooling/src/verify/gates/d-citation-integrity.ts` | ledger split |
| `docs/architecture/core/*.md`, `AGENTS.md`, `.claude/rules/*.md`, `.claude/skills/**` (path citations) | law move |
| `tooling/src/verify/lib/dangling-ref-corpus.ts`, `tooling/src/verify/lib/dangling-ref-citations.ts`, `tooling/src/verify/lib/selection.ts` | law move |
| `.claude/rules/writing.md`, `.claude/rules/comments.md`, `.claude/rules/docs.md` (the two legacy style laws fold in and are deleted) | writing-law merge |
| `docs/history/**`, `docs/architecture/history/**`, `docs/history/design/**` | history collapse |
| `docs/reviews/**`, `docs/history/reviews/**`, `.gitignore` | reviews out |
| `tooling/src/verify/gates/caught-failure-ownership.population.json`, `tooling/src/verify/gates/caught-failure-ownership.ts`, `tooling/src/verify/ops/gen/caught-failure-population.ts` | population file |
| the vendored-doc mirrors, `docs/catalog/lanes.json`, `docs/catalog/receipts/` | vendor out (landed, `docs/work/0010-vendored-docs-leave-git.md`) |
| `docs/design/**`, `docs/architecture/proposed/**`, `docs/architecture/proposed/INDEX.md` | design triage |
| `docs/catalog/**`, `tooling/src/doc-catalog/**`, `tests/tooling/doc-catalog/**`, `tooling/src/verify/lib/registry.ts` (`docs:catalog`), `tooling/src/verify/lib/registry-triggers.ts`, `package.json` | catalog removal |
| `tooling/src/workboard/**`, `tests/tooling/workboard/**`, `.claude/skills/orchestrator/**`, `.claude/rules/*.md` (`pnpm work:item` spellings), `package.json` | board tool removal |

## Test plan

Every lane's floor: `pnpm check:agents`, `pnpm check:docs`, `pnpm check:structure`, `pnpm typecheck --config tooling/tsconfig.json` when a tooling constant moved, and `pnpm test:scoped` over the suites that pin the moved constants (`tests/tooling/verify/gates/text-citation-family.suite.test.ts`, `tests/tooling/doc-catalog/**`, `tests/tooling/doc/**`). A lane that deletes a gate resource id runs the whole `check:structure` and reads its `population` counts against the previous run's, per the widening protocol in `docs/architecture/core/Core-Tooling-Law.md`.
