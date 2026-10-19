# 1098: caught-failure type plan and the bounded closure

## Outcome

Superseded by lane cb-1098b: see "Headroom pass (lane cb-1098b)" at the end. The client derivation on the rebased tree finishes in 8:59, with a 14.67 GB worker peak. The text below records the first lane's state.

The first lane left item 1098 open. The client caught-failure derivation then completed: 137 sites in 26:20.

It completes only at the edge of the heap. The worker peaked at 16.75 GB RSS, with a 15.2 GB heap at finish against the 16 GiB cap. The whole process tree peaked at 19.7 GB. That is not a run a 16 GB runner can be trusted with.

Landed on this branch, as two stacked commits, both `Refs: 1098`:

- The member-question narrowing.
- The D328 bounded closure:
  - an explicit hop bound of 2;
  - an unresolved verdict past the bound, reported as an advisory unknown;
  - root narrowing to the sites the reader can judge;
  - argument-only bodies: a hop walks a multi-statement function body only when it came from a call argument.

Conformance holds at 75/34/0, and every sibling gate stays green.

Owed:

- More headroom on the client.
- The site-id diff: 137 live client sites against 140 committed rows.
- The db and server reruns on merged main.

## Census of what the reader reads

Searches:

- ast-grep `{ kind: "property", $$$ }` and `{ kind: "property" as const, $$$ }` over `tooling/src/verify`: 658 files scanned for ts, 0 for tsx.
- ast-grep `$R.types.$M($$$)` over the 14 caught-failure and detached-work files.
- A second sweep with `rg` for `types?.` and `types[` found no other spellings.

Member reads:

| Read | Node | Members | Depth |
| - | - | - | - |
| `typeIsFailureOutcome`, `caught-failure-outcome.ts:200-230` | the call itself, only through `callIsFailureOutcome` | `ok`, `kind`, `status`, `step`, `verdict` | the call's own Type, then that member, then its union parts (literal values) |
| `promiseLikeValue`, `caught-failure-promise.ts:39-60` | the rejection receiver | `then` | the receiver's union parts, or its own Type when it has none (presence only) |
| `cannotReturn`, `caught-failure-outcome.ts:103-122` | calls | none | display, type arguments, `never` |

The old plan asked all six members at every closure node and at every union part, with literal values and nested unions.

## Fix 1: plan member questions only where they are read

- `tooling/src/floor/code-facts/member-type-reads.ts` holds the shared reads: `memberLiteralValues`, `memberReceivers`, `hasMember` and `observeClosureMembers`. The planner calls the same functions the reader calls, so property list and depth have one home. The names live in `caught-failure-read.ts`: `FAILURE_OUTCOME_OK_MEMBER`, `FAILURE_OUTCOME_DISCRIMINANTS` and `PROMISE_LIKE_MEMBER`.
- Closure questions carry `callLiteralMembers` and `presenceMembers`. Coverage refuses both on any other question kind ("native closure member nomination is foreign").
- `tests/tooling/verify/lib/caught-failure-type-plan.test.ts` holds the tests.
  - Red on the old planner: 6,398 outcome-member selectors with 40 fillers against 508 with 2. The unplanned read did not throw.
  - Green: the counts are equal, and the selector shapes match the reader.
  - Verdict parity: the native verdicts equal the ts-morph verdicts on `refused`, `settled`, `denied`, `absorbed`, `lookalike` and `filled`.
  - An unplanned member read throws "native Type selector was not captured".

## Fix 2: the bounded closure (D328)

- `tooling/src/floor/code-facts/bounded-closure.ts`:
  - `walkBoundedClosure` walks breadth-first by declaration hops and hands every declaration one hop past the bound to `closureBound`.
  - `withinClosureBound` turns a `ClosureBoundError` into `{ kind: "unresolved", reason }` and lets every other error through.
