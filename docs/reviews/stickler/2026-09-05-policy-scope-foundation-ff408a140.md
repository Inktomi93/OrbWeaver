---
kind: review
status: active
updated: 2026-09-05
---

# Stickler review — final policy-scope foundation (`ff408a140`)

## Findings

### HIGH — `changed` is empty for committed, unpushed work on the main checkout

**File:** `tooling/src/verify/lib/policy-repo-inventory.ts:17`, `:227-235`, `:284-286`

The resolver prefers `main` before `origin/main`. When the current checkout itself is on `main`, `git merge-base HEAD main` is `HEAD`, so every committed change that has not reached `origin/main` disappears from `semanticPaths`. A normal sequence — commit on local main, then run the changed policy before pushing — therefore produces an empty scope and lets every scoped consumer skip the exact commit being checked.

**Reproduction:** `pnpm exec tsx reports/stickler/scratch/policy-scope-adversarial.ts` created a repository whose local `main` was one commit ahead of `origin/main`. `git diff --name-status origin/main` returned `A src/committed.ts`; the resolver selected `{ ref: "main", commit: <HEAD> }` and returned `semanticPaths: []`.

**Why this is a law violation:** `docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md` §3.2 defines the branch comparison against `origin/main` and says an unknown precondition must run, never skip. The existing directly coupled helper states the same ordering and rationale at `tooling/src/verify/lib/repo-paths.ts:76-86` (`origin/main` first, local `main` fallback). This implementation reverses that fail-safe contract.

### HIGH — modified TypeScript configs are assigned to zero compiler programs

**Files:** `tooling/src/verify/lib/policy-program-membership.ts:101-123`, `:147-187`, `:213-228`; `tooling/src/verify/lib/policy-scope.ts:264-267`, `:297-304`

Program membership contains only `ParsedCommandLine.fileNames`. Neither a program's own `tsconfig*.json` nor any config it consumes through `extends` is a compiler source file, so `resolvePolicyPathOwnership` labels every current config as `outside-compiler-programs`. File/changed scopes then return no `requestedProgramIds`. Editing a leaf config, an inherited base config (including one reached through an `extends` array), or a references-only solution config can therefore skip every type program whose behavior the edit changed.

**Reproduction:** the adversarial script built two referenced projects, a zero-local-file solution config, and a leaf config extending two local bases. File scopes for `configs/tsconfig.base-a.json`, `packages/a/tsconfig.json`, and `tsconfig.solution.json` each returned `requestedProgramIds: []` and `reason: "outside-compiler-programs"`. The same probe against this checkout returned an empty requested-program set for both `tooling/tsconfig.json` and `tsconfig.base.json`.

**Why this is a law violation:** `docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md` §2.1-§2.2 and §3.4 require scoped typechecking to run the owning programs rather than file-scoped tsc. A config is an input to those programs even though it is absent from `fileNames`; deriving ownership exclusively from source membership creates the false green that the scope runtime exists to prevent.

### HIGH — an untracked replacement at a deleted or renamed source path is discarded

**File:** `tooling/src/verify/lib/policy-repo-inventory.ts:284-301`

The untracked merge uses a `known` set keyed only by path. If Git reports a tracked path as deleted and a current untracked file now exists at that same authored identity, the deletion makes the path "known" and suppresses the untracked `added` row. The returned manifest says the path is deleted and removes it from `currentPaths` even though a current authored file is present.

**Reproduction:** the adversarial script ran `git mv src/original.ts src/renamed.ts`, then created a new untracked `src/original.ts`. Git returned `R100 src/original.ts src/renamed.ts` and `git ls-files --others --exclude-standard` returned `src/original.ts`. The resolver returned only the deleted old row and renamed target; `currentPaths` contained only `src/renamed.ts`. The replacement source was absent from every current-file gate view.

**Consequence:** this is a direct silent under-scan for Biome, ESLint, structure passes, and any policy reading `currentPaths`. The conservative deleted-row program ownership does not repair the missing current file.

### HIGH — Git-authored symlink identities are canonicalized away or omitted

**Files:** `tooling/src/verify/lib/policy-repo-inventory.ts:75-123`; `tooling/src/verify/lib/policy-program-membership.ts:101-116`

Inventory enumeration runs every Git path through `realpathSync` and returns the target's repository-relative path. File symlink aliases collapse onto the target; multiple aliases deduplicate; directory symlinks are dropped because the target is not `stat().isFile()`; explicit file scope rejects an alias because it resolves to a different identity. Compiler-source symlinks are canonicalized a second time, so program membership also loses authored aliases. Git is nominally the authored-identity authority, but the returned manifest contains target identities instead.

**Reproduction:** the adversarial script committed two distinct `src/alias-*.ts` symlinks to one internal target plus a tracked directory symlink. `git ls-files` returned all three aliases. Whole scope omitted all three and reported only the target; the compiler program likewise listed only the target; file scope for `src/alias-a.ts` threw `resolves to a different repository identity`. On this real checkout, `git ls-files -s` identifies `.agents/skills`, `.codex/agent-doctrine.md`, and `.codex/hooks` as mode `120000`; whole scope omitted all three.

