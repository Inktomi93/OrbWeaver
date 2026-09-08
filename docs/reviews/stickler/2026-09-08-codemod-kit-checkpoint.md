---
kind: review
status: active
updated: 2026-09-08
---

# Codemod kit checkpoint review

Review target: the uncommitted #1860 codemod-only manifest over `7980a3bcd`, plus the approved repair modules `apply-project.ts` and `program-consumers.ts`. The world/scope work and unrelated concurrent edits were excluded. No real repository move was executed; every reproduction used an auto-removed `/tmp` Git fixture and the public codemod API.

## Findings

No open findings remain.

## Findings resolved during review

### High — a public custom deletion bypassed unchanged-consumer diagnostics

`tooling/src/codemod/lib/program-diagnostics.ts:115` — `diagnosticScope` seeds the reverse closure only from snapshot paths that still have a current `SourceFile`, so a declared source deleted by a public custom `Plan` contributes no seed and its unchanged importers are never checked.

Failure scenario: `tests/consumer.ts` imports `tests/api.ts`; a custom plan declares `api.ts` and calls `sf.delete()`. Preview integrity accepts the declared deletion, diagnostics count zero, apply deletes the module, and the unchanged consumer remains broken. The `deleteFiles` helper happens to pre-snapshot consumers, but `Plan.transform` is public and the harness contract claims unchanged-consumer coverage itself.

Evidence produced this session: `/tmp/codex-stickler-custom-delete-false-clean.log`. The real public `runCodemod` harness ran with the required 16 GiB heap floor, `forceApply:true`, and diagnostics enabled. It exited 0 with `diagnosticErrors:0`, `apiExists:false`, and the surviving consumer still importing `./api.ts`. The first 6 GiB probe correctly hit the heap-floor refusal and was discarded.

Resolution verified: `runCodemod` now lazily builds a native pre-transform consumer baseline before the first plan transform and records every declaration's transitive reverse impact in a diagnostics-only ledger. Tombstones retain those paths after their `SourceFile` disappears. The public custom-plan deletion regression refuses and leaves both disk files unchanged; the final focused diagnostics/path run passed 28/28.

### High — an affected dependency was not diagnosed in a containing consumer program

`tooling/src/codemod/lib/program-diagnostics.ts:135` and `tooling/src/codemod/lib/program-diagnostics.ts:241` — closure members are assigned independently to their root-owner programs, then diagnostics are requested only for those assigned target files. A changed dependency imported into another authored program is compiled there, but its own diagnostics are never requested in that containing program.

Failure scenario: the DOM-libbed UI program owns `packages/ui/src/view.ts`; a DOM-less root program owns `tests/consumer.ts`, which imports the view. A plan adds `document.title` to the view. It is valid in UI's owner program and invalid in the root program, but the root-program pass asks only for the consumer's diagnostics, so TS2584 in the imported view is missed and apply writes code that fails the root graph.

Evidence produced this session: `/tmp/codex-stickler-cross-program-false-clean.log`. The public apply exited 0, reported `diagnosticErrors:0`, and wrote `document.title` into the imported UI file. Both authored configs and the unchanged reverse consumer were present in the fixture.

Resolution verified: every authored native program is constructed once with the transformed physical overlay, and diagnostic targets are the intersection of its actual `program.getSourceFiles()` closure with the affected set. The cross-program DOM-less consumer fixture now refuses TS2584 in the imported UI source and leaves disk unchanged.

### High — `replaceGlobs` could hide authored consumers from the diagnostic guard

`tooling/src/codemod/lib/project.ts:47` and `tooling/src/codemod/lib/program-diagnostics.ts:115` — the public edit-project narrowing also defines the only reverse-consumer graph, so an authored consumer outside `replaceGlobs` is invisible even though `readCompilerPrograms` returns the full authored program and its root names.

Failure scenario: `tsconfig.json` roots `tests/**/*.ts` and `app/**/*.ts`; the codemod loads only `tests/**/*.ts`; `app/consumer.ts` imports `tests/api.ts`. Changing the API export from number to string should break the consumer, but the thin ts-morph project cannot discover it, diagnostics request only the API file, and apply succeeds.

Evidence produced this session: `/tmp/codex-stickler-replace-globs-false-clean.log`. The public apply exited 0 with `diagnosticErrors:0`, wrote the string export, and left the excluded authored consumer's numeric contract unchanged.

Resolution verified: the pre-transform dependency census is built from `readCompilerPrograms` and native TypeScript Programs, independently of the edit project's globs. The test with an API-only edit project and excluded authored consumer now refuses and leaves both files unchanged.

### High — lexical destination uniqueness permitted physical symlink aliases to destroy a mover

`tooling/src/codemod/lib/plans.ts:129` and `tooling/src/codemod/lib/files.ts:234` — `absolutePath` verifies physical containment but deliberately returns lexical identity, while `moveFiles` checks destination uniqueness only with those lexical strings. Two different in-repo symlink spellings of the same unborn physical destination therefore pass validation.

Failure scenario: `tests/alias` is an in-repo symlink to `tests/inside`; one batch moves `a.ts` to `inside/out.ts` and `b.ts` to `alias/out.ts`. Both lexical destinations look unique. Save writes one physical file and deletes both sources, losing one source permanently while reporting two created files.