- Closure questions must carry `closureHops`. Coverage refuses an unbounded closure ("native symbol closure is unbounded").
- `readTypeObservations` rebuilds the frontier while it replays. A question about an uncaptured node inside a frontier declaration throws `ClosureBoundError`. Any other miss still throws the old fail-closed error. `TypeObservationReader.closureFrontier` exposes the frontier test.
- Readers:
  - `caught-failure-ownership` and `detached-work-traced` report an unresolved site through `ctx.report.analysis(node, { kind: "unknown" })`. It is advisory and never a finding.
  - `caught-failure-census-row` and `caught-failure-ownership-health` use `boundedFailureSites`. It reports the unknown and withholds that site's id scope (`caughtFailureScope`) from both joins, because sibling ordinals in that scope are unknown.
  - The census generator refuses to derive a census when a site is unresolved.
  - `policy-fixture-substrate` judges each write inside `withinClosureBound`. `fixture-path-semantic.ts` raises `ClosureBoundError` past the frontier.
- Finite claims are stated in the headers of `caught-failure.ts` and `fixture-path-native.ts`.
- Root narrowing (`nominatedRoots`, `caught-failure-native.ts`):
  - Roots are try statements, plus calls the reader can read as rejection invocations: a `catch`, `then`, `call` or `apply` member, an element-access callee, or an identifier bound in the same file by a call initializer. Each such call is rooted at its enclosing statement, because `isDiscardedExpression` and `valueHasMeaningfulConsumer` climb to it.
  - Every other identifier callee gets the new light `node-symbols` question.
  - `boundRejection` now tests the call initializer before the write guard. Every condition in that test is a conjunct, so the verdict is unchanged.
- Constants: `REJECTION_INVOCATION_MEMBERS`, `CALL_FORWARDER`, `APPLY_FORWARDER` and `BIND_FORWARDER` in `caught-failure-core.ts`.

## Measurements

Every run was a single program under `heavy.lock`, with `setsid` and a 30-minute `timeout` on the group. Harnesses: the scratchpad scripts `cb-1098-client.ts`, `cb-1098-cohort.ts` (the 1085 harness, unchanged) and `cb-1098-measure.ts`.

| Run | Selectors | Closure nodes | Wall | Peak RSS | Result |
| - | - | - | - | - | - |
| client, before (1085 probe) | over 750,000 | 64,021 | 7-9 min | 17.3 GB tree | heap OOM |
| client, member narrowing | 250,000 reached | 70,962 at that point | 16:01 | 17.2 GB | heap OOM, 13.9 GB heap at 250k |
| client, narrowing + roots + 2 hops | 250,000 reached | 80,423 at that point | 7:48 | 17.25 GB (20.1 GB tree) | heap OOM, 13.3 GB heap at 250k |
| client, + argument-only bodies (final) | 231,167 | 78,587 | 26:20 | 16.75 GB worker, 19.7 GB tree | completed, 137 sites; 15.2 GB heap at finish |
| in-process, 5 client files, unbounded | 21,979 bare / 50,531 new / 178,696 old | 17,916 | 0:28-0:32 | 3.7 GB | done; member questions are about 80 MB of 2.2 GB |
| in-process, all client calls as roots, hops 0/1/2/3 | n/a | n/a | about 7 min each | 17.2 GB | OOM at every bound |
| in-process, 40 files, hops 0, with and without displays | 14,409 | 3,914 | 0:24 | +2.3 GB / +2.15 GB | displays are not the driver |
| db cohort (combined 1085 base, before the rebase) | 178,492 | n/a | 1:00 | 1.69 GB | done |
| server read-parsed cohort (same base) | 2,342,474 | n/a | 5:05 | 7.79 GB | done |

- A heap profile (`--heap-prof`, 40 files) puts the retained heap in TypeScript checker instantiation: `checkCallExpression`, `inferTypeArguments`, `instantiateSymbol`, `createInstantiatedSymbolTable`. Typing an expression is what costs. Per-selector storage is small.
- Syntactic root census over the client's 1,582 files:
  - 20,904 calls cover 356,356 of 1,459,180 nodes.
  - The 372 candidate calls plus 92 try statements cover 23,269.
  - Root narrowing therefore works at depth 0. The remaining growth is in the hop expansion.
- Hop 1 fails conformance: `mustFlag[63]` and `[69]` go unresolved. Hop 2 is the smallest bound that keeps 75/34/0.
- The db and server reruns on merged main, after rebasing onto bd60368680, are owed: they were not rerun after the bound landed.

## Checks run

