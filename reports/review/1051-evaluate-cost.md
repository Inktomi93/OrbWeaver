# caught-failure-ownership focused-run evaluate cost (1051, refs 965)

Lane cb-1051-cost, branch `wt/agent-a9106f281b14c346b`, parent main `990b97f107`. The 1070 commit `9607a58835` sits between main and the 1051 commit.

## Outcome

Three fixes, all inside one owned read or decode, with no cache that outlives its call or lease:

1. **Repeated physical-identity resolution** in the compiler-program graph read. This was the single-file hot path.
2. **Quadratic sibling-key check** in the invocation fact-graph decoder. This was the 9-file wall. It is the 1016 sibling: repeated decode work.
3. **A full span computed only for its file** on every replayed read.

| Scope | Before (main source) | After (1051 fixes) |
| - | - | - |
| single file, cold | evaluate 88.3 s / 109.2 s, wall 132.5 / 147.7 s | evaluate 50.8 s, wall 71.9 s |
| single file, warm | evaluate 65.2 s, wall 96.6 s | evaluate 27.1 s, wall 46.0 s |
| 9 kit files, warm | no verdict at 900 s (exit 124) | completes: evaluate 276.2 s, wall 304.2 s |
| 9 kit files, cold | no verdict at 900 s | no verdict at 900 s (worker extraction is 5 min under load) |
| 9 kit files, warm, with 1070, load about 40 | — | completes: evaluate 539.3 s, wall 587.8 s, CLI 10,417,312 KiB, same verdict |

Load at each run: the before single-file runs were at about 18 to 25. The after single-file runs were at about 17 to 22. The warm 9-file after run was at about 17. The 1070 runs were at 40 to 53, and their single-file warm evaluate was 75.8 s with the same verdict, which is load and not 1070.

The verdict is identical wherever both sides produced one:
- Single file: `raw 6 = waived 6 + granted 0 + effective 0`, 0 alarms, 0 tool errors, before and after.
- 9 files: main never produced a verdict. After the fix the result is `raw 20 = waived 20 + granted 0 + effective 0`, 0 alarms, 0 tool errors. That equals the 20 `@orb-waive caught-failure-ownership` markers in those files (1+1+1+2+5+1+1+6+2).

**Load caveat.** The box ran at load 17 to 53 on 24 cores throughout; that included the orchestrator's 1041 workflow. Wall and evaluate times are inflated and noisy. Treat ratios on the same box as the evidence, not absolute times. `reports/review/1051-measure.sh` reruns the four scripted measurements on a quiet box:

```
bash reports/review/1051-measure.sh /home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-a9106f281b14c346b /tmp/1051-rerun
```

It runs one at a time, each in its own setsid session with a 900 s cap. It samples the RSS of the whole descendant tree every 5 s and writes `summary.txt`. Expected peak is about 10.6 GB CLI plus 1.9 GB worker on the 9-file scope.

## How it was profiled

`pnpm` replaces `NODE_OPTIONS` with the workspace heap floor (`pnpm-workspace.yaml` `nodeOptions`), so `--cpu-prof` cannot ride `pnpm check:structure`. The guard also refuses `pnpm exec node … cli.ts`. Instead I attached the inspector to this lane's own `cli.ts` pid (SIGUSR1) and verified the pid through `Runtime.evaluate`. I took a bounded `Profiler` sample at a 2 ms interval and then closed the inspector. This is the same method as 1016. The inspector holds the process open until it disconnects, so profiled wall times include idle tail; use the unprofiled runs for wall time.

### Single file, main source, warm (window 5 to 62 s of a 54.2 s evaluate)

| Total ms | Frame |
| - | - |
| 51,979 | `at` caught-failure-native.ts:84 |
| 44,279 | `invocationEvidence` project-context.ts:328 |
| 37,414 | `createSemanticInventory` semantic-inventory.ts:121 (reader construction) |
| 32,964 | `readCompilerPrograms` compiler-programs.ts:308 |
| 27,465 | `currentDemandDescriptors` semantic-inventory.ts:222 |
| 27,078 | `assertSnapshotCurrent` semantic-inventory.ts:394 |
| 28,385 | `authoredCompilerFiles` compiler-programs.ts:124 |
| 26,488 | anonymous at compiler-programs.ts:131 (`realpathSync` of every authored path) |
| 7,700 | `readTypeObservations` type-observations-read.ts:15 |
| 7,259 | `assertNode` invocation-evidence-replay.ts:257 |

Top self time: `lstat` 23,997 ms; `realpathSync` 3,972; `spawn` 3,944; ts `skipTrivia` 3,150; `normalizeString` 2,550; GC 2,386; `assertNode` (replay:257) 1,363; `assertNode` (type-observations-codec:118) 1,321.

Attribution:
- Reader construction and program loads: 37 s.
- Native fact queries and type-observation replay: about 15 s.
- No per-file re-decode showed on the single-file path. No TypeScript checker program was loaded in the CLI; the worker loaded one, once.

### 9 kit files, after fix 1 (window 244 to 394 s)

