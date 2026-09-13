---
kind: review
status: active
updated: 2026-09-13
---

# World/type/config preservation: independent source audit

## Verdict and boundary

**One confirmed P2 defect: concrete compiler programs disappear from discovery when another config extends them.** Current checkout exposure is latent: all three extended configs are explicitly empty templates, and all 11 concrete programs remain discovered. A scratch native compiler reproduction confirms the defect; a green run over today's discovered roster cannot prove discovery completeness.

Audited baseline: `daebd7951f55a5f6110643cf5406af14de2e6395`, initially equal to local main, clean worktree `/home/inktomi/.codex/worktrees/15af/orbweaver`. Primary subsequently reported main at `141c1f73b`; this report does not claim to have audited that newer tree. No implementation, ledger, board, main, or running-stack edits. One report is the entire owned diff. No subagents, additional threads, heavy suites, or whole-tree native semantic run.

The preservation obligations come from `docs/history/type-worlds-program-2026-09-10.md`, `docs/design/gate-runtime-standardization.md`, and the successor table in `docs/history/gate-runtime-worked-cases-2026-09.md`. Historical green receipts in `v-world-gates-2026-09-12.md` are prior evidence, not this audit's executions. Q06 isolation and #2333 materializer remain held and untouched. Create-rooted callable/fact enforcement belongs to the primary's separate lane.

## W1: inheritance is incorrectly treated as proof of abstraction

**Source:** `tooling/src/verify/lib/policy-program-membership.ts:248`, particularly the candidate filter at line 256. `discoverProgramConfigs` removes every config appearing in the local `extends` target set unless it is separately referenced. Only afterward does `isExplicitTemplate` test whether a config really has explicitly empty roots. Extending a config does not establish that its parent is abstract: the child can override `files`, `include`, or compiler options.

**Live consumer:** `tooling/src/verify/ops/typecheck.ts:127` calls `readCompilerPrograms`; line 134 chooses runnable programs from that already-reduced population. The explicit-selection path at line 60 refuses the omitted parent as unknown. This is not just an inaccurate descriptive count: the parent never reaches execution. Shared compiler routing uses the same reader, so repair belongs in discovery, not an executor-only exception or a new manually maintained roster.

**Observed counterfactual, 2026-09-13:** scratch repository with four authored files:

```text
tsconfig.json       {"compilerOptions":{"strict":true,"noEmit":true,"types":[]},"files":["bad.ts"]}
bad.ts              export const bad: number = "wrong";
good.ts             export const good = 1;
tsconfig.child.json {"extends":"./tsconfig.json","files":["good.ts"]}
```

Before writing the child, `readCompilerPrograms` returns `tsconfig.json`. Afterward it returns only `tsconfig.child.json`. The following result was measured with the real installed TS7 compiler, not fabricated compiler output:

```text
before [ 'tsconfig.json' ]
after [ 'tsconfig.child.json' ]
native-parent code=1
bad.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
native-via-executor:
{"discovered":1,"requested":null,"skippedContainers":[],"programs":[{"config":"tsconfig.child.json","status":"passed","code":0,"stdout":"","stderr":"","timedOut":false}],"concurrency":1}
explicit-parent: typecheck: unknown compiler program "tsconfig.json"
```

Probe mechanics: imported the production reader and `executeTypecheckPrograms` through Node, created an OS-temp Git repository with `git -C <scratch> init --quiet --template=`, and passed the executor's supported runner callback a real `spawnSync(process.execPath, [<checkout>/node_modules/ts7/bin/tsc, '--project', <scratch-config>, '--incremental', 'false', '--pretty', 'false'])`. Compiler subprocess timeout 15 seconds; executor concurrency one. Both native invocations completed; whole probe took 0.91 seconds. Scratch directory was removed in `finally`. This proves the production selection/execution API loses the program; it is not a full CLI, wrapper, or repository verification run. An earlier recording-runner probe and independent `--showConfig` observation agreed; the later native execution is stronger evidence.

**Current exposure census:** independently parsed every authored matching `tsconfig*.json` from `readPolicyRepositoryInventory` with TypeScript's `readConfigFile` and `parseJsonConfigFileContent`, resolved local inheritance targets, and compared the production reader roster. Fourteen configs; the only three extended configs are `tsconfig.base.json`, `tsconfig.world-browser.json`, and `tsconfig.world-node.json`. Each has authored `files: []`, zero parsed files, and zero references. The remaining 11 are all discovered: seven package configs, `tooling/tsconfig.json`, `tsconfig.json`, `tsconfig.tests-dom.json`, and `tsconfig.tests-iso.json`. Therefore this audit does **not** assert that a current repository source file escapes typechecking through W1.