| Check | Result |
| - | - |
| `pnpm test:scoped` on caught-failure-type-plan, native-failure-classification, native-failure-observations, type-replay-admission and caught-failure-census-row | 12/12 pass; caught-failure-type-plan is 4/4 with the bound test |
| bound test (`caught-failure-type-plan.test.ts`, last test) | `inside` (a success outcome one hop away) is still the `empty` site. `owned` (a `never` one hop away) is owned. `past` (the same `never` three factory hops away) is `unresolved`. The unbounded ts-morph reading of `past` is clean (owned), so a clean verdict became an explicit unknown. |
| per-gate conformance (`verifyPolicyProofs`) | ownership 75/34/0; health 3/3/0; census-row 3/2/0; detached-work-traced 8/12/0; policy-fixture-substrate 16/12/0 |
| `tests/tooling/verify/ops/native-failure-tracing-delivery.int.test.ts` | timed out under load (no verdict) before the bound; question updated to `presenceMembers` and `closureHops`; not rerun |
| Biome on changed files | clean |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` under the lock | tooling PASS. Root fails only in `tests/legacy/{inference,server/domain/embeddings,server/domain/search}/_support.ts`, which predate this lane, plus one error in my new test, since fixed. The argument-only body edit came after this run; the per-edit typecheck hook reported no errors for it. |

## Bounded closure proposal: what is owed

1. **Hop kinds.** Every value node in the reader's closure currently follows `symbolBodies`. The reader takes these hops, each a declaration read:
   - a named handler's body: `caught-failure-handler.ts:40-92`;
   - a single-return factory body: `caught-failure-outcome.ts:176-198`;
   - logger and notice receivers: `caught-failure-outcome.ts:293-354`;
   - factory-origin initializers: `caught-failure-core.ts:242-277`;
   - const strings: `caught-failure-core.ts:40-66`;
   - zod schema initializers: `caught-failure-promise.ts:13-36`;
   - bind aliases: `caught-failure-promise.ts:122-142`;
   - entity-mutation config: `caught-failure-scope.ts:109-164`;
   - detached-work's const reads: `detached-work.ts:80-95`.

   Implemented as `closureArgumentBodiesOnly` (`argumentBodyHops`, `bounded-closure.ts`). A factory body counts only as a single expression or a single return (`factoryReturnsFailure`). A full body is walked only for a function handed over as a call argument. Even so, the client closure still holds 78,587 nodes. Headroom needs one of two things:
   - Restrict which value nodes may hop at all: callee, member-receiver root, element key, call argument and initializer positions. Today every value node may hop.
   - Stop asking `type-details` (display, literal value, type arguments) at every walked node. Those questions are what make the checker instantiate the types (heap profile).
2. **fixture-path-native.** It needs `symbol-closure` over the fixture's calls with `module`, `global` and `stable` value profiles. It reads `evidence.declarations`, `stableValues`, `modules`, `globals` and `types.symbol` (`fixture-path-semantic.ts`). It now carries `FIXTURE_PATH_CLOSURE_HOPS = 2`, and its conformance stays 16/12/0. A hop-kind restriction must be opt-in per question, so fixture-path keeps its own walk.
3. **At the bound.** The verdict is an explicit unknown through `report.analysis`. It is never owned and never a finding. The census generator refuses (implemented).
4. **Census of unresolved live sites.** The final client derivation completed with 137 sites. The census generator throws on any unresolved site, so a completed client run has 0 unresolved client sites. The db and server census is in "Verifier refutation and fixes" below.
5. **D328 fit.** The finite claim is in each header. Unsupported analysis returns an explicit unknown. The heap is unchanged (16 GB) and no population is cut: every nominated site is still judged or reported unknown.

## Verifier refutation and fixes (lane cb-1098b)

An Opus verifier refuted the two commits above. Each finding below was fixed red-first. "Red" means the refuted commit, `ed935d3aef` here (cherry-pick of `1f9650553e`), run in a scratch worktree. The red-row harness took the new `D328` rows and ran them against the old gate logic.

### P1: a hidden population cut in the census joins

- Defect: `boundedFailureSites` withheld a whole declaration scope (`path::decl::`) when any one site in it was unresolved. Census-row and health then skipped every id under that prefix. Fully known findings dropped silently.
- Fix (`caught-failure-native.ts`, `caught-failure-identity.ts`, `caught-failure.ts`):
  - An unresolved site withholds only its own ordinal series, `path::decl::token::`. Ordinals count per (declaration, token), so no other series can shift.
  - `candidateSiteAnchor` reads the token without judging ownership. If the token itself is past the bound, the whole declaration is withheld, and the report says so.
  - `judgeableSiteIds` reports every withheld id as an advisory unknown on the site that withholds it. The reason names the ids and the withheld count.
  - A health row that names a live site is never withheld.
- Red on `ed935d3aef`: the verifier's `absorb.ts` repro failed on both gates, "expected at least one effective finding but got 0". The new census-row `mustFlag` and health `mustFlag` rows fail the same way.
- Green: both rows pass. `caught-failure-bound.test.ts` asserts the withheld-id unknowns: "withholds 1 of 1 withheld id(s)", naming `absorb::catch::1` and `absorb::catch::2`.

### P2.1: the header claim did not match the code

- Defect: `argumentBodyHops` dropped a multi-statement body reached through an alias (`const handler = onErr`) without putting it on the frontier. A Type question inside that body threw the plain "native symbol/node observation was not captured", and the gate failed `owner-incomplete`.
- Fix (`bounded-closure.ts`):
  - A handler position is a call argument or the bare-identifier initializer of an alias. A hop walks a multi-statement body only from a handler position.
  - Every other multi-statement body is declined. A declined body that no other path walks goes to the frontier, so a question inside it is `ClosureBoundError`, an explicit unknown.
  - The question flag is now `closureHandlerBodiesOnly`.
  - The headers of `caught-failure.ts` and `fixture-path-native.ts` state exactly this.
- Red on `ed935d3aef`: G1 (`globalThis.reportError`) and G3 (`logger.error`) both gave the plain capture error.
- Green: G3 is one finding (`mustFlag` "D328 INSIDE THE BOUND ... alias"). G1 is owned (`mustPass`). Both match the pre-1098 parent.

Two more regressions against main surfaced during this work. Both are fixed the same way:

- **A bound rejection alias declared in another file** (verifier fixture F7: a global script `const recover = pending.catch.bind(pending)`). Main reports a finding. `ed935d3aef` threw the plain capture error, because only same-file call-initialized names are roots.
  - Fix: the `node-symbols` question puts a callee's call-initialized declaration in another file on the frontier (`foreignCallInitializers`).
  - Now: an explicit unknown. `mustPass` "D328 PAST THE BOUND ... global script"; the bound test asserts the unknown. This site moved from a concrete finding to unresolved by design, and the header claims it.
- **fixture-path past the bound through a captured stable value** (a support-module `ROOT` four const hops from `process.cwd()`). The capture-time stable value points at a node no walk reached. Its global facet was never captured, so `ed935d3aef` threw "native invocation facet is unavailable".
  - Fix: the replay records every walked node (`closureWalked`, `ClosureFrontier.past`). A facet missing on an unwalked node is `ClosureBoundError` (`fixture-path-semantic.ts#boundedFact`). A facet missing on a walked node still throws the plain error.
  - Now: an explicit unknown. `mustPass` "D328 PAST THE BOUND ... captured stable value".

