# Agent-tooling command receipts

All commands ran in `/home/inktomi/inktomi-stack/development/orbweaver`. No production, test, gate, law, assignment, or sibling-lane file was modified.

| Command / operation | Duration | Exit | Result / scope |
| --- | ---: | ---: | --- |
| Full reads: constitution, README, audit README/rubric/template/snapshot policy, assignment, all 31 owned files, six shared prerequisites, `scripts/codemods/ast.ts`, and the mirrored guard test |  | 0 | 31/31 owned files; 6,061/6,061 lines; 429,738/429,738 bytes. `tests/tooling/tool-guard.int.test.ts` (405 lines) and `scripts/probes/guard-replay.ts` (295 lines) additionally read. |
| `pnpm ast` | 2.5s | 0 | Native lens usage read. It explicitly excludes `.claude/**` from both its syntactic and typed corpora, so it cannot answer this lane's configuration questions. |
| `pnpm ast apisurface packages/client … packages/kit` | 0.5s | 0 | Current source lens scanned 4,903 files per package invocation; used only to understand the stored API-surface artifacts, not to infer their consumers. |
| `pnpm ast apisurface --files --max 5000` | 89s | unavailable | Broad lens was allowed to finish; process polling confirmed no remaining process. The command runner returned only its initial line and no terminal exit/stdout, so this receipt is a tool-output failure and is not evidence for a finding. |
| `pnpm vitest run tests/tooling/tool-guard.int.test.ts` | 4.0s (7.6s wrapper) | 0 | 1 integration file, 12 tests passed; no type errors. |
| `node .claude/hooks/tool-guard.mjs --classify-batch` with four controlled cases | 0.3s | 0 | Real classifier returned `pass/self-exempt` for two destructive commands containing a trailing `tool-guard.mjs` comment. |
| Hook-protocol stdin probes for `rm -rf … # tool-guard.mjs` and `git stash # tool-guard.mjs` | 0.2s | 0 | Real hook emitted `permissionDecision: allow` for both. |
| `node --check .claude/hooks/tool-guard.mjs`; `bash -n` for the three shell hooks | 0.3s | 0 | Syntax-only checks; explicitly not behavioral proof. |
| `rg -n -l … 'worktree-setup\\.sh|worktree-remove\\.sh|biome-check\\.sh' tests` | 0.3s | raw `rg`: 1; shell: 0 | 1,691 test files enumerated; no test references these three hooks. Independent literal cross-check, not an absence claim about arbitrary external/manual testing. |
| `rg -n -l … 'apisurface-(client|contracts|db|kit|server|ui|run1)' .` | 0.5s | raw `rg`: 1; shell: 0 | 12 assigned API-surface artifacts searched outside their own files; excluded `.claude/worktrees/**` and audit artifacts. No consumer reference found. This is an observation, not filed as a defect. |
| `git status --short`; current assignment/hash reconciliation | <0.3s | 0 | 13 assigned paths are untracked (the agent-authoring skill and 12 API-surface artifacts). `.claude/agent-doctrine.md` transiently differed while read, was reread in full, and finally reconciled to the frozen hash. |

## Structural-tool limits

`pnpm ast` is the repo-native instrument and was run bare first. Its declared corpus is production source, tests, and selected scripts; `.claude/**` is outside it. A direct AST-grep YAML probe scanned one JSON settings file and zero Markdown agent/skill files, therefore produced no usable structural negative. Configuration conclusions use full reads, direct hook protocol execution, and literal inventories only.

## Counts

- Owned text read: 31 files, 6,061 lines, 429,738 bytes.
- Shared text read: 9 required files (constitution, mission, Core-0, TypeScript spine, testing spine, AST implementation, and the three audit protocol documents), 5,234 lines in the assignment snapshot; current `ast.ts` is 4,495 lines, a rolling-snapshot difference.
- Tests examined: unit 0, integration 1, contract 0, CT 0, e2e 0, type 0. Tests run: integration 1 file / 12 tests.
- Structural source-lens scan coverage: 4,903 files for each completed API-surface invocation. Configuration scope: unavailable to `pnpm ast`; no unsupported absence claim is made.
- Tool-output failures: 1 (the broad `apisurface` runner lost its terminal result after process completion).