Evidence produced this session: `/tmp/codex-stickler-physical-alias-collision.log`. The public apply exited 0, reported two creations and two deletions, removed both `a.ts` and `b.ts`, and left one `inside/out.ts` containing only A's bytes.

Resolution verified: `physicalPathIdentity` is now the one realpath-projected resolver for containment, mutation collisions, and compiler overlay keys. Before diagnostics, preview, or save, the harness checks the actual changed-path set for multiple lexical names of one physical file. Same-batch move, cross-plan move/copy/create, repeated lexical edit, and unchanged alias-snapshot controls passed; the final path/diagnostics run passed 28/28.

### High — module augmentations were omitted from global-effect expansion

`tooling/src/codemod/lib/program-consumers.ts:92` — `hasGlobalEffect` expands declaration files, script files, and `declare global`, but an external-module `declare module "specifier"` augmentation is also program-wide and is not a reverse importer of every file whose augmented type it changes.

Failure scenario: `augment.ts` imports `vendor.ts` and augments `Thing` with property `x`; `consumer.ts` imports only `vendor.ts` and reads `Thing.x`. A plan changes the augmentation to property `y`. The consumer has no module edge to `augment.ts`, so the affected-set intersection checks only the augmentation file and apply writes a program that fails on the untouched consumer.

Evidence produced this session: `/tmp/codex-stickler-module-augmentation-false-clean.log`. The corrected extensionless baseline was compiler-clean; public apply with diagnostics enabled exited 0, reported `diagnosticErrors:0`, wrote `x`→`y`, and left the consumer reading `x`. An earlier fixture used explicit `.ts` imports without enabling them; it correctly refused on TS5097 and was replaced rather than misreported as evidence.

Resolution verified: any TypeScript `ModuleDeclaration` in an external module now triggers the conservative program-wide path, while declaration files and script files retain the same treatment. Both a directly changed augmentation and an unchanged augmentation reached through a changed ordinary API now expand their containing program and catch the unrelated vendor consumer.

### High — sparse compiler roots hid import-only intermediates from the pre-transform census

`tooling/src/codemod/lib/program-consumers.ts:139` — the first repaired census iterated only `commandLine.fileNames`, so an authored module admitted solely through an import was not scanned for its own imports. With `replaceGlobs` also excluding it, a multi-hop reverse edge disappeared.

Failure scenario: a package program roots only `entry.ts`; `entry.ts` imports `middle.ts`, which imports `api.ts`; the edit project loads only `api.ts`. Changing API's number export to string breaks the unchanged middle/entry chain, but no `api → middle` edge exists in the census and apply writes the break.

Evidence produced this session: `/tmp/codex-stickler-sparse-root-chain-false-clean.log`. The public apply exited 0 with `diagnosticErrors:0`, wrote the string export, and left the hidden middle's numeric contract unchanged.

Resolution verified: each pre-transform native TypeScript Program now scans its actual `program.getSourceFiles()` authored closure, uses that Program's usage-location mode for module resolution, and adds triple-slash path references to the same reverse graph. The sparse `files:[entry]` multi-hop fixture with an API-only edit project now refuses and preserves all disk bytes.

## Verified clean

- Read every TypeScript/JSON source and test file in the closed manifest in full, plus the codemod public index/kit, project/error helpers, `#verify` compiler-program contract and reader, and structural call sites.
- The 14,940-line lockfile was not read line-by-line. Its exact three-line importer delta, the tooling importer, the catalog pin, and the resolved `typescript@6.0.3` package graph were inspected; unrelated lockfile regions were excluded.
- `ast-grep` structural sweeps covered 3,317 TypeScript files and 600 TSX files for `moveFiles`, `runCodemod`, public custom plans, deletion calls, and the new diagnostic entry point.
- The corrected batch mover covers import, export, dynamic-import, import-type, explicit `.ts`/`.tsx`/`.js`, extensionless, same-directory, split-directory, moving-owner, same-shape decoy, and invalid graph controls. No additional move-identity defect was confirmed.
- Physical containment correctly refuses lexical escapes, external directory/file symlinks, dangling symlinks, and distinct changed paths that alias one physical destination, while admitting a single in-root symlink identity.
- Apply parent topology is fully preflighted before directory creation; failure cleanup removes only run-owned empty directories. Low-level `saveSync` remains explicitly non-transactional, as the brief states.
- The supplied benchmark evidence was inspected rather than rerun: 48 movers, 960 importers, 1,008 files; exact-HEAD transform/total 12,680/12,823 ms; final native consumer census plus diagnostics 1,164/1,643 ms, wrong outputs zero.
- The supplied final authority-suite evidence was 70/70. A cold focused run of the final physical-path and compiler-diagnostics suites passed 28/28 with no type errors. Broad gates and the historical unsafe fixtures were not rerun, per the brief.

## Unconfirmed, low priority

None.

## Issue summary

Codemod kit checkpoint review confirmed six high-severity defects, all repaired and reverified; zero findings remain open. Five were diagnostic false-cleans (custom deletion tombstones, cross-program dependency diagnostics, consumers hidden by `replaceGlobs`, module augmentations omitted from global expansion, and sparse-root import-only intermediates), and one was a physical symlink-alias collision that deleted two sources into one destination. No real repository move was run. Full evidence and remediation detail: `docs/reviews/stickler/2026-09-08-codemod-kit-checkpoint.md`.