### P2.2: gate-level rows for the bound

Rows added, in both directions:

| Gate | mustFlag (inside the bound is still a finding) | mustPass (past the bound is an explicit unknown) |
| - | - | - |
| caught-failure-ownership | aliased multi-statement handler with a local logger (G3); one-hop success-outcome catch | aliased handler with `reportError` (G1, owned); `never` three hops away; cross-file global bind alias |
| caught-failure-census-row | sibling `p.catch` beside an unresolved catch still owes its row | empty catch beside an unresolved catch: id withheld |
| caught-failure-ownership-health | gone `::q::1` row beside an unresolved catch is still a finding | unmatched `::catch::2` row beside an unresolved catch: withheld |
| policy-fixture-substrate | checkout root two hops away in a support module | root on the frontier (three hops); root reached only through a captured stable value (four hops) |

- A `mustPass` row cannot see an analysis unknown. `tests/tooling/verify/gates/caught-failure-bound.test.ts` runs every "D328 PAST THE BOUND" row through `runPolicyPass`. It asserts no finding, no tool error, and an unknown whose reason says "past the closure bound".
- The census generator's refusal is a new test in `native-failure-tracing-delivery.int.test.ts`: "the census generator refuses a site past the closure bound". It is not a gate, so its home is the int test.
- Red on `ed935d3aef` (`cb-1098b-redrows.mjs`): 6 of the 13 new rows fail. They are the G1, G3 and F7 rows (plain capture error), both P1 `mustFlag` rows (0 findings), and fixture-path four-hop (missing facet). The other 7 hold on both trees. They pin directions that were already right and must stay right.

