# docs-architecture-history-a-m command receipt

Working directory: `/home/inktomi/inktomi-stack/development/orbweaver`.

| Command / method | Result | Scope / notes |
| - | - | - |
| `git rev-parse HEAD` | Recorded in report at completion | Assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`. |
| Assignment reconciliation (`wc -l`, `wc -c`, `sha256sum`) | 32/32 match | 8,810 lines; 869,357 bytes; no owned-byte drift before analysis. |
| Full-read barrier (`sed -n '1,$p'` over every owned path) | completed | 32 owned documents, 8,810 lines, 869,357 bytes. |
| Shared prerequisites | completed | Read `AGENTS.md`, the project orchestration rule, audit README/rubric/template/workflow/snapshot policy, `docs/Mission.md`, Core-0, TypeScript and Testing spines, plus `scripts/codemods/ast.ts`. |
| `pnpm ast` | exit 0 | Printed the repository-supported structural lenses before AST checks. |
| `pnpm check:docs` | exit 0: `104 file(s) formatted` | Current formatter check only; it does not validate link targets or historical truth. |
| Read-only relative-link target scan | 32 documents; 14 apparent missing targets | 11 are real stale links (10 in Marinara, 1 in gallery-design); 3 `asset:<...>` matches in DESIGN-REVIEW are code-example placeholders, not links. Fragments/external URLs not tested. |
| `pnpm ast callers reapIfOrphan --in packages/server/src` | 2 hits in 2 files | Current-code R3 reachability check for the assets as-built header; callers at `entry/compose/assets-character.ts:223` and `entry/compose/automation-plugin.ts:389`. |
| `pnpm ast callers startBuddyObserver --in packages/server/src` and `pnpm ast refs startBuddyObserver --in packages/server/src` | no results / no declaration | Current-code contradiction check for the exact historical as-built symbol. |
| Literal cross-check `rg -n --glob '*.ts' '\\bstartBuddyObserver\\b' packages/server/src` | 0 matches | Second absence method. `rg --files packages/server/src -g '*.ts'` counted 1,307 files; `packages/server/src/domain/buddy` itself does not exist. |
| `pnpm ast importers @orb/contracts/portability --in packages/server/src` | 22 hits in 20 files | Spot check that the portability provenance points to a current integrated subsystem, not a reason to promote the historical spec to law. |

## Tool failures and limits

- One mistyped `pnpm ast imports ...` invocation exited with usage text (unsupported lens); it is not used as evidence.
- Two chained AST invocations reached the command yield boundary before every requested subcommand printed. Their partial output is not cited; the completed single-lens commands above are the evidence.
- One final-reconciliation `awk` one-liner had shell-quoting syntax failure; it is not used. The subsequent shell-loop reconciliation completed `32/32`, `8,810` lines, `869,357` bytes, zero drift.
- Tests examined/run: unit 0, integration 0, contract 0, CT 0, e2e 0, type 0. This docs-only lane did not alter behavior; source/test lanes own behavioral validation.
