---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tooling
plan: unwired-code
---

# Unwired engine one judges and find-references audits one way: homeWritten from direct writes, a key per union option, serviceReflectedReads deleted, reflected memoized, linked deduped (lands with 1697)

## What

`pnpm unwired fields` judges with engine one and audits one way with find-references. A disagreement means engine two found a production site in a role engine one lacks. `homeWritten` reads the sites that name a field plus the writes a flow carries in. Each schema union option has its own field key, the second and later declarations with a `#n` suffix. `serviceReflectedReads` is deleted. `reflected` runs once per value, target and key shape, and `linked` deduplicates by key edge.

## Why

This item's Evidence shows the old comparison reported engine two's blind spots as contradictions, and most of the time and memory sits in `reflected` and `linked`.

## Done when

- A field engine two reaches in fewer sites stays a finding. A field engine two reaches in a role engine one lacks leaves the findings for `disagreements`.
- A home written only through a spread link is not written. The env schema reports no `never-written` row.
- Two union options that share a key are two fields.
- `fields` loads TypeScript 6 only under `--cross-check`.
- The full before and after runs below agree with the expected change.

## Evidence

Analysis that fixed this change, from a `pnpm unwired fields` run and a `--cross-check` run (byte-identical reports) and probes that called each engine on one world at a time. Proven means a run or a read of the cited code showed it. Inferred means the evidence points there and no run isolated it. Re-derive the rows with `pnpm unwired fields --cross-check`.

Which engine holds which side: `.disagreements[].found` is engine two's verdict (`tooling/src/unwired/fields.ts` computes and records it). Most rows are engine one `never-written` against engine two `wired` or `unreferenced`; the rest are `never-read`.

| Class | Cause | Right | Label |
| - | - | - | - |
| A1 | `envObjectSchema`. Both engines see the same reads and no writes. They differ on `homeWritten` (`fields.ts`): engine one counts the overlay writes in `resolveEnv` through the spread link in `packages/server/src/foundation/env/record/index.ts`. | Engine two: the values come from the host environment | proven |
| A2 | The same `homeWritten` gap on `portableImageryImageSchema` | Engine two; both engines miss the write itself | proven |
| B1 | A read on the domain params type reaches the schema key only through `{ principal, ...input }` in the router. Engine one links the spread. Find-references cannot. | Engine one: read exists, no production caller writes the key | proven |
| B2 | Same read path, and a production write exists in a form neither engine follows (see item 1697) | Neither: `never-written` is false | proven; the cursor row is inferred |
| C | Two schema union members share one field key. The tally keeps the first declaration but sums both members' sites. | Engine one's kind | proven |
| D | A member redeclares a base member. Find-references climbs to the base. | Engine one | proven |
| E | Kind only. Engine one credits a site to the wrong member of a contextual union or a schema `.extend` key. | Mixed | proven |
| F | A shorthand write in a literal returned through `.map` into `push(...)`. Engine two does not reach it. | Engine one | proven for the sites; the mechanism is inferred |
| G | Both engines miss a whole-object hand-off (`spiderPose(input, tracker)` passes the frame to `SpiderScene`). | Neither: `never-read` is false | proven |

Rows that stay false until item 1697 follows their forms: B2, A2 and G. Engine two found no genuine production use that engine one missed.

Program sets. Engine one, engine two and the checker walks load the same list: each `packages/*/tsconfig.json` that `tooling/src/unwired/worlds.ts` names, then `tsconfig.node.json` and `tsconfig.tests-dom.json`. `--cross-check` runs engine two on the TypeScript 6 language service. No scan loads `packages/server/tsconfig.router.json`, the three `packages/showcase-plugins/tsconfig.author-*.json` worlds, `tooling/tsconfig.json`, `tooling/src/codemods/tsconfig.json` or `tsconfig.tests-iso.json`.

The world suspicion fails, proven two ways. Every row is decidable in one program: a loaded world holds the declaration and every site either engine reported. The unloaded worlds hold no production site that a loaded world lacks; the only sites in files no scan loads are a spread read in `tooling/src/wire-tap/ops/sse.ts`, none of them a row and none production. The root `tsconfig.json` has `files: []` and does not see across worlds. Cross-world coverage comes from the union of per-world answers. Declaration keys are `path#index`, the same node in every world (`tooling/src/unwired/native.ts`).

TypeScript 7.1 API, read from `node_modules/@typescript/native/dist/api/` at the pinned beta:

- One session can hold every world (`openProjects` takes a list), and batches mix projects. `getReferencedSymbolsForNode` and `getSignatureUsage` batch but do not cross projects.
- The scans do not call `getSignatureUsage`.
- One session is the wrong trade. A sample of reference queries per world reached 8 GB with each checker barely touched, and the fully checked worlds sum to an upper bound of 34.5 GB. That is over the 16 GB bar. A merged program stays out for the reason at the top of `tooling/src/unwired/worlds.ts`.
- Keep the second process per world. One process reaches 8.2 GB against 5.0 GB split, for a gain of about 110 s.

Where the time goes (five worlds at load 32 to 50 on 24 cores). The suspicion that TypeScript 6 is the main cost fails.

| Phase | Share |
| - | - |
| Engine one `propertyIndex` | 41% |
| Engine two find-references, fresh process | 30% |
| TypeScript 6 `serviceReflectedReads` | 11% |
| TypeScript 6 program open | 6% |
| 7.1 program opens, both passes | 4% |
| Role classification (`rolesOf`) | 4% |
| Engine one `declarations` | 4% |

Porting the TypeScript 6 walks saves at most 17% of the attributed time and moves no peak memory. Two hot spots inside `propertyIndex` are larger per fix. In the ui world, `reflected` (`tooling/src/unwired/occurrences.ts`) spends 94% of the index reading every property of a library props type once per site. In the node world, `linked` took the Node process from 1.7 GB to 5.6 GB in one step by concatenating repeated site lists. The reported 7.9 GB peak is that Node process, not a compiler (inferred).

