# Command receipts

All commands ran from the repository root against working-tree bytes. Source and test files were read only; this lane wrote only its three durable artifacts.

| Command / check | Result | Audit use |
| - | - | - |
| `git status --short` | Pre-existing unrelated source and audit artifacts were dirty; no owned `docs/architecture/history/**` path was dirty. | Working-tree basis / ownership check. |
| Full `sed -n '1,999999p'` traversal of every `OWNED` path in `assignment.txt` | 35/35 files traversed. | Full-read barrier. |
| `sha256sum` for every owned path | 35/35 current hashes equal the assignment hashes. | Receipt reconciliation. |
| `pnpm check:docs` | Exit 0: `check:docs — 104 file(s) formatted`. | Safe documentation-format check. It is format-only, not a path-reference validator. |
| Repository-relative Markdown-link resolver over all 35 files | 0 broken Markdown link destinations. | Link check. Inline-code path references are intentionally assessed separately. |
| `sed` full traversal of `scripts/codemods/ast.ts`; bare `pnpm ast` | Exit 0; tool usage printed. | Required instrument familiarization. |
| `pnpm ast importers @tanstack/react-form --files` | 6 references in 5 files, including `packages/client/src/forms/create-saved-entity-form.ts` and its unit test. | Current Form library reach (R3/R4). |
| `pnpm ast importers @tanstack/react-query --files` | 197 references in 188 files. | Current Query library reach (R3). |
| `pnpm ast importers @tanstack/react-router --files` | 7 references in 6 files, including `packages/client/src/routes/router.tsx` and `main.tsx`. | Current Router library reach (R3). |
| `pnpm ast importers @tanstack/react-virtual --files` | 5 references in 3 `@orb/ui` primitive files. | Current Virtual library reach (R3). |
| `pnpm ast importers zustand --files` | 13 references in 6 files, including persisted/draft stores and their unit tests. | Current Zustand library reach (R3/R4). |
| `pnpm ast ident createEconomicsInsights --in packages/server/src` | 3 references in 2 files; the exported verb is composed into discovery service. | Current check of `stats-discovery-seam` Tier 3 claim (R3). |
| Existence checks for historical raw path claims | The retired AGENTS-1/2/3 files, `docs/architecture/domains/`, `core/Core-BUILD-PLAN.md`, and `core/Core-Path-Registry-D62.md` are absent; the current registry/UI law files exist. `scripts/check/gates/discovery-no-stats-rollups.ts`, `messages-economics.ts`, and `economics-insights.ts` exist. | Broken-reference and current-code reconciliation. |

## Tool failures / incomplete runs

1. An early totals command had a shell syntax error after the full-read traversal completed. The totals/hash command was rerun successfully; no evidence relies on the failed invocation.
2. Two multi-lens `pnpm ast` batches hit the 30-second execution limit after returning completed earlier lenses. Each missing lens was rerun as an individual command and completed. These timed-out grouped calls receive no verdict credit.

## Scope and exclusions

- Structural scan coverage: 5 current-code import lenses plus one identifier lens; no negative code claim is made.
- Current source was not audited beyond the named historical-claim checks. No test suite was run because this is a documentation-only historical lane; the relevant existing test receipt is the Form/Zustand importer evidence, not behavioral re-execution.
- The complete command outputs are preserved by the execution transcript; this file records the bounded results used by the report.
