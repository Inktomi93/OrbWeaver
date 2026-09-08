---
kind: review
status: active
updated: 2026-09-08
---

# World-scope checkpoint review

Review target: the uncommitted #1859 phase-1, #1878, and #1880 composition over `7980a3bcd`, limited to the closed manifest in the review brief plus the approved coupled-site corrections in `registry-manual.ts` and `UNIFIED-VERIFICATION-DESIGN.md`. The codemod lane's `tooling/package.json`, lockfile, and codemod files were excluded. Touched files were read in full; coupled runner, selection, process, law, and test files were inspected only where the changed behavior reaches them.

## Findings

No open findings remain.

## Findings resolved during review

### Medium — folder runtime inventory included deleted tracked files

`tooling/src/verify/lib/selection.ts:91` — `authoredPathsUnder` treats every tracked index entry as a current runtime subject, so an unstaged deletion under `verify --scope <folder>` is forwarded to the new `--related` source-file door and turns a valid folder scope into misuse.

Failure scenario: a folder contains `keep.ts` plus a committed `gone.ts` deleted in the working tree. `git ls-files` still returns both; `vitestScopedArgv` emits `pnpm test:scoped --related gone.ts keep.ts`; `runNodeScoped` refuses `gone.ts` with exit 3 before testing the surviving source.

Evidence produced this session: a lane-unique `/tmp` Git repository committed `tooling/src/x/{keep,gone}.ts`, deleted `gone.ts`, then called the real `resolveSelection` and `vitestScopedArgv`. Output was `runtimeSubjects:["tooling/src/x/gone.ts","tooling/src/x/keep.ts"]` and the emitted argv contained both paths.

Resolution verified: `authoredPathsUnder` now routes the Git inventory through `classifyExplicitPaths(...).existingPaths`, retaining deleted identities only in the separate change-aware `paths` view. The scratch test now includes an unstaged tracked deletion, a survivor, an untracked file, and an ignored file; the focused real test passed 1/1 with 61 siblings skipped.

### Medium — the new depcruise front door had no failing-exit proof

`scripts/depcruise.mjs:12` and `tests/tooling/dependency-cruiser-worlds.int.test.ts:47` — the wrapper is the `pnpm depcruise` gate door, but its only integration invocation uses dependency-cruiser's JSON report mode, which exits zero even when the parsed report contains error violations.

Failure scenario: `process.exitCode = result.status` is deleted or hardcoded to zero. The native 71-rule proof still passes because it calls `node_modules/.bin/depcruise` directly, while the wrapper integration still passes because JSON mode returns zero. `pnpm depcruise` can then print a boundary violation and exit clean.

Evidence produced this session: `rg -n "depcruise\\.mjs|scripts/depcruise" tests tooling` found one wrapper call, at `dependency-cruiser-worlds.int.test.ts:47`; that call asserts status 0 under `--output-type json`. The 71-rule test's `runCruise` invokes the native binary directly. The current wrapper source does propagate `status ?? EXIT.toolError`, but no test exercises its nonzero path.

Resolution verified: the helper-world scratch test now invokes both the native binary and the wrapper in gating `err-long` mode, requires the wrapper's nonzero status to equal the native status, and requires the world-rule diagnostic. The installed runner returns 4 for the four planted errors, so the proof compares the native contract rather than hardcoding 1. The JSON-mode call remains for exact violation and denominator comparison. The focused real test passed 1/1.

### Low — authoritative list/design text described the retired scoped-test behavior

`tooling/src/verify/lib/registry-manual.ts:43` and `docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md:381` — the user-visible `verify --list` row says every path with zero collected tests is refused, while related source inputs now deliberately allow zero dependents; the design doc still says changed scope uses a fixed unit/integration project subset with serial and contract deferred, while the registry now delegates project ownership to Vitest and has separate Git, direct-test, related-source, folder, and package modes.

Failure scenario: an operator reads `pnpm verify --list` or the verification design to understand why `--related source.ts` exited zero with no tests. The authoritative text says that outcome is impossible and instructs the retired project population, making a correct derived-empty result look like a broken gate.

Evidence produced this session: `pnpm verify --list` printed the stale manual reason verbatim; direct reads located the copied text at `registry-manual.ts:43` and the obsolete population at `UNIFIED-VERIFICATION-DESIGN.md:381-388`.

Resolution verified: the manual registry row now distinguishes direct-test collection refusal from related-source derived emptiness and states the files-before-flags grammar. The verification design now records native project ownership; Git, direct-test, source/mixed, folder, and package modes; asserted-versus-derived empty behavior; the conservative browser-test type floor; and the private CT cache door. `pnpm verify --list` printed the corrected manual reason, and the scoped docs check passed.

### High — direct `--related` directory produced a false clean

`tooling/src/verify/ops/scoped-test.ts:190` — the first implementation accepted an existing directory as a related source, skipped the collection/barren preflight, and passed it unchanged to Vitest even though Vitest's related graph compares exact module IDs.