### P3: the four oversized type-observation files

They now end below their `main` line counts. Code moved into cohesive new modules:

| File | main | now |
| - | - | - |
| type-observation-questions.ts | 853 | 846 |
| type-observations-coverage.ts | 989 | 964 |
| type-observations-read.ts | 554 | 515 |
| type-observations.ts | 873 | 873 |

- `bounded-closure.ts`: the frontier and walked set (`closureFrontier`), `symbolBodies`, the walk, and handler hops.
- `type-observation-nominations.ts`: which raw-question kinds may carry facets and closure nominations.
- `type-observations-replay-usage.ts`: the replay's unasked-row checks, moved verbatim.
- The live capture reader no longer stubs `closureFrontier`; the field is optional.
- Splitting these files further toward the 450-line cap is still owed.

## The 137 vs 140 client census gap (Part 2)

The client derivation was first run at the Part 1 state, before the rebase. It hit the 30-minute group timeout at 16.8 GB, with no output. The site-id diff therefore comes from the Part 3 runs. The harness (`cb-1098b-census.ts`) lists every unresolved site by position and counts it as a diff entry. There were none.

Diff of live ids against the committed census, both runs: before the rebase onto `97b639a30d`, and on the rebased tree.

| Row | Before the rebase | Why | Status on main |
| - | - | - | - |
| `imported-chats-memory-offer.tsx::ImportedChatsMemoryOffer.runBuild::error::1` | committed, not live | A guarded rethrow (`if (!conflict) throw error`) that the 1049 reader proves owned. | Row and marker removed by `3d3df26151` |
| `image-detail-body.tsx::ImageDetail.onSetBackground::catch::1` | committed, not live | Cross-file owner. The try holds only `await setBackground.mutateAsync(...)`. `useSetChatBackground` (`use-imagery-mutations.ts:47-51`) is a `createEntityMutation` with `errorToast: "Couldn't set the chat background."`, so the sole-operation framework rule owns the catch. A per-file probe cannot see the hook: the verifier's per-file run reports it as `W:79:catch`. The whole-program reader proves it owned. | Row and marker removed by `3d3df26151` |
| `admin-reset-password-dialog.tsx::ResetPasswordBody.submit::catch::1` | committed, not live | Same shape: a sole-operation `await resetPassword.mutateAsync(...)`, where `useResetPassword` carries a failure-valued `errorToast`. Per-file it reads `W:60:catch`; the whole program owns it. | Row and marker removed by `3d3df26151` |

- Before the rebase: 137 live, 0 unresolved, 140 committed. The three rows above are the whole gap, and no live site lacked a row.
- After the rebase: main's census has 137 client rows. All three rows above are gone, with exact totals. This lane edits no census row.
- On the rebased tree: 130 live, 0 unresolved, 137 committed. All 7 committed-not-live rows are in files that 1049 phase-3 shards edited after the census was last written:
  - `p3-01`, `34961a6f31`;
  - `p3-02`, `e753a06cf8`: "four redundant catches removed";
  - `p3-05`, `a74928875a`.
- The 7 rows:
  - `invalidation.ts::createInvalidation.invalidateFilters::deps.queryClient.invalidateQueries::1`
  - `use-card-frame.ts::useCardFrameSrc::pending::1`
  - `use-plugin-frame.ts::revokeFrameInBackground::revokePluginFrame::1`
  - `use-plugin-frame.ts::usePluginFrameSrc::pending::1`
  - `use-is-mobile-viewport.ts::useShellContentPrimacyObserver::document.fonts.ready::1`
  - `rpg-game-tab.tsx::ResyncControl::onResync::1`
  - `rpg-populate-control.tsx::RpgPopulateControl::onFill::1`
