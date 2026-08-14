# scripts-misc lane report

## Lane identity

- Lane: `scripts-misc`
- Semantic scope: audit-manifest construction, architecture-doc formatting, cross-package clone advisory lens, ts-morph workspace bootstrap, TS7 proxy, and worktree bootstrap.
- Snapshot commit: assignment `41e18afe74afa570b67a3e670a1a38863c486a00`; current execution `7dda4ecb19d8bfedef10e1649cd7dddba7d89676`.
- Working-tree basis: current bytes; all receipt hashes equal `assignment.txt`.
- Assigned files read: 15/15 (6 owned + 9 shared), 100%.
- Assigned lines read: 5,880/5,880 text lines, 100%.
- Assigned bytes read: 345,643/345,643 bytes, 100%.
- Dirty assigned paths: 4 — `scripts/audit/build-repository-audit-manifest.mjs`; `docs/reviews/repository-audit-2026-08-13/{README.md,RUBRIC.md,REPORT-TEMPLATE.md}`. They were audited as working-tree files.
- Exclusions: no owned test or fixture path is assigned. Execution of the stateful clone lens and worktree bootstrap was excluded to avoid out-of-lane writes.

## Read receipt

`read-receipt.tsv` covers every row in `assignment.txt` exactly: 6 owned paths / 646 lines / 26,791 bytes plus 9 shared paths / 5,234 lines / 318,852 bytes. The original assignment remains authoritative under `SNAPSHOT-POLICY.md`; it is not replaced by the frozen `MANIFEST-ALL.json` entry, whose older audit-manifest-generator hash differs.

## Architecture observed

The manifest generator inventories tracked and untracked non-ignored files, assigns exactly one lane or throws, and only writes the global manifest when neither validation nor selected-lane generation is requested (`scripts/audit/build-repository-audit-manifest.mjs:55-58,97-112,146-168`; R3 CLI behavior). Its `--validate-only` invocation against `LANES-ALL.json` currently succeeds without altering the frozen global manifest (R5 receipt in `commands.md`).

The docs formatter is the package/verification docs stage (`package.json:62-63`, `scripts/verify/registry.ts:299`; R3) and preserves frontmatter while applying the configured compact GFM serializer (`scripts/docs/format-md.ts:26-31,54-77`; R5 scoped check). The TS7 wrapper is called by the root typecheck scripts and the scoped verification registry (`package.json:43-45`, `scripts/verify/registry.ts:100`; R3/R5 version receipt). `getWorkspace` is the shared ts-morph loader imported by the gate pass and verifier/probe callers (`scripts/ts-workspace.ts:34-80`, `scripts/check/pass.ts:9`; R3). The clone lens and bootstrap are intentionally operational/manual scripts, invoked by root scripts (`package.json:12,82`; R3).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Audit manifest generator | 4 | 3 | 4 | 2 | 4 | high | `scripts/audit/build-repository-audit-manifest.mjs:55-58,97-112,146-168`; current validate-only/non-mutation control |
| Architecture-doc formatter | 4 | 4 | 4 | 4 | 4 | high | `scripts/docs/format-md.ts:26-31,38-77`; `package.json:62-63`; `scripts/verify/registry.ts:299` |
| Kit-candidates advisory lens | 3 | 3 | 1 | 0 | 2 | medium | `scripts/lens/kit-candidates.ts:93-133,161-225`; `package.json:82` |
| TS workspace bootstrap | 4 | 4 | 3 | 3 | 3 | high | `scripts/ts-workspace.ts:34-80,92-106`; `scripts/check/pass.ts:9`; AST-lens unit receipt |
| TS7 proxy | 3 | 4 | 3 | 3 | 4 | high | `scripts/ts7.cjs:1-11`; `package.json:43-45`; version control |
| Worktree bootstrap | 3 | 2 | 1 | 1 | 2 | medium | `scripts/worktree-bootstrap.sh:17-35`; `package.json:12`; `bash -n` only |

## Findings

### scripts-misc-01 — Native AST `exports`/`importers` silently omits ordinary scripts

