# 1098: caught-failure type plan and the bounded closure

## Outcome

Item 1098 is not closed. The client caught-failure derivation now completes: 137 sites in 26:20.

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
| type-observation-questions.ts | 853 | 844 |
| type-observations-coverage.ts | 989 | 972 |
| type-observations-read.ts | 554 | 501 |
| type-observations.ts | 873 | 873 |

- `bounded-closure.ts`: the frontier and walked set (`closureFrontier`), `symbolBodies`, the walk, and handler hops.
- `type-observation-nominations.ts`: which raw-question kinds may carry facets and closure nominations.
- `type-observations-replay-usage.ts`: the replay's unasked-row checks, moved verbatim.
- The live capture reader no longer stubs `closureFrontier`; the field is optional.
- Splitting these files further toward the 450-line cap is still owed.