- The per-file verdicts on those files are identical on main `97b639a30d`, on Part 1 and on Part 3. They are stale census rows on main, not a lane effect. Primary's census regeneration removes them.

## Headroom pass (lane cb-1098b, Part 3)

### The server slowdown, explained first

The 500 server files took 334 s after the Part 1 fixes, against 254 s on the refuted commit. Both runs used the in-process harness `cb-1098b-measure.ts`.

- A CPU profile at 300 files did not find the census join. The join is not on that path at all.
- It found linear `.find` scans in the replay reader: `type-observations-read.ts` `unions` and `definitions`. The cost is one scan per query. The Part 1 fixes walk more nodes, and that amplifies the quadratic cost.
- Turning the two Part 1 additions off made no difference: no alias handler positions gave 100 s, and no foreign bound aliases gave 100 s.
- Fix: index both tables by key, the same way `returns` and `signatures` already were. The result is verdict-neutral.

| 500 server files, in-process | Wall |
| - | - |
| refuted commit `ed935d3aef` | 254 s |
| Part 1 fixes | 334 s |
| Part 1 + indexed unions/definitions | 106 s |
| Part 3 (final) | 56 s |

### What was measured, and the choice

- The previous heap profile blamed checker instantiation. An instrumented run over 300 client files counted it directly (`cb-1098b-asked.ts`):
  - 20,100 nodes got a Type selector;
  - the caught-failure reader asked a Type question about 88 of them;
  - every one of the 88 sits in a value position: a call, a call argument, a return, a conditional branch, a member receiver or an element key.
- Two causes:
  - The closure asked `type-details` at every walked node.
  - Capture-time `symbolAt` typed every node whose symbol was asked (`type: nodeType(node)` on the node row). Nothing ever read that type: the replay reads only `symbol` from a node row. Of the 20,100 typed nodes, 13,068 were outside any reader position.
- Choice: option (b), because a symbol lookup is what the reader needs at every walked node, while a Type answer it needs only at 88. Option (a) would have narrowed the symbol lookups instead. The reader reads binding identity at arbitrary positions (a `throw err`, a guard), so (a) would have turned many real verdicts into unknowns.

### The change

- `closureTypedPositions` (closure questions only; set by `caught-failure-native.ts`) asks Type details only where `readerTypedPosition` (`bounded-closure.ts`) holds:
  - every call;
  - a value in a call argument, a return, an arrow body, a conditional, an initializer, a member or element receiver, an element key, or a `+` operand;
  - through any parentheses, `as`, `satisfies`, `!` or `await` around it.
- Symbols are still answered at every walked node.
- A walked node outside those positions is recorded on the replay. A Type selector miss on it is `ClosureBoundError` (`ClosureFrontier.selectorMiss`), so it becomes an explicit unknown, never a guess.
- `fixture-path` does not set the flag and keeps typing every walked node.
- The node row no longer carries an eager Type: contract, zod, coverage and capture all drop it. A symbol is resolved without typing the node. Full `pnpm check:policy-conformance` holds: 146 policies, 2,401 rows, 0 failures.
- The finite claim is stated in the header of `caught-failure.ts`, in the `closureTypedPositions` field doc, and on `readerTypedPosition`.
- Red-first planted cases: `caught-failure-type-plan.test.ts`, "a Type question at a value position the plan does not type is past the bound". It covers every newly untyped position class: a `&&` operand, a template span, an array element, a `new` argument, a shorthand property, a `!` operand and a `typeof` operand.
  - Each must read `unresolved` through the production plan.
  - A call argument and an `as` receiver must still read `resolved`.
  - Red on `c5be18d7d8`: the `&&` operand read `resolved`, a guessed answer. Green now.
  - A gate-level row for these positions is not constructible. No reader in the caught-failure family asks a Type question there; that is the census above, which found 0 asked nodes off the rule. So the claim is pinned at the floor, where a future reader that starts asking there gets an unknown, not a guess.

