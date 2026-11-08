---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: testing
plan: test-foundation
---

# Time a mutation run by phase before any custom checker work

## What

Measure how much of a pnpm test:mutation run is checker time and how much is test time, on the admin guard file and one client file. A probe of the 7.1 language server held one file open and pulled diagnostics after each full-text change: about 10 to 30 ms per check after a cold open under one second, about 450 MiB resident. That path, or the sync API snapshot overlay in tooling/src/unwired/native.ts, could replace the checker. Diagnostics cover the open file only, so compare its verdicts with the classic checker, including a mutant that breaks a caller in another file. Grouping is not needed at this speed.

## Why

Other projects' native checker gains come from small programs, and ours was slower on the server world, so a build needs a measured reason.

## Done when

The split is recorded for both files, with a build or drop ruling for the checker plugin.

## Evidence

Ruling: build. The checker is the critical path of both runs, and a file-scoped 7.1 check with a declaration-emit compare agrees with the classic checker on every mutant, cross-file breaks included.

Phase split from `pnpm test:mutation` with a scratch timing reporter and a process sampler, one run each, started under a one-minute load near 16 on a 24-core box:

| Phase | `packages/server/src/domain/admin/guard.ts` | `packages/client/src/features/preset/lib/template-rows.ts` |
| - | - | - |
| Wall time | 276 s | 797 s |
| Instrument and slot | 7 s | 8 s |
| Checker init and sandbox setup | 85 s; checker init alone 27 to 44 s | 67 s; checker init alone 57 s |
| Initial test run | 17 s | 9 s |
| Mutant phase, checks and test runs interleaved | 162 s; summed checks 108 to 150 s; test forks busy 34 s | 711 s; summed checks 725 s; test forks finished 200 s before the last check |
| Reporting | 1 s | 1 s |
| Checker process peak RSS | 4.6 GiB | 9.3 GiB |

The checker process lives until the last mutant verdict in both runs, so checking, not testing, sets the run length. The classic checker is the TS6 watch builder: about 2.3 to 3.4 s per mutant on these worlds.

Verdicts, judged outside Stryker over the same mutants plus one hand mutant per file that breaks only a caller (an unexported or renamed export):

| Path | Per mutant | Agrees with classic on Stryker's mutants | Catches the caller-only break |
| - | - | - | - |
| Classic TS6 checker | 2.3 to 3.4 s | reference | yes |
| 7.1 `tsc --lsp`, file held open, pull diagnostics | 10 to 106 ms | all | no |
| 7.1 `tsc --lsp`, every importer open | 3.2 to 4.7 s | all | yes |
| 7.1 sync API layer snapshot, file diagnostics | 96 to 212 ms | all | no |
| 7.1 sync API layer snapshot, file plus importers | 3.6 to 5.0 s | all | yes |
| 7.1 layer snapshot, file diagnostics plus `getDeclarationEmit` compare | 102 to 232 ms | all | yes, by the changed declaration |

The overlay must apply the classic checker's own option overrides (`allowUnreachableCode` on, `noUnusedLocals` and `noUnusedParameters` off). Without them it fails emptied function bodies that the classic checker passes.

Plugin shape, not yet built: a Stryker checker plugin on `@typescript/native/sync`. Open one world per run with the classic overrides layered on its tsconfig. Per mutant, create a layer snapshot, read the file's syntactic and semantic errors, then compare its declaration emit with the base. Run importer diagnostics only when the declaration changed, which was rare in both files. The API process stays under 3 GiB on these worlds, against 4.6 and 9.3 GiB for the classic checker process.

Stryker's own `experimentalNativePreview` path is not a shortcut. It imports `@typescript/native/unstable/sync`, which the 7.1 pin does not export. A port touches `updateSnapshot` (private in 7.1, replaced by `createSnapshot` and `Snapshot.update`), `openProject` (now `openProjects`), `project.rootFiles` (now `parsedCommandLine.fileNames`) and its filesystem callbacks (in 7.1 an `undefined` read means a missing file, not fall back to disk). It also checks the whole program per mutant, which took 8.8 to 10.7 s on these worlds, slower than the classic checker. A `pnpm patch` would rewrite its compiler to the shape above inside `dist` and carry it across every Stryker bump, so build it as a tooling plugin instead.

The measurement scripts stayed in the lane scratchpad; the cb-mut lane report holds their raw output.