**Rival explanations refuted:** the parent is not empty (native `--showConfig` lists `./bad.ts`); the diagnostic is real (native TS2322); the child is valid (native code zero); the omission is triggered by adding inheritance (before/after reader observation); explicit selection does not recover it (production refusal). Project references are a separate relation and should not be required to rescue an independently runnable inherited config.

## Repair batch and proof owners

One cohesive compiler-discovery repair, after primary claim/ownership coordination:

1. `tooling/src/verify/lib/policy-program-membership.ts`: preserve every authored concrete program even when it is extended. Continue excluding explicit empty templates and preserving reference-only containers. Keep native parsing, containment, malformed-config refusal, and transitive config identity. Do not add a hardcoded program list or a second parser.
2. `tests/tooling/verify/lib/policy-program-membership.test.ts`: add the concrete-parent/overriding-child discriminator. Cover both `files` and `include` roots; a parent and child sharing a root but differing compiler options must remain distinct programs. Retain the existing empty-template, unmatched-include, declaration-only, and reference-container controls.
3. `tests/tooling/verify/ops/typecheck.int.test.ts`: permanent tiny native regression with parent-only TS2322 and passing child; require both programs to be selected, the parent to fail, and explicit parent selection to execute. This must fail against the unmodified reader first. Preserve the existing no-fail-fast and abnormal-exit tests.
4. `tests/tooling/verify/lib/program-routing.test.ts` and `.int.test.ts`: verify parent-owned source and inherited config changes retain the appropriate affected-program identities. Add only tests required by the changed selection behavior; keep existing shared-root/import-closure cases.

After focused suites pass, primary should rerun native ownership/parity and all-program typecheck on the integrated tree under the shared-host budget. This is the repair's composed proof floor, **owed**, not evidence produced by this report. The current all-11 green receipt reported by primary does not discharge the planted discovery case.

## Existing repairs and preserved distinctions

Source and test inspection supports the following narrower conclusions; none is a newly executed suite verdict:

| Boundary | Current implementation/proof inspected | Audit disposition |
| - | - | - |
| Native source diagnostics versus type assertions | `vitest.config.ts`, `verify/ops/scoped-test.ts`, `verify/ops/typecheck.ts`, `scripts/ts7.cjs`; scoped-test and typecheck tests | Both type projects retain `ignoreSourceErrors: true`; native source execution remains separate. Mixed-file selection unions native attributed projects and preserves explicit project choice. Do not reopen #2232/#2233 from old comments or old receipts. |
| World intent and generated native configs | `_shared/project-worlds.ts`, `test-kinds.ts`, `type-config-intent.ts`, `verify/ops/gen/type-configs.ts` and coupled tests | Shared suffix/world/ambient intent still feeds deterministic native config generation. Generator tests include fresh package/kind, helper worlds, NodeNext, DOM refusal, and complete-output freshness controls. No generator was run. |
| Actual roots, closures, and parity | `policy-program-membership.ts`, `program-routing.ts`, `tests-type-membership.ts` and coupled tests | Native roots, independent TS7 parity, ambient/library and triple-slash checks are distinct mechanisms. W1 is an upstream population omission; retaining downstream checks alone cannot repair it. |
| Executable config observations | Both `config-snapshot.ts` files, config-snapshot integration tests, `runner-config-path-liveness.ts`, `resource-config.ts` | Native Vitest/ESLint observations remain distinct from declared static Playwright evaluation. No claim of independently replayed real-root liveness. Materializer implementation excluded. |
| ESLint/Biome permissions | `eslint.config.js`, native ESLint operation/discovery, `config-grant-rows.ts`, `biome-grant-liveness.ts`, `tooling/biome.edit.jsonc` | Inspected current ESLint worktree/vendor/nested-script/helper policies and the native population reader. Biome's edit-hook project-domain reduction is explicit; do not construe it as whole-tree verification. Root Biome configuration was not fully audited; no global Biome verdict. |
| Mutation, runtime, and tool-specific populations | Vitest runtime/Stryker configs, `_shared/stryker-config.ts`, both Stryker configs, `knip.ts`, `jscpd.json`, `scripts/cpd.ts`, their named tests below | Distinct populations and native tool policy remain intentional. A mutation dry run is not score calibration. No mutation execution or score claim. |

The compiler defect is independent of the historical semantic gate-conversion queue. No new claim about exhaustive browser-contract proofs, all gate fixture preservation, policy proof conformance, or conversion readiness is made.

## Closed read manifest