### Results

Single-program runs: one at a time, under `heavy.lock`, `setsid`, `timeout -s TERM -k 30` on the group, `/usr/bin/time -v`, and a tree-RSS sampler. Harness: `cb-1098b-census.ts`. It derives the way `deriveCaughtFailureSites` does, but lists unresolved sites instead of throwing.

| Run (tree) | Wall | Worker peak RSS | Tree peak | Sites | Unresolved |
| - | - | - | - | - | - |
| client, refuted commit (first lane) | 26:20 | 16.75 GB | 19.7 GB | 137 | 0 |
| client, Part 1 (before the rebase) | timeout at 30:00 | 16.83 GB | 17.20 GB | n/a | n/a |
| client, Part 3 (before the rebase) | 10:59 | 14.28 GB | 16.05 GB | 137 | 0 |
| client, Part 3, rebased on `97b639a30d` | 8:59 | 14.67 GB | 17.39 GB | 130 | 0 |
| db, Part 1 | 0:57 | 2.63 GB | 4.07 GB | 2 | 0 |
| db, Part 3 rebased | 0:37 | 2.68 GB | 4.04 GB | 2 | 0 |
| server, Part 1 | timeout at 30:00 | 4.40 GB | 7.18 GB | n/a | n/a |
| server, Part 3 rebased (measured with a 3600 s ceiling) | 14:03 | 13.06 GB | 13.02 GB | 173 | 0 |

- GB here is KiB / 10^6, as the first lane reported it. In GiB, the rebased client worker is 13.99 GiB and its tree is 16.59 GiB.
- The client worker finishes 2 GiB under the 16 GiB heap cap. The tree figure adds the parent process, which holds the ts-morph workspace: about 2.7 GB.
- The server finished inside the shipped 30-minute group timeout. The 3600 s ceiling was a measurement allowance only.
- CI stage: these derivations are the `ledgers:fresh` stage (`tooling/src/verify/lib/registry.ts`: group `structure`, `STATIC` tiers, `pnpm check:ledgers-fresh`). The caught-failure census is one of its two ledgers.

### The D328 census of sites that moved to unresolved

- Client 0, db 0, server 0 unresolved sites on the final tree. No site moved from a concrete finding to unresolved in any of the three programs.
- The only designed move is the cross-file global bind alias, `mustPass` "D328 PAST THE BOUND ... global script". No live site in these three programs has that shape.
- Server diff against its committed rows: 16 live ids without a row and 11 rows not live. The per-file verdicts for every such file are identical on main `97b639a30d`, Part 1 and Part 3. They come from files that 1049 phase-3 shards edited after the census was written:
  - `p3-10`, `ab17ffbf95`;
  - `p3-12`, `8bac4fa3fd`;
  - `p3-14`, `cc7b6cc04e`;
  - `974a32b239` (infra and plugin-host);
  - `2f466df58d`.
- Those findings are main's own, not a lane effect. The 16 live sites are real unwaived findings on main.

### The 1085 cohort harness, rerun

The 1085 harness `cb-1085-cohort.ts` was used unchanged. Single program, under the lock.

| Cohort | Tree | Selectors | Relations | Wall | Peak RSS |
| - | - | - | - | - | - |
| db | lane | 214,716 | 74,661 | 1:00 | 1.84 GB |
| db | main `97b639a30d` | 214,716 | 74,661 | 1:23 | 1.86 GB |
| server read-parsed | lane | 2,486,992 | 1,914,048 | 7:17 | 8.15 GB |
| server read-parsed | main `97b639a30d` | 2,486,992 | 1,914,048 | 8:43 | 8.28 GB |

- The counts are identical, so the node-row and typed-position changes are neutral for the ordinary cohorts.
- The rise against the first lane's numbers (178,492 and 2,342,474) is main's own change since then.

### Item 1112 (policy-soundness-family real corpus)

