# scripts-misc command receipts

Working-tree basis: assignment snapshot `41e18afe74afa570b67a3e670a1a38863c486a00`; audit execution at `7dda4ecb19d8bfedef10e1649cd7dddba7d89676`. The six owned hashes and all nine shared hashes equal `assignment.txt`; the assignment is a valid rolling-snapshot receipt despite the newer commit.

## Full-read and scope reconciliation

`assignment.txt` was the canonical dispatch file; the requested `assignment.md` does not exist. It assigns 6 owned files (646 lines, 26,791 bytes) and 9 shared prerequisites (5,234 lines, 318,852 bytes): 15/15 files, 5,880/5,880 text lines, and 345,643/345,643 bytes were read. Current dirty assigned paths were `scripts/audit/build-repository-audit-manifest.mjs` and the three untracked audit controls `README.md`, `RUBRIC.md`, and `REPORT-TEMPLATE.md`; all findings use their current working-tree bytes.

## Native structural instrument

| Command | Result |
| - | - |
| `pnpm ast` | Exit 0; read the repository usage and lens limits. |
| `pnpm ast importers scripts/audit/build-repository-audit-manifest.mjs --max 100` | Exit 0; no results. This is not a clean invocation claim because the non-typed project excludes ordinary scripts. |
| `pnpm ast importers scripts/docs/format-md.ts --max 100` | Exit 0; no results, same scope limitation. |
| `pnpm ast exports scripts/ts-workspace.ts --max 20` | Exit 0; no results. Positive literal control proves five exported values at `scripts/ts-workspace.ts:18,34,48,68,92`. |
| `pnpm ast exports scripts/check/pass.ts --max 20` | Exit 0; no results despite many exports, confirming the behavior is not specific to `ts-workspace`. |
| `pnpm ast exports packages/kit/src/ids --max 20` | Exit 0; 73 exports in one file (20 shown). Positive control for the lens. |
| `pnpm ast importers scripts/ts-workspace.ts --max 100` | Exit 0; no results in 10.6s, despite direct imports at `scripts/check/pass.ts:9` and seven other ordinary scripts. This confirms the scope defect. |

Scope receipt: 304 tracked `scripts/**/*.ts(x)` files; `harnessGlobs` includes 200 gate files and excludes 104 ordinary script files. `scripts/ts-workspace.ts:34-41` defines that harness scope; `scripts/ts-workspace.ts:48-64` has a separate all-scripts `searchGlobs` scope. `scripts/codemods/ast.ts:3886-3901` does not mark `exports` or `importers` typed, and `scripts/codemods/ast.ts:4076` therefore loads the harness scope for both.

Literal invocation cross-check: `rg` found the formatter in `package.json:62-63` and `scripts/verify/registry.ts:299`, the TS7 wrapper in `package.json:43-45` and `scripts/verify/registry.ts:100`, the worktree bootstrap in `package.json:12`, and `getWorkspace` imports in `scripts/check/pass.ts:9`, two generators, the orphan ratchet, and three probes. Literal search is corroboration only, not structural reachability proof.

## Behavioral and positive-control commands

| Command | Result | Basis |
| - | - | - |
| `node scripts/audit/build-repository-audit-manifest.mjs docs/reviews/repository-audit-2026-08-13 LANES-ALL.json MANIFEST-ALL.json --validate-only` | Exit 0; current tree reconciled all 78 configured lanes, including `scripts-misc` at 6 files / 646 lines / 26,791 bytes; `manifestWritten:false`. | Current CLI positive control. |
| SHA-256 `MANIFEST-ALL.json` before/after that validation | Identical: `d87146dfb3ca7f9cd058d77c7431e721ec684a418ce287f291f4665068546284`. | Positive control for non-mutation. |
| `node scripts/docs/format-md.ts --check docs/Mission.md` | Exit 0: `check:docs — 1 file(s) formatted`. | Current formatter positive control. |
| `node scripts/ts7.cjs --version` | Exit 0: `Version 7.0.2`. | Current TS7-wrapper positive control. |
| `pnpm exec vitest run --project unit tests/tooling/ast-lens.test.ts` | Exit 0: 1 file, 45 tests passed in 7.85s. | Current unit proof for the shared AST instrument, including its liveness substrate; it is not direct coverage of the six owned scripts. |
| `bash -n scripts/worktree-bootstrap.sh` | Exit 0. | Syntax-only check; not behavioral proof. |

`scripts/lens/kit-candidates.ts` was not run: it deliberately removes/creates `reports/lens/.jscpd-scratch` and writes `reports/lens/kit-candidates.json` (`scripts/lens/kit-candidates.ts:93-95,221-223`), outside this lane's durable-artifact authority. `scripts/worktree-bootstrap.sh` was not run because it runs `pnpm install` and may create/replace `.env` symlink state (`scripts/worktree-bootstrap.sh:21-32`). Those are safe scope decisions, not product failures.

The last script-importer command completed in 10.6s. No command-specific canonical artifact was produced by the successful scoped commands.