Failure reproduced: `pnpm test:scoped --related tooling/src/verify/lib` ran for 123.4 seconds, printed `No test files found, exiting with code 0`, and exited 0 despite the directory containing many sources with tooling tests.

Resolution verified: `runNodeScoped` now rejects positional related directories with exit 3 and points the operator to `verify --scope <folder>` or explicit source files. The real-wrapper regression passed 1/1, then passed again in the two-case repaired selection run.

### Medium — a valid path-valued Vitest flag was mistaken for a related source

`tooling/src/verify/ops/scoped-test.ts:198` — the initial directory repair classified every path-shaped token as a source operand, including the value of a valid forwarded runner flag.

Failure reproduced: installed Vitest 4.1.11 documents `--dir <path>` for `vitest related`; `pnpm test:scoped --related tooling/src/verify/lib/program-routing.ts --dir tests/tooling/verify/lib` exited 3 and accused the `--dir` value of being a source directory.

Resolution verified: related source operands are now the documented positional prefix before the first runner flag; the flag tail is forwarded unchanged. The targeted real-wrapper pair (`positional directory refusal` plus `--dir` forwarding) passed 2/2 in 19.03 seconds.

### High — the isolated cache tripwire could not exercise a warm cache

`tests/tooling/dependency-cruiser.int.test.ts:335` — the first scratch rewrite wrote every fixture before its only cruise, so its named result-cache tripwire was necessarily a cold run and would remain green if a blind cache returned.

Evidence: `rg -n "runCruise\\(|writeAllFixtures\\(|cache"` showed `writeAllFixtures()` followed by the only `runCruise()` invocation, then the assertion. No file was added after cache warm-up.

Resolution verified: the suite now cruises the same scratch root, adds only `packages/kit/src/__dc_cache_fresh_node.ts` importing `node:fs`, cruises again, and requires exactly that file under `kit-no-node-builtins`. Dependency-cruiser 18.1.0 also saw the fresh file with the historical content-cache option enabled, so the old upstream defect no longer reproduces; the source comment now states historical regression-guard scope. The final paired depcruise suites passed 72/72.

### Medium — the helper no-orphans restriction had no permissive proof

`.dependency-cruiser.cjs:773` — the new `no-orphans.from.path` restriction protects helper modules whose CT consumers are outside the cruise, but the first test set never asserted that helper orphans remain silent. Removing the restriction changed both wrapper and direct JSON reports equally and left the world-rule-only assertion unchanged.

Resolution verified: the world fixture now plants `tests/support/node/ct-consumed.ts`, consumed only by a CT file deliberately outside the cruise inputs, and asserts zero `no-orphans` violations while the main 71-rule corpus retains its package-orphan positive control. The final paired depcruise suites passed 72/72.

## Verified clean

- Read `.claude/agent-doctrine.md`, the constitution, the D-ledger redirect, the active enforcement catalog, `Core-0` §§7/9, `Core-Tooling-Law` §§2/4/9, `GATE-AUTHORING.md`, and `Spine-Testing.md` before judgment.
- Read every file in the closed review manifest in full. Read the coupled `scoped-run-paths.ts`, `repo-paths.ts`, `proc.ts`, `scoped.ts`, `registry-manual.ts`, installed Vitest VCS/related implementation, and the relevant verification design sections.
- Structural sweeps used `ast-grep` over 3,274 TypeScript and 600 TSX files for the new selection/world helper call shapes; literal sweeps checked every wrapper and manual-description reference.
- `pnpm depcruise`: clean, 4,706 modules and 27,067 dependencies cruised.
- Five-file world/registry run: 81/81 tests passed, including the 71-rule native dependency-cruiser corpus.
- `depcruise-grant-liveness`: 18/18 tests passed, including the real config denominator.
- Final isolated dependency-cruiser pair: 72/72 tests passed.
- Repaired related-directory/flag regressions: 2/2 tests passed through the real wrapper.
- Repaired folder deletion inventory: focused `run.int.test.ts` selection proof passed 1/1 with 61 skipped.
- Repaired wrapper exit propagation: focused helper-world wrapper proof passed 1/1 and matched the native nonzero status.
- `pnpm verify --list` confirmed `types:graph` and `structure:full` at the changed tier and native scoped node-test registration.
- `git diff --check` passed on the closed manifest at each repaired checkpoint.
- `pnpm check` was not run: lane law bans whole-tree gates in a lane, and the brief records inherited #1584 mixed-loader structure diagnostics. No rendered surface changed.

## Unconfirmed, low priority

None.

## Issue summary

World-scope checkpoint review found seven confirmed issues, all repaired and reverified during review; zero findings remain open. The original severity ceiling was high. Full evidence and verification receipts: `docs/reviews/stickler/2026-09-08-world-scope-checkpoint.md`.
