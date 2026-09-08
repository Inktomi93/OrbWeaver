---
kind: review
status: active
updated: 2026-09-08
---

# #1884 codemod authored-program diagnostics review

## Findings

### Resolved medium — import-only files in sparse programs were routed by predicted ownership instead of their actual compiler closure

The initial change built diagnostic ownership solely from `CompilerProgram.files`, the parsed config root population. Every changed source and reverse consumer was then passed through that root-only map. An existing import-only file in a sparse `files` program therefore appeared to have no actual owner, and `rootedProgramIds` added it to its predicted program. The diagnostic pass checked an invented compiler world in addition to the program that really contained the file.

Concrete failure: a browser program rooted at `tests/e2e/entry.ts` imports `tests/shared/middle.ts`, which imports a DOM-using UI source. `middle.ts` is an existing authored member of the browser program's native closure but is not a parsed config root; its path predicts the Node test program. A harmless edit to the UI source consequently adds `middle.ts` to the Node program and reports TS2584 for the pre-existing valid `document` use. Dry-run reports one diagnostic and apply would refuse a valid transform. This contradicts `docs/architecture/proposed/type-worlds-program.md:90`, which makes actual authored programs and containing compiler closures authoritative during this migration.

Evidence: `pnpm tsx /tmp/codex-1884-closure-drift-probe.ts > /tmp/codex-1884-closure-drift-probe.log 2>&1` used a fresh OS scratch Git tree and the public `runCodemod` harness. It returned `diagnosticErrors:1` with `tsconfig.json: packages/ui/src/api.ts ... TS2584 Cannot find name 'document'` for the harmless browser edit. The scratch tree was removed by the probe; no repository fixture was written.

Resolution: `tooling/src/codemod/lib/program-consumers.ts:125` now records physical-path membership for every authored source returned by each native `Program.getSourceFiles()` closure. `tooling/src/codemod/lib/program-diagnostics.ts:60` keeps root exclusivity separate from legitimate multiple containing closures, and `tooling/src/codemod/lib/program-diagnostics.ts:114` routes existing files through the union of rooted and containing programs. Predicted ownership remains the fallback for files with no authored membership; moved destinations still use their intended destination program. The two regressions at `tests/tooling/codemod/lib/program-diagnostics.int.test.ts:590` pin both the harmless cross-world sparse edit and a real downstream error with refusal-before-write.

Cold resolution evidence: rerunning the exact retained probe as `pnpm tsx /tmp/codex-1884-closure-drift-probe.ts > /tmp/codex-1884-closure-drift-probe-green.log 2>&1` returned `diagnosticErrors:0` for the same harmless browser edit. The final focused suite passed 24/24 and retained the paired real-error refusal.

## Verified clean

- Read the complete current `tooling/src/codemod/lib/program-diagnostics.ts`, `tests/tooling/codemod/lib/program-diagnostics.int.test.ts`, and `docs/architecture/proposed/type-worlds-program.md`, plus the final repair's complete `tooling/src/codemod/lib/program-consumers.ts` and `ProgramDiagnosticBaseline` contract.
- Confirmed `ts.getPreEmitDiagnostics(program, sourceFile)` follows the authored compiler options: the focused tests pin that TS4094 is ignored when declarations are disabled and refuses with no writes when declarations are enabled.
- Confirmed the staged-ownership branches retain their intended controls for existing roots and closures, new and moved destinations, multiple exclusive roots, legitimate multiple containing closures, reverse consumers, sparse closure chains, global effects, aliases, and refusal-before-write behavior.
- Final cold run: `pnpm test:scoped tests/tooling/codemod/lib/program-diagnostics.int.test.ts --maxWorkers=2` passed 24/24 with no type errors. Report: `reports/runs/test/codex-world-gate-integration-2259825-2026-09-08T09-11-13-161Z/test-report.json`.
- Read `/tmp/codex-codemod-worlds-scroll-parity-final.log`: the actual scroll-fade codemod dry-run exited 0, reported no diagnostics, planned two operations over six files, and remained a dry run.
- Final `git diff --check` over the reviewed and repair paths passed; `pnpm check:docs docs/reviews/stickler/2026-09-08-codemod-authored-programs.md` also passed.
- No regions of the scoped files were omitted. Coupled reads were limited to the public compiler-program contract and the baseline's native-program construction needed to establish and verify the repair; the wider codemod kit and unrelated shared changes were excluded.

## Unconfirmed suspicions

None.

## Issue summary

\#1884 review found and resolved one medium-severity false-refusal defect: sparse-program import-only files were initially routed through their predicted program because diagnostic ownership indexed only config roots. The final repair preserves native containing-program membership, keeps rooted exclusivity separate from legitimate multiple closures, and passes the exact red-to-green scratch probe plus the 24-test diagnostic suite. Zero findings remain open. Report: `docs/reviews/stickler/2026-09-08-codemod-authored-programs.md`.
