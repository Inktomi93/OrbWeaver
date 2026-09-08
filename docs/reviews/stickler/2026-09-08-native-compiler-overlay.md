---
kind: review
status: active
updated: 2026-09-08
---

# Native compiler overlay and post-move ownership review

Reviewed the #1886/#1887 dirty integration on base `930cbff7f` (the work began on `67393c271`; the base advanced under the coordinated merge train). The review focused on physical path identity, workspace and external symlink boundaries, native config membership, transformed compiler semantics, and refusal before write.

The final reviewed manifest is:

- `tooling/src/verify/lib/compiler-source-filename-overlay.ts`
- `tooling/src/verify/lib/policy-program-membership.ts`
- `tooling/src/verify/contract/policy-scope.ts`
- `tooling/src/verify/index.ts`
- `tooling/src/codemod/contract/types.ts`
- `tooling/src/codemod/lib/run.ts`
- `tooling/src/codemod/lib/program-diagnostics.ts`
- `tooling/src/codemod/lib/program-consumers.ts`
- `tests/tooling/verify/lib/policy-program-membership.test.ts`
- `tests/tooling/codemod/lib/program-diagnostics.int.test.ts`
- `docs/architecture/proposed/type-worlds-program.md` ownership paragraph

The added `codemod/contract/types.ts` diff is the two-line `RunCodemodOptions` contract comment that now states the implemented full-program behavior; I read the contract file in full and the final scoped runs typechecked its consumers.

## Verdict

No confirmed defect remains in the reviewed scope.

Four defect families were reproduced through the public codemod harness during review and repaired before this verdict:

- A newly created source outside every post-transform config root inherited its predicted program and was written. New and moved paths now require native post-root membership in `strictPostRootProgramIds`; the regression proves both refusal without writes and the included-root success case.
- With `preserveSymlinks`, the baseline dropped unchanged consumers reached through a workspace package alias. Baseline targets, containing programs, and reverse consumers now use authored physical identity while foreign `node_modules` and escaping symlinks remain on the native host.
- Selective per-source diagnostics missed an alias-only unchanged intermediate, a conditional export changed only by `resolution-mode`, and a newly added triple-slash path reference. The guard now selects affected programs by physical identity and runs one full native `getPreEmitDiagnostics(program)` verdict for each. Locationless native errors remain failures; only the reader-approved TS18002/TS18003 diagnostics of a program emptied by the filename overlay are removed at the compiler-program boundary.
- One config explicitly rooting the same test through canonical and in-repo symlink spellings was counted as two owners and falsely refused. Root ownership now deduplicates by program ID while the two-distinct-program overlap control still refuses.

## Verification

- Final scoped runs: `program-diagnostics.int.test.ts` 42/42 green at `reports/runs/test/codex-world-gate-integration-2835282-2026-09-08T12-20-28-558Z/test-report.json`; `policy-program-membership.test.ts` 11/11 green at `reports/runs/test/codex-world-gate-integration-2838416-2026-09-08T12-21-24-600Z/test-report.json`. Both reported no type errors.
- Six independent `/tmp` public-harness probes reproduced the failures before repair. Cold reruns refused the unowned create, the unchanged workspace consumer break, the narrowed alias-intermediate break, the conditional-export resolution-mode break, and the triple-slash reference break before apply; the same-program canonical-plus-alias root probe now applies, while the permanent distinct-program overlap control still refuses.
- The supplied TypeScript 6.0.2 native filename proof retained exact 5/5 virtual-versus-materialized root arrays. The reviewed adapter calls TypeScript's nine-argument `matchFiles`; repository diagnostics use TypeScript 6.0.3.
- The orchestrator separately reported the final read-only forms preview at exit 0. I did not run or count that as independent review evidence.
- `git diff --check` was clean for the requested files. I did not run another full-repository preview or any whole-tree gate.

The security-relevant assumption is that only source filenames and transformed source bytes are virtual. Authored tsconfig/package bytes, inheritance, project references, and foreign dependencies remain physical native inputs. No human security review is needed for the reviewed boundary.
