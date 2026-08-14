# Commands — docs-core-ui

Working-tree basis: assignment snapshot `41e18afe74afa570b67a3e670a1a38863c486a00`; all eight owned files matched its lines, bytes, and SHA-256 at read and final hash reconciliation. `git diff --name-only -- <owned paths>` and `git status --short -- docs/architecture/core` produced no owned dirty path.

## Required audit controls and read barrier

- Read in full: `AGENTS.md`, `docs/architecture/core/AGENTS.md`, `docs/Mission.md`, `Core-0-Architecture-and-Structure.md`, `Spine-TypeScript-and-Patterns.md`, `Spine-Testing.md`, the audit README/rubric/template/workflow/snapshot policy, and `lanes/docs-core-ui/assignment.txt`.
- Read in full: all eight assigned documents (2,947 lines, 349,056 bytes), then `scripts/codemods/ast.ts` (4,099 lines, 223,111 bytes) before invoking the repository structural instrument.
- `pnpm ast` — exited 0; printed the repository tool usage and supported lenses.
- `pnpm ast refs loadGates --max 100` — tool did not return a result within the executor's 30.4-second ceiling (two attempts, including a 60-second requested yield). This is a tool failure, not absence evidence.
- `pnpm ast ident loadGates --max 100` — same executor-ceiling failure at 30.3 seconds. The repository AST instrument therefore supplied no completed structural negative claim for this lane.

## Source and enforcement checks

- `git ls-files packages/ui/src packages/client/src scripts/check/gates scripts/verify tests/ui tests/client | wc -l` → `2055` scoped tracked files (inventory only; not a conclusion about implementation).
- `git ls-files scripts/check/gates scripts/verify` → 200 gate modules plus verification sources were inventoried. The lane read `scripts/check/loader.ts`, `scripts/check/gates/enforcement-registry-parity.ts`, `scripts/check/gates/no-pointer-variants-in-features.ts`, relevant `.dependency-cruiser.cjs` UI rules, `packages/{ui,client}/package.json`, token generation/output, and token tests where the findings required them.
- Literal fallback after the native AST timeout: `rg -n ...` located `loadGates`, parity-gate, dependency-cruiser, no-pointer gate, and CSP-test receipts. It was used only to locate source for full reads; it supports no negative code claim.
- `pnpm check:docs` → exit 0: `check:docs — 104 file(s) formatted`.
- Reconciled source-backed enforcement: `scripts/check/loader.ts:64-85` discovers and fail-closes descriptors; `scripts/check/gates/enforcement-registry-parity.ts:1-16` enforces the Active-Gates count/table contract; `docs/architecture/core/Core-Enforcement-Active-Gates.md:273-274` records the current discovered active total as 200.
- Reconciled seed-theme generation: `packages/ui/tokens.build.ts:1-7,211-232` says and implements generation of `[data-theme]` blocks in `theme.css`; `packages/ui/src/styles/theme.css:221-250` contains the emitted `mocha` block; `tests/ui/tokens/index.test.ts:1-25` asserts byte-fresh generated artifacts. Tests were read, not executed in this lane.

## Exclusions and limits

- No source, test, configuration, law, gate, or shared artifact was modified.
- No behavioral suite or full structure gate was run: this documentation lane has no changed source and the shared tree is concurrently active. `check:docs` is a formatting verification only, not behavioral proof.
- The report makes no absence claim about undocumented gates or unimplemented UI behavior. Its three findings are positive contradictions with direct receipts.