145.4 of 150 s sit in `assertInvocationChild` semantic-inventory-queries.ts:404-405, reached through `createSemanticInventory > demandPartitions > coversNativeDemand > coversInvocationDemand > hasInventoryInvocationCoverage > invocationEvidence > invocationValue`.

### 9 kit files, after fixes 1 and 2 (window 201 to 351 s)

`readTypeObservations` takes 107 s. Within it, `assertNode` at invocation-evidence-replay.ts:257 takes 92 s. About 36 s of that came from semantic-inventory-reader.ts:356 building `capturedSpan(node)` (ts `getStart`/`skipTrivia`) only to read `.file`.

## Root causes and fixes

1. **`tooling/src/floor/compiler/compiler-programs.ts:131` (main).** `authoredCompilerFiles` rebuilt `new Set(inventory.paths.map(realpathSync))` once per config. The cost was about 12k authored paths × 25 configs per program-graph read, and about 4 graph reads per inventory acquisition (`semantic-inventory.ts:138,157,167,191`). The fix computes `authoredIdentity` once per `readProgramGraph` call, lazily, and passes it down. A later read resolves symlinks afresh. Nothing is keyed on the inventory object.
2. **`tooling/src/floor/code-facts/semantic-inventory-queries.ts:404-405` (main).** `invocationValue` checked each child's key with `entries.some(...)` over all previous siblings, which is O(n²) per container on wide type-observation graphs. The fix keeps a `Set` of sibling keys per container. A duplicate key still raises the same "container identity is ambiguous" refusal. `readDrizzleGraph` shares the decoder, so it is fixed as well.
3. **`tooling/src/floor/code-facts/semantic-inventory-reader.ts:356` (main).** `replayFor` compared `value.file === capturedSpan(node).file`, which computed the anchor's start, a trivia scan, on every replayed read. The fix compares against `capturedFile(node)`, the same canonical path, without building the span.
   - **Behavior change** (verifier P3). The value compared is the same, but the old code also crashed in `nodeSpan` when the anchor had been forgotten. Now a late replay through a forgotten anchor proceeds, and the source-text check that follows still refuses stale text.
   - The test "a late related-value replay after its anchor is forgotten admits unchanged text and refuses changed text" in `native-invocation-delivery.test.ts` pins both halves. On the old comparison it fails with ts-morph's "removed or forgotten" error from `nodeSpan`.

**Relation to 1016.** It is not the same stored-schema decode (`readDrizzleGraph` per subject). Fix 2 is its sibling: repeated decode work, inside the same atom decoder 1016 reached. Fix 1 is a different class: repeated invariant derivation inside one owned program-graph read.

**Interaction with 1070** (`9607a58835`, owner-ruled separately). The ordinary planner's column × field × call cross product overflowed a Map on the db program. It does not touch the kit world's numbers. Kit declares no Drizzle tables: 0 `sqliteTable` hits across 75 `packages/kit/src` `.ts` files, by both `rg` and `git grep`, so its planner has no typed columns. The w1070 runs below confirm it.

## Tests

- `tests/tooling/floor/compiler/compiler-program-physical-identity.test.ts`
  - Before the fix, a non-member authored file was realpathed 1 + programs times: `expected 5 to be 2`. After the fix it is once per graph read, and does not grow with program count.
  - A freshness control proves each read resolves again.
- `tests/tooling/floor/code-facts/semantic-inventory.test.ts`, "invocation graph decoding work grows linearly with sibling count and still refuses a duplicate key"
  - Replaced in the follow-up commit by a CPU-scaling bound; see that section. The first version counted `Array.prototype.some` calls (742 vs 32 on main), which a rewrite using another comparison method would have escaped.
  - It also proves the duplicate-key refusal survives.
- No wall-clock assertions. The decode bound compares CPU time against input size.

## Follow-up commit (primary note 1775): A and B

Both proposals were approved and built in one commit stacked on `9da8ebc794`.

**A: skip the post-publication rechecks on pure reuse.** In `tooling/src/floor/code-facts/semantic-inventory.ts`, `createSemanticInventory` now runs the two rechecks after publication and after reader creation only when something was published (`publicationRecheck`). Those were the checks at the old lines 167 and 191.
- The before-extraction read (`initialAuthored`, `currentDemandDescriptors`) still runs on every path.
- The after-extraction or after-reuse check (old line 157) also still runs on every path.
- A pure reuse ran no worker and published nothing, and its reader still admits every source epoch on read.
- Test: "a source edit between two pure-reuse acquisitions re-extracts instead of handing out stale facts" in `semantic-inventory-native.test.ts`. A second acquisition runs no worker and keeps the same generation. After a source edit, the next acquisition runs one worker, publishes a newer generation, and serves the new export.
- Red: deleting the remaining reuse guards (the `inputsCurrent` reuse condition in `demandPartitions` and the post-reuse check) makes it fail with `expected [] to have a length of 1`. That is stale reuse, with no re-extraction.

