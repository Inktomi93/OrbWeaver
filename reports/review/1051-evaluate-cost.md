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
3. **`tooling/src/floor/code-facts/semantic-inventory-reader.ts:356` (main).** `replayFor` compared `value.file === capturedSpan(node).file`, which computed the anchor's start, a trivia scan, on every replayed read. The fix compares against `capturedFile(node)`, the identical canonical path, without the span.

**Relation to 1016.** It is not the same stored-schema decode (`readDrizzleGraph` per subject). Fix 2 is its sibling: repeated decode work, inside the same atom decoder 1016 reached. Fix 1 is a different class: repeated invariant derivation inside one owned program-graph read.

**Interaction with 1070** (`9607a58835`, owner-ruled separately). The ordinary planner's column × field × call cross product overflowed a Map on the db program. It does not touch the kit world's numbers. Kit declares no Drizzle tables: 0 `sqliteTable` hits across 75 `packages/kit/src` `.ts` files, by both `rg` and `git grep`, so its planner has no typed columns. The w1070 runs below confirm it.

## Tests

- `tests/tooling/floor/compiler/compiler-program-physical-identity.test.ts`
  - Before the fix, a non-member authored file was realpathed 1 + programs times: `expected 5 to be 2`. After the fix it is once per graph read, and does not grow with program count.
  - A freshness control proves each read resolves again.
- `tests/tooling/floor/code-facts/semantic-inventory.test.ts`, "invocation graph decoding compares sibling keys linearly and still refuses a duplicate key"
  - It counts sibling-key comparisons during the decode of a 32-wide profile container. Before the fix: `expected 742 to be less than 32`; at width 256 it was 34,454.
  - It also proves the duplicate-key refusal survives.
- No wall-clock assertions.

## Gates and design not touched (forks for the orchestrator)

- **Currentness rechecks.** On the warm single file, `assertSnapshotCurrent` still costs about 16 s: three rechecks per acquisition (`partitionImplementationsCurrent` 6.3 s, `currentDemandDescriptors` 5.3 s, `inventoryAuthoredFiles` 2.7 s, `authoredVersion` 1.5 s). The design requires a recheck after the worker exits and before publication. Whether the post-publication and post-reader rechecks (`semantic-inventory.ts:167,191`) can be dropped on the pure-reuse path is a design call. My recommendation: keep the pre- and post-extraction checks, and on the reuse path (no worker ran) skip the two later rechecks. That needs a ruling.
- **Per-read epoch admission** (`invocation-evidence-replay.ts:249-265`, `type-observations-codec.ts:118`). Every type-observation read replays the anchor and loops over every captured source epoch. On the 9-file scope this is the remaining CPU hot path, about 35 s self in a 150 s window. It is deliberate currentness. An exact cheaper form would key "verified" on immutable `compilerNode` identity per reader lease. I did not build it; it changes the admission mechanism and needs review.
- **Worker extraction cost.** The 9-file kit partition takes about 5 min to extract under load, and peaks at 1.9 GB. That alone keeps the cold 9-file scope past 15 min on this box.
- **965 is not met.** The hosted-runner budget is not established, and the warm 9-file CLI peak is 8.6 to 10.6 GB.

## Commands and results

| Command | Result |
| - | - |
| `pnpm test:scoped tests/tooling/floor/compiler/compiler-program-physical-identity.test.ts` | red on main source (5 vs 2); 2/2 pass with the fix |
| `pnpm test:scoped tests/tooling/floor/code-facts/semantic-inventory.test.ts -t "invocation graph decoding"` | red on main decoder (742 vs 32); passes with the fix |
| `pnpm test:scoped tests/tooling/floor/compiler/semantic-inventory-extract.test.ts` | 25 failures on main source; the same 25 titles with fix 1 |
| `pnpm test:scoped tests/tooling/floor/code-facts/semantic-inventory.test.ts tests/tooling/floor/code-facts/native-invocation-delivery.test.ts` | inherited failures match main. Six fix-only failures were all timeouts at load 25+; each passes alone, and two sit at their limits on main as well (77.6 s and 30.3 s) |
| `pnpm typecheck --config tooling/tsconfig.json` | PASS |
| `pnpm exec biome check <changed files> --diagnostic-level=error` | clean |
| focused `check:structure --check caught-failure-ownership` runs | see the table above; raw run directories are in the lane scratchpad `runs/` |

Owed on the merged tree: `check:policy-conformance`, and structure on the client world. The client-world heap exhaustion in 1051's "What" was not reproduced or fixed here.