- Severity: P2
- Class: instrument-defect
- Confidence: high — would rise to maximum with a regression test asserting script-scope results for a non-gate script.
- Evidence rung: R5 for the reproducible positive/negative control; the product code causality is R3.
- Scope denominator: 304 tracked `scripts/**/*.ts(x)` files; 200 gate files in `harnessGlobs`, leaving 104 ordinary scripts excluded.
- Receipts: `scripts/ts-workspace.ts:34-41` restricts `harnessGlobs`; `scripts/ts-workspace.ts:48-64` defines the unused all-scripts `searchGlobs`; `scripts/codemods/ast.ts:124-129,3883-3901,4076` selects the false/types-less bootstrap for `exports` and `importers`. Current `pnpm ast exports scripts/ts-workspace.ts --max 20` returned no results while `scripts/ts-workspace.ts:18,34,48,68,92` exports five symbols. `pnpm ast exports packages/kit/src/ids --max 20` returned 73 exports (20 shown), proving the lens executes.
- Established fact: a caller receives the clean-looking string `RESULT … no results` for script exports (and script importer queries use the same false/types-less project) even when the queried script has exports/importers. The printed usage calls the tool a workspace structural search (`scripts/codemods/ast.ts:3908-3911`).
- User or system impact: audits and maintenance work on scripts can falsely treat a zero as evidence of no declaration or no caller. The mandatory native structural instrument is therefore blind over this lane's ordinary script source.
- What remains unverified: whether moving every syntax-only verb to `searchGlobs`, or adding a separate script-aware project only for path-scoped commands, meets the CLI's performance envelope.
- Suggested next check or fix: have the codemods owner add a script-scope positive control, then make `exports`/`importers` select `searchGlobs` when their path targets `scripts/**` (or document and error on an excluded scope). Preserve the fast gate harness for its own callers.

## Proven strengths

- The audit generator currently validates the full `LANES-ALL.json` topology and leaves `MANIFEST-ALL.json` byte-identical under `--validate-only` (`scripts/audit/build-repository-audit-manifest.mjs:11-17,97-112,146-168`; R5).
- The formatter's explicit check path currently accepts `docs/Mission.md`, and the verifier registry invokes that same implementation as `docs:format` (`scripts/docs/format-md.ts:38-77`, `scripts/verify/registry.ts:299`; R5).
- The shared AST suite passed 45 current unit assertions, including positive and negative controls for its liveness machinery (`tests/tooling/ast-lens.test.ts:1-31`; R4). It is supporting evidence for the shared tool, not direct coverage of every owned script.

## Declared versus completed

| Declared surface | Strongest current evidence |
| - | - |
| Audit partition validation and selected assignment generation | Current validate-only control succeeds; global-manifest non-mutation SHA control (R5) |
| Compact architecture markdown check/write | Registered package and verify stage plus current scoped check (R5) |
| Cross-client/server clone candidate report | Package command and source implementation; no safe current run because it writes report state (R3) |
| Shared ts-morph workspace bootstrap | Imported by the gate/verifier/probe routes; AST-lens unit suite passes (R4) |
| TS7 native compiler proxy | Root typecheck and verifier routes plus live `--version` result (R5) |
| Fresh-worktree provisioning | Root package command plus shell syntax check only; no isolated operational run (R2) |

## Tests and gates

One examined unit test file, `tests/tooling/ast-lens.test.ts`, passed all 45 tests; it meaningfully exercises the shared AST instrument with synthetic positive and negative controls, but does not directly test the owned manifest generator, formatter, clone lens, TS7 proxy, or bootstrap. The docs formatter is a registered static verification stage (`scripts/verify/registry.ts:294-300`), and TS7 is used by the scoped type stage (`scripts/verify/registry.ts:88-104`). The clone lens is expressly advisory and has no enforcement claim (`scripts/lens/kit-candidates.ts:1-17`). `bash -n` is only syntax validation for the worktree bootstrap, so its score remains low.

## Cross-lane edges

- Hand off `scripts-misc-01` to the `codemods` analysis owner: the defect is implemented in shared `scripts/codemods/ast.ts`, while this lane provides the scripts-scope reproduction and denominator. No change was made here.
- The assignment's `scripts-misc` source hashes match its rolling snapshot, whereas the frozen global partition shows an earlier manifest-generator hash. Synthesis must retain assignment/receipt authority per `SNAPSHOT-POLICY.md`, not label this a source drift defect.

## Tool receipts

`pnpm ast` was read and used. The successful scoped lenses are documented in `commands.md`; the AST export positive control had 73 hits in one package file, while the two script export checks and the script-importer check returned zero because the type-less harness scope excludes ordinary scripts. Literal `rg` cross-checks covered direct CLI registration and known `getWorkspace` import sites. No command/tool failure occurred.

## Lane verdict

All six owned scripts and nine shared prerequisites are fully read and receipt-current. The manifest generator, formatter, and TS7 proxy have current safe positive controls; the AST suite has a current 45-test unit receipt. The clone lens and worktree bootstrap lack a safe state-preserving behavioral invocation in this shared checkout, so they retain limited verification/operability scores. The largest demonstrable gap is not a product script defect: `pnpm ast` returns misleading empty structural results for ordinary scripts, including this lane, and requires the codemods owner’s correction before its zeros can support scripts-level absence claims.