Not proven: the time the phases do not cover, and every budget after the change (run `/usr/bin/time -v pnpm unwired fields --out=reports/unwired/fields.json` on a quiet box after the change); that the 7.9 GB process is Node (the scan's own run was not sampled per process); why find-references misses class F; and the kinds of the class C keys outside the rows.

Retiring TypeScript 6:

- From `fields`: yes, by deletion. `params` already loads no TypeScript 6 program outside `--cross-check`.
- From the member scan, `unions` and `shapes`: not yet. `flows`, `builtByService` and `serviceConfirms` hold TypeScript 6 programs and need a port first.
- The `typescript` package stays. `tooling/src/unwired/classify.ts` parses alone, `worlds.ts` reads configs, and the 7.1 API has no parse-alone call. ESLint also uses it.
- Keep `--cross-check` until the other verbs show parity with it.

The trade this item accepts: it reports the rows that item 1697 owns as false findings now, where today they sit in the disagreement list.

Requests, rounds and world sharing:

Result: the scans asked the compiler mostly to repeat itself. One round per property made the client world cost millions of round trips, and most answers repeated across worlds. Each fix below kept the answers or added only true sites.

Evidence came from a counter on the sync client in scratch scripts, per world. Load was 15 to 60 on 24 cores, so times are rough. Request and round counts are exact. No full `pnpm unwired` ran.

#### Sharing across worlds

| Measure | Value |
| - | - |
| Distinct source files | 7280 |
| Files in 2 or more worlds | 5121 |
| File-world slots | 18977, of which 11697 repeat (61.6%) |
| Distinct property sites | 666939 |
| Site-world slots | 1547446, of which 880507 repeat (56.9%) |
| Sites in 2 or more worlds | 361469 |
| Those with a different answer in another world | 1 |
| References checked in 578 sampled find-references sites | 4326 |
| References a world holding the file missed | 0 |

The one differing site is `referrerPolicy` at `packages/server/src/infra/network/http-server.ts`, a key whose contextual type changes with the DOM lib. Its server world, which is its home, gives the larger answer.

Option differences between worlds are `lib`, `module`, `moduleResolution`, `types`, `jsx` and `allowJs`. They form two groups, DOM and node. Those options can change an answer, so the count above is an observation on this tree, not a proof for every future tree.

#### What each change did

| Change | Sample | Before | After |
| - | - | - | - |
| Memoize requests in `NativeWorld.batch` | kit requests | 199536 | 133413 |
| `all` groups and bulk forms | client rounds | 6051366 | 1242 |
| `all` and the memo together | client requests | 13624413 | 3859347 |
| `all` and the memo together | client facts time | 658 s | 180 s |
| `all` and the memo together | contracts facts time | 183 s | 18 s |
| Home worlds, every world | requests | 16664400 | 4877480 |
| Home worlds, every world | rounds | 5757 | 2033 |
| Home worlds, every world | engine one time | 953 s | 404 s |
| Home worlds, every world | Node peak | 9.5 GB | 3.7 GB |
| Engine two world assignment, 578 sites | asks | 2463 | 1153 |

Client facts sorted identically before and after the memo and `all` changes, as did kit.

#### Merged answer against the union of worlds

Twelve per-world indexes were unioned and compared with the homed join, leaving out the files this work edited.

| Index | Pairs in union | Lost | Gained | Gained at production sites |
| - | - | - | - | - |
| `index` | 1400989 | 0 | 20129 | 3361 on 263 keys |
| `direct` | 968364 | 0 | 3954 | 673 on 13 keys |

A gain is a link or flow from one world that reaches a site in a file no shared world holds. In the production case, a client write such as `chatId` at `packages/client/src/features/chat/hooks/use-continue-turn.ts` reaches the server's domain params through a router flow. That is a real write. A gain can clear a false `never-written` or `never-read`, and it can move `unreferenced` to `never-read`.

#### Findings on real worlds

`scanFields` ran from the sources before this work and after it on contracts, kit and ui together, with no test worlds. Both reports hold 7239 fields, 4822 findings and 1 disagreement, with no row added, removed or changed.

| Measure | Before | After |
| - | - | - |
| Rounds | 5293853 | 451 |
| Requests | 7074254 | 896567 |
| Time | 412 s | 131 s |

#### Find-references sample

578 declared members were asked in every world that holds them. The assigned worlds returned the same 3748 references as the union: none lost, none gained.

#### What the TypeScript 7.1 API gives

Lines are in `node_modules/@typescript/native/dist/api/` at the pinned 7.1.0-beta.

| Need | API | Line | Used |
| - | - | - | - |
| Batching | `API.batch`: one `batchRequests` per round | `sync/api.d.ts:105`, `sync/generatorSupport.js:78` | yes, through `NativeWorld.batch` |
| Request dedupe | Only `initialize` deduplicates | `sync/generatorSupport.js:293` | the memo adds the rest |
| Parallel requests in a generator | `all` | `sync/api.d.ts:74` | yes |
| Bulk symbols, types | `getSymbolAtLocation(nodes)`, `getTypeOfSymbol(symbols)`, `getTypeAtLocation(nodes)` | `sync/api.d.ts:821`, `sync/api.d.ts:844`, `sync/api.d.ts:878` | `getTypeOfSymbol` only |
| Bulk by position | `getSymbolAtPosition`, `getTypeAtPosition`, `getSymbolOfSourceFile` | `sync/api.d.ts:827`, `sync/api.d.ts:897`, `sync/api.d.ts:833` | no |
| Client caches on a handle | `Type.getProperties`, `getCallSignatures`, `getNonNullableType`, `Signature.getReturnType` | `sync/api.d.ts:1439`, `sync/api.d.ts:1451`, `sync/api.d.ts:1459`, `sync/api.d.ts:1662` | no: they miss same-round repeats, which the memo covers |
| Type and signature handles | Per project registry | `sync/api.d.ts:404` | a type id compares only in one world |
| Symbol identity across projects | File-owned symbols share one source-file record, keyed by content hash and parse options | `sync/api.d.ts:1324`, `sourceFileCache.d.ts:22` | no: one API process only, and worlds use one process each |
| Node identity across worlds | `NodeHandle.path` and `index` | `sync/api.d.ts:1287` | yes, as declaration keys |
| File to project | `Snapshot.getDefaultProjectForFile` | `sync/api.d.ts:360` | no: `parsedCommandLine.fileNames` gives every root at once |
| Root files | `Project.parsedCommandLine` | `sync/api.d.ts:483` | yes, for home worlds |
| Program closure | `Program.getSourceFileNames` | `sync/api.d.ts:587` | yes, for `fileLists` |
| One session over all worlds | `openProjects` list | `proto.generated.d.ts:1038` | listing only: 3 s for all twelve |
| Per-file reference query | `getReferencesToSymbolInFile` | `sync/api.d.ts:869` | no: it is a different algorithm from find-references, so it would change engine two |
| Timing | `collectTiming`, `API.getTimingInfo` | `options.d.ts:34`, `sync/api.d.ts:226` | no |

The shipped types name no checker concurrency setting. Upstream `internal/project/checkerpool.go` defaults to four checkers, and `internal/api/session.go` holds one persistent API checker per program. That source is upstream main, not the pinned build, and no pinned run showed a batch running concurrently.

#### Call sites

| Call | Per what | Runs | Duplicates | Fix |
| - | - | - | - | - |
| `getSymbolAtLocation`, lookups | property name | once per home file | none after the memo | home worlds; memo |
| `getContextualType`, lookups | object literal key | once per literal | one per key before | memo |
| `getTypeAtLocation`, binding and heritage | site | home | few | memo |
| `getPropertyOfType`, `propertiesNamed` | type and name | per distinct pair | half before, on kit | memo; `all` |
| `getPropertiesOfType`, `reflected` | distinct shape | once per shape | `shapeKey` already kept one | `all` |
| `getTypeOfSymbol`, hand-offs | property pair | per distinct symbol | half before, on kit | bulk form; memo |
| `getSignaturesOfType` and return, parameters | type pair | per pair | a fifth before, on kit | `all`; memo |
| `getTargetOfType`, `getTypeArguments` | type pair | per pair | few | memo |
| `getBaseTypes`, `ancestors` | interface | per declaration | few | `all`; memo |
| `getReferencedSymbolsForNode` | site | fewest worlds | repeated per world before | world assignment; sites deduplicated |
| `handle.resolve` | reference | per reference | none: file cached | `all` |
| `typeMembers` facts | member | every world holding the file | yes | not changed: 4% of the scan |
| `declarations` in `fields.ts` | field | every world holding the file | yes | not changed: it needs each world's type keys |
| `tuples`, `literalSites` in `unions.ts` | literal | every package world | yes | not changed: not measured |
| `restated`, `synonyms`, `reexports` in `shapes.ts` | named type | every package world | yes | not changed: not measured |
| TypeScript 6 `flows`, `builtByService`, `serviceConfirms` | world | every world | yes, of 7.1 world opens only | not changed: separate engine |

Identical type pairs in `handoffFlows` already used handle ids, in one world. They stay that way. Handle ids do not compare across worlds.

#### Keeping the engines apart

The memo lives on one `NativeWorld`, and each engine opens its own. The spelling index that assigns engine two's worlds reads source text only. Engine two takes no answer from engine one. `--cross-check` still asks every holder.

#### Earlier tooling

`savepoint/pre-tooling-deletion-2026-10-21` used ts-morph and TypeScript 6, so its mechanics do not carry over. These lessons do, and none of its store code came across.

- The earlier `semantic-inventory-extract` module also gave each file an owning world through its roots, and filtered references by the names a root spells. Both match what this work does.
- The earlier `ts-workspace` module stops a reference visit once the verdict is known. A field needs only one lacking role, so engine two could do the same. It is not built.
- Item 1155 found per-declaration search quadratic in name frequency. Engine one's single pass avoids it. Engine two keeps it, on far fewer sites.
- The earlier `ast/lib/fields` module records a template-literal blind spot: TanStack Form writes through a computed name string. Neither engine here follows that form.
- `codex/native-checker-1002` at `99469fcb55` found 15 reference queries for 8 positions, from a declaration and its name. This scan asks by name only.

## Not proven

- Sharing rests on one tree. A later option change could make a home world's answer narrower than another world's. `--cross-check` does not cover this for engine one.

- `chatId`-style gains can move field verdicts. Their effect on the report is known only after a full run.

- The 269 s the phases do not cover, and the budget figures after each change. They need a run after the change on a quiet box: `/usr/bin/time -v pnpm unwired fields --out=reports/unwired/fields.json`. Timings above ran under load, and `propertyIndex` moved between runs (tests-dom 91 s and 217 s).

- That the 7.9 GB process is Node. The probes used a 12 GB heap limit. The scan's own run was not sampled per process.

- That `cursor` is written. The call passes no cursor; the row assumes tRPC's infinite query fills it.

- Why find-references misses class F. The sites are proven; the generic contextual path is inferred.

- Class C affects findings too. At least 19 reported keys in the server world alone span several declarations. Their kinds were not re-judged here.

Landing evidence:

- `tests/tooling/unwired/fields.int.test.ts` and `tests/tooling/unwired/occurrences.int.test.ts`: a found case and a control per change, each seen red first. The deletion has no red: the reflective controls stay green without the walk.
- A union option's key reads narrowed to another option, which find-references climbs across, so such a key is an audit row and not a finding. `HealthSchema.at#2` in `tests/tooling/unwired/fields.int.test.ts` holds the case. The real run can show more rows than class D for this reason.
- Owed by the owner: the full before and after, peak memory and wall time.