**B: memoize verified admission inside one reader lease.** In `tooling/src/floor/code-facts/invocation-evidence-replay.ts`, `typeReplayOwner.assertNode` keeps `WeakMap<wrapper, compilerNode>`.
- **Key.** A wrapper plus its immutable TypeScript node. An edit or a forget replaces or detaches the compiler node, so a hit means the same parse that already passed.
- **Ownership.** The memo belongs to one replay of one reader's evidence.
- **Every call**, before the memo is consulted, still runs the reader's `assertOpen` (newly passed in as `assertLive`), which covers the lease and implementation, and the loop over every captured source epoch.
- **Writes.** An entry is written only after the anchor replay and the span replay both pass.
- Test: `tests/tooling/floor/code-facts/type-replay-admission.test.ts`. It proves:
  - a second check in the same lease does not replay;
  - after the lease is released, the memoized node refuses;
  - a new lease verifies again;
  - a refused anchor is not memoized: the next call replays again.
- Red on the old owner: `expected 17 to be 15`, because the second check replayed.
- The one other caller, `tests/tooling/verify/ops/native-css-delivery.int.test.ts:425`, now passes a constant `assertLive`. Its local carrier has no lease to release.

**Sibling-key test hardened** (verifier P3). The decode test no longer counts `Array.prototype.some`.
- It appends 2,000 and 32,000 null siblings to stored fact graphs. The fact schema strips that root key, so the decoded fact is unchanged.
- It asserts best-of-3 process CPU for the wide read is under 64 times the narrow read. Linear decoding measured about 27 to 30 times. The original `.some` decoder measured 175.6 times, and a planted `for…of` quadratic rewrite measured 192.7 times; both fail.
- This is CPU time scaled against input size, not a wall-clock bound, and it does not depend on how siblings are compared.

### Measurements with A and B (also includes 1070 and the three 1051 fixes)

These come from `reports/review/1051-measure.sh`. The implementation changed, so each scope's first run is cold, a fresh worker extraction. The load shown is the 1/5/15-minute average when each run ended.

| Run | Load | Wall | Evaluate | CLI peak | Worker peak | Verdict |
| - | - | - | - | - | - | - |
| single, cold | 24.5 / 27.9 / 31.0 | 81.4 s | 49.9 s | 3,524,328 KiB | 608,068 KiB | raw 6 = waived 6, 0 alarm |
| single, warm | 23.3 / 27.1 / 30.6 | 55.8 s | 23.2 s | 3,404,548 KiB | — | raw 6 = waived 6, 0 alarm |
| 9 files, cold | 17.9 / 23.3 / 27.8 | 442.2 s | 413.2 s | 10,624,124 KiB | 1,677,496 KiB | raw 20 = waived 20, 0 alarm |
| 9 files, warm | 16.9 / 21.4 / 26.3 | 167.1 s | 125.2 s | 10,363,172 KiB | — | raw 20 = waived 20, 0 alarm |

Against the earlier rows:
- Warm single-file evaluate went from 65.2 s on main, to 27.1 s after the three fixes, to 23.2 s now.
- Warm 9-file evaluate went from no verdict on main, to 276.2 s, to 125.2 s now.
- Cold 9-file now finishes inside the 900 s cap. Before, on main and after the first three fixes, it had no verdict.
- Every peak stays under the 16 GB hosted runner.

## Remaining forks for the orchestrator

- **Worker extraction cost.** The 9-file kit partition still takes minutes to extract under load and peaks at 1.7 to 1.9 GB. With A and B the cold 9-file scope now finishes in 442 s; extraction is the largest remaining part of a cold run.
- **965.** The standard hosted Linux runner has 16 GB (owner ruling), so the 8.6 to 10.6 GB warm 9-file CLI peak fits it. 965 still needs the whole structure stage and the `pnpm ast` verbs measured under 16 GB.

## Commands and results

| Command | Result |
| - | - |
| `pnpm test:scoped tests/tooling/floor/compiler/compiler-program-physical-identity.test.ts` | red on main source (5 vs 2); 2/2 pass with the fix |
| `pnpm test:scoped tests/tooling/floor/code-facts/semantic-inventory.test.ts -t "decoding work grows linearly"` | ratio 175.6 on the main decoder and 192.7 on a planted for…of rewrite (both fail the bound of 64); about 27 to 30 with the fix |
| `pnpm test:scoped tests/tooling/floor/compiler/semantic-inventory-extract.test.ts` | 25 failures on main source; the same 25 titles with fix 1 |
| `pnpm test:scoped tests/tooling/floor/code-facts/semantic-inventory.test.ts tests/tooling/floor/code-facts/native-invocation-delivery.test.ts` | inherited failures match main. Six fix-only failures were all timeouts at load 25+; each passes alone, and two sit at their limits on main as well (77.6 s and 30.3 s) |
| `pnpm typecheck --config tooling/tsconfig.json` | PASS |
| `pnpm exec biome check <changed files> --diagnostic-level=error` | clean |
| focused `check:structure --check caught-failure-ownership` runs | see the table above; raw run directories are in the lane scratchpad `runs/` |

Owed on the merged tree: `check:policy-conformance`, and structure on the client world. The client-world heap exhaustion in 1051's "What" was not reproduced or fixed here.