**Consequence:** a whole-repository policy is not whole, duplicate symlink aliases are unobservable, and a policy intended to police or report authored symlinks cannot see the objects it governs. Containment and target validity can be checked through `realpath` without replacing the Git-authored identity in the manifest.

### LOW — equivalent malformed requests produce insertion-order-dependent diagnostics

**File:** `tooling/src/verify/lib/policy-scope.ts:53-57`

`exactKeys` reports the first unknown key in `Object.keys` insertion order. Equivalent invalid objects with the same unknown-key set therefore produce different error text depending only on construction order, violating the runtime's deterministic-diagnostics expectation.

**Reproduction:** the adversarial script passed `{ kind: "whole", zebra: true, alpha: true }` and the same properties in reverse order. The messages were respectively `unknown property "zebra"` and `unknown property "alpha"`.

**Consequence:** equivalent bad requests produce different snapshots/artifacts and error attribution. Sorting the unknown keys before selecting one, or reporting the complete sorted set, makes the refusal stable.

## Verified clean

- Reviewed commit `ff408a140c7a7f1d0bc4d6bcd9e330c4536662a2` at exact branch tip `codex/gate-policy-scope`; `git show --stat` reports five added files and 1,293 inserted lines. The starting worktree had no tracked changes.
- Read all five touched files in full: `tests/tooling/verify/lib/policy-scope.test.ts`, `tooling/src/verify/contract/policy-scope.ts`, `tooling/src/verify/lib/policy-program-membership.ts`, `tooling/src/verify/lib/policy-repo-inventory.ts`, and `tooling/src/verify/lib/policy-scope.ts`.
- Read the directly coupled current contracts and seams in full: `tooling/src/verify/lib/repo-paths.ts`, `tooling/src/verify/contract/selection.ts`, `tooling/src/verify/lib/selection.ts`, `tooling/src/verify/index.ts`, and the subprocess behavior used here in `tooling/src/_shared/proc.ts`. Structural call-site sweeps (`ast-grep` for `resolvePolicyScope(...)` in both `ts` and `tsx`, with scan receipts) scanned 3,042 TS and 588 TSX files; the only live calls in this commit are the new focused test, consistent with this being a foundation commit rather than the integration commit.
- Read `.claude/agent-doctrine.md`, the constitution, the master ledger redirect, `Core-0` §7-§9, `Core-Tooling-Law.md`, `UNIFIED-VERIFICATION-DESIGN.md`, `GATE-AUTHORING.md`, `Spine-Testing.md`, the active `docs/design/gate-runtime-standardization.md`, issue #1584's current body, and the applicable active-enforcement registry material before judging the implementation.
- `pnpm test:scoped tests/tooling/verify/lib/policy-scope.test.ts --maxWorkers=4` passed all 11 tests and its typecheck in 3.69 seconds. The suite correctly covers the six-kind vocabulary, ordinary file/folder/package/tooling/project/whole selection, invalid explicit paths, root escapes, add/modify/delete/rename/untracked changes, an empty clean change set, the missing-main fallback, recursive project references, malformed/unresolved/empty configs, Git failure, and the real tooling workspace.
- `pnpm exec biome check <the five touched files>` passed all five files; `git show --check --format= ff408a140...` returned clean.
- `pnpm exec tsx reports/stickler/scratch/policy-scope-adversarial.ts` also verified these behaviors: modified/type-changed and conflicted current files resolve as `modified`; an exact copy is treated as an added target and remains in the current scan while its unchanged source is not added; deleted `.md`, `.json`, and binary/resource paths receive every available program with `deleted-conservative-all-programs`; ignored/un-authored configs refuse; `extends` arrays parse; a references-only config with zero local files retains its referenced graph; malformed and duplicate `pnpm list` outputs fail loudly; caller request mutation does not alias the resolver's request snapshot; mutating one returned result does not affect a later resolution; narrowed manifests are sorted; whole scope uses `requestedPaths: null` while narrowed empty changed scope uses `[]`.
- Nested folder selection, nested workspace-package selection, and explicit recursive project selection behaved as asserted. The root workspace package currently resolves to the same authored set as whole scope because its package path is `.`; I found no source-law statement that requires excluding nested workspaces from that particular root selection, so I did not classify the observed breadth as a defect.

## Explicit exclusions

- Per the review charge, I did not run `pnpm check`, `pnpm check:structure`, the full tooling test lane, dependency-cruiser, knip, CT, e2e, or any rendered probe. This foundation has no user-visible surface.
- I did not review later integration commits or speculate about consumers that are absent at this commit. The findings above are defects in the returned scope manifest itself and reproduce without a consumer.
- I did not mutate production source, tests, configuration, or law. The only non-report file written is the gitignored adversarial script under `reports/stickler/scratch/`; it creates and removes isolated temporary repositories.

## Unconfirmed, low priority

None.

## Issue summary

Cold review of policy-scope foundation commit `ff408a140` confirmed 5 findings (severity ceiling HIGH): committed unpushed main changes resolve empty, modified tsconfig/extends inputs select no programs, an untracked replacement at a deleted/renamed path is dropped, internal symlink identities collapse or disappear, and malformed-request diagnostics depend on property insertion order. Focused tests remain green because they do not exercise these cases. Full report: `docs/reviews/stickler/2026-09-05-policy-scope-foundation-ff408a140.md`.