Paths below are relative to the checkout; grouped prefixes are literal path expansion, not an assertion that an entire directory was read. These are full implementation/test reads used for this report. The manifest is deliberately closed: unlisted implementations are not included in a clean verdict.

- `tooling/src/_shared/`: `project-worlds.ts`, `test-kinds.ts`, `type-config-intent.ts`, `stryker-config.ts`.
- Root config/execution files: `vitest.config.ts`, `vitest.runtime.config.ts`, `vitest.stryker.config.ts`, `stryker.config.js`, `stryker.gate.config.js`, `knip.ts`, `jscpd.json`, `playwright.config.ts`, `playwright-ct.config.ts`, `eslint.config.js`, `scripts/cpd.ts`, `scripts/ts7.cjs`, `tooling/biome.edit.jsonc`.
- `tooling/src/verify/lib/`: `policy-program-membership.ts`, `policy-repo-inventory.ts`, `program-routing.ts`, `config-snapshot.ts`, `config-grant-rows.ts`, `registry.ts`, `registry-argv.ts`, `registry-triggers.ts`.
- `tooling/src/verify/ops/`: `typecheck.ts`, `scoped-test.ts`, `tests-type-membership.ts`, `tests-execution-membership.ts`, `config-snapshot.ts`, `resource-config.ts`, `eslint.ts`, `eslint-discovery.ts`, `gen/type-configs.ts`.
- `tooling/src/verify/gates/`: `runner-config-path-liveness.ts`, `biome-grant-liveness.ts`.
- `tests/tooling/_shared/`: `project-worlds.test.ts`, `test-kinds.test.ts`, `stryker-config.test.ts`.
- `tests/tooling/`: `vitest-stryker-lane-classification.test.ts`, `jscpd-config.test.ts`, `knip-workspace-policy.int.test.ts`.
- `tests/tooling/verify/lib/`: `policy-program-membership.test.ts`, `program-routing.test.ts`, `program-routing.int.test.ts`.
- `tests/tooling/verify/ops/`: `typecheck.int.test.ts`, `scoped-test.test.ts`, `config-snapshot.int.test.ts`, `tests-type-membership.test.ts`, `gen/type-configs.test.ts`.

Partial or excluded: `packages/client/vite.config.ts` was sampled, not fully read; Vite is not a promised runner-liveness surface. `biome.json`, deeper static-config evaluation, browser-contract semantic readers, codemod diagnostic internals, presence/mirror gates, and their complete test corpora are not included in an exhaustive review claim. No materializer or held-isolation audit. Generated config exposure was measured through native parsing rather than full textual review of every generated file. Some initial combined reads were truncated; full-read entries above were covered through subsequent bounded reads. No aggregate test-pass count is inferred from source inspection.

## Ledger and issue matching

Read-only lookup in `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` used `extended|extender|discovery|discoverProgramConfigs|parent program|runnable`, followed by `discoverProgramConfigs|extended|parent program|runnable|compiler.program`. The latter produced only an unrelated runner-delivery row. GitHub all-state issue searches used `"compiler" "extends"` (12 results), `"program discovery"` (one, #1863), and `"runnable" "extends"` (results bounded at 50). Titles included predecessor #1351, codemod #1887, and config-liveness #2021; none identifies the concrete-parent omission. This is a bounded duplicate lookup, not proof that no issue body or other ledger anywhere mentions it. Existing #2232/#2233 and #2323 selection repairs are separate.

## LEDGER ROWS (1 row)

Proposal only; primary owns recording, issue creation/claim, and lifecycle transitions.

| Subject | Source/receipt | Defect | Proposed classification | Repair batch |
| - | - | - | - | - |
| Compiler-program discovery W1 | `policy-program-membership.ts:248-269`; native scratch parent TS2322 while discovered child passes | An `extends` edge removes a concrete parent from discovery and explicit native execution | P2; new on this bounded lookup; latent in current config population | Shared reader plus permanent discovery, executor, and routing controls described above |

## Delivery and remaining verification

Only this report is authorized for commit. Dependency installation used `pnpm install --frozen-lockfile --ignore-scripts`; no lockfile changes. Verification consists of the scratch discovery/native compiler probes, independent 14-config exposure census, scoped documentation formatting check, and diff whitespace check. No existing behavioral suite was rerun. The #1584 standing scoped-commit exception applies; consolidated verification and catalog reconciliation remain primary-owned. Find the exact delivery commit with `git log -1 -- docs/reviews/gate-runtime/v-world-type-config-preservation-2026-09-13.md`, then inspect `git show --stat <sha>`; the final handoff supplies the immutable commit receipt.