- The real-corpus arm (`policy-soundness-family.suite.repo.int.test.ts`, the `runPolicyPass({ knownPolicies: FAMILY, ... project ... })` call) passes no `nativeTypeFacts`.
- `policy-fixture-substrate` is a `types` policy. Its first native request therefore refuses in `policy-pass-context.ts` `nativeFacts` with `POLICY_PASS_REFUSALS.nativeTypeContextAbsent`. That happens before any closure question is planned or read.
- No change in this lane reaches that refusal, so it neither causes 1112 nor fixes it. The test was not run (whole-workspace).
- The likely fix is in the test: pass `...nativeTypeFactOptions(projectCtx(repoRoot))`, as `native-failure-tracing-delivery.int.test.ts` does.

### Checks run (lane cb-1098b, final tree)

| Check | Result |
| - | - |
| per-gate conformance (`verifyPolicyProofs`), rebased | ownership 77/37/0, census-row 4/3/0, health 4/4/0, detached-work-traced 8/12/0, policy-fixture-substrate 17/14/0 |
| `pnpm check:policy-conformance` (all rows, in memory, after the node-row change) | 146 policies, 2,401 proof rows, 0 failures |
| `pnpm test:scoped` on caught-failure-type-plan, caught-failure-bound, caught-failure-census-row, native-failure-observations, type-replay-admission, native-failure-classification | 19/19 |
| `tests/tooling/verify/ops/native-failure-tracing-delivery.int.test.ts` | 5/5 on the rebased tree, including the new generator-refusal test |
| Biome on every changed file | clean |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` under the lock | tooling PASS, root PASS |

- `caught-failure-census-row.test.ts` took 7.25 s while the box was loaded, against the 5 s vitest default, then 3.5 s on a quiet rerun. That suite runs two policies' whole proof sets, so it now carries `scaledBudget(30_000)`, per the node-test rule for proof-row loops.

## Verifier cb-1098v2 leg

Context: by owner ruling, `caught-failure-ownership` stays and stays bounded. Item 1139 deletes `caught-failure-census-row`, `caught-failure-ownership-health`, the population record, its generator and its `ledgers:fresh` derivation.

### The census-row matched-id hole, and the ownership gate

- **The defect.** census-row passes only the uncommitted live ids to `judgeableSiteIds`. A live id inside an unresolved site's ordinal series that happens to match a committed row is therefore judged clean.
- **Not fixed here.** Item 1139 deletes that gate.
- **The header claim.** `caught-failure.ts` claimed the census joins withhold the whole series. It now describes only what stays true for the ownership gate.
- **The ownership gate has no such hole.** It judges each nominee by itself (`caught-failure-ownership.ts`, `evaluate`). An unresolved verdict becomes that site's own analysis unknown. The ordinary-waiver engine binds waivers by authored position (carrier plus token), never by a census ordinal. So no other site's verdict or waiver changes when a neighbor is unresolved. There is nothing to fix.

### Handler spellings the reader unwraps

- **The defect.** `handlerPosition` checked the raw parent. These spellings were owned on the base but read as an explicit unknown on the branch:
  - `onErr as T`
  - `(onErr)`
  - `const h = (onErr)`
  - `Reflect.apply(p.catch, p, [onErr])`
  - `p.catch.apply(p, [onErr])`
- **The fix.** `handlerPosition` now reads the position through `wrappedValue`, the inverse of the reader's `unwrapExpression`. Both use one wrapper predicate in `floor/code-facts/expression-value.ts`. It reads `apply`-style handlers through `applyArgumentValues`, which `appliedRejection` (`caught-failure-promise.ts`) now uses too. The two readings cannot drift.
- **Red-first.** Five `mustPass` rows ("D328 HANDLER SPELLING") cover the spellings. A test in `caught-failure-bound.test.ts` asserts that none reports an unknown.
  - Red on `30d7fcc1e0`: all five reported "past the closure bound".
  - Green after the fix.
- A non-null `onErr!` is a finding on both trees, because the reader does not unwrap `!`. A three-alias chain stays unknown, as the bound expects.

### Open question for the re-measure: the parent process

- The client tree peak (17.39 GB) is about 2.7 GB above the worker (14.67 GB). The extra is the parent process.
- `projectCtx(root)` parses the whole repository's ts-morph workspace before the harness filters to one package, and the parent also holds the replayed tables.
- The census derivation that measured this is deleted in 1139. Whoever re-measures the surviving ownership gate's single-program run should decide whether the parent's workspace counts against the 16 GB bar.
