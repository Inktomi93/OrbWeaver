---
kind: review
status: active
updated: 2026-08-31
---

# The gate pass costs 121s because 110 gates decline the shared walk — and dispatch is free

Lane `cb-tsmorph-perf`, 2026-08-31, worktree at `fd31bf645`. Every number below was measured in this
session on this worktree; the method and its declared limits are §6. This extends
`2026-08-30-ts-morph-speedups.md` (the diagnosis) and `2026-08-30-tsmorph-verify.md` (its verification),
and it **changes the recommendation both of them landed on**.

## 0. The verdict in five lines

1. `structure:full` reproduces at **300.8s** on today's tree (236 gates, 6,294 files) — up from the
   \~257s median those studies measured, because the corpus and gate count grew.
2. **Item B′ confirms and is under-priced**: the `(compilerNode, kind)` memo takes the pass to
   **137.1s**, findings and scan records byte-identical across all 236 gates, proven with a
   two-direction planted control. That is **−164s**, not the **−110s** #888 states.
3. **But 69% of B′'s win is five gates sharing ONE lib** (`lib/bus-coverage.ts`), and eight gates carry
   89%. The win is concentrated, not broad — which changes how it should ship.
4. **The real finding is structural.** 129 gates that ride the shared walk cost **8.8s combined**; the
   110 that decline it cost **121s**. Adding **15.8M extra dispatches** to the shared walk cost **nothing
   measurable**. Dispatch is free; re-walking is the entire bill.
5. So the fix is not a memo. `contract/gate.ts` already says *"a gate never walks anything itself"* —
   **the unified model is existing law that 110 gates violate**, and enforcing it deletes the repeats
   instead of caching them, making B′ unnecessary.

## 1. The measured stack

All arms are the real `runPass` over the real corpus. Findings + `scan` records fingerprinted per gate
and diffed against baseline.

| arm | pass | heap | findings |
| - | - | - | - |
| baseline | 300.8s / 277.6s (two replicates) | 7.94GB | — |
| + B′ memo `(compilerNode, kind)` | 137.1s / 134.0s | 8.02GB | identical, 236/236 |
| + `getDescendants` → `forEachDescendant`, 4 gates | **115.7s** | **6.59GB** | identical, 236/236 |

**−62% wall and −1.35GB heap with zero verdict change.**

Memo hit rate 70.21%, and hits/misses were identical to the digit across all four memo runs
(285,647 / 121,186) — the cache is deterministic, not load-dependent.

### 1.1 The instrument was proven before its clean result was believed

A findings-diff that has never caught anything is not evidence. The control matrix:

| arm | differing gate records |
| - | - |
| PLANT 1 — memo drops the last element of every cached list | **36** |
| PLANT 2 — memo returns `[]` for `VariableDeclaration` | **5** (bus-coverage, bus-definition-belts, contract-verb-presence, freeze-provenance-write-pairing, user-bus-coverage) |
| PLANT 0 — negative control, memo correct | **0** |
| the real memo | **0** |

## 2. B′'s win is concentrated in one lib

Per-gate delta, baseline vs memoized (full dump, not a truncated top-N):

| gate | base | memo | saved | cum |
| - | - | - | - | - |
| bus-coverage | 53.7s | 1.9s | 51.8s | 37% |
| user-bus-coverage | 20.3s | 0.7s | 19.6s | 51% |
| automation-bus-coverage | 12.5s | 0.6s | 11.9s | 59% |
| contract-verb-presence | 14.2s | 2.5s | 11.7s | 68% |
| freeze-provenance-write-pairing | 13.3s | 2.5s | 10.8s | 75% |
| domain-events-coverage | 6.8s | 0.3s | 6.5s | 80% |
| knob-wire-coverage | 13.2s | 6.7s | 6.5s | 85% |
| rpg-bus-coverage | 6.8s | 0.3s | 6.5s | 89% |

**The five `lib/bus-coverage.ts` gates alone are 96.4s = 69% of the entire win.** Fourteen gates give
99%.

Three gates got measurably **slower** under the memo, consistently across both replicates:
`test-presence-client` −2.4s, `no-nul-bytes-in-source` −2.0s, `dangling-refs` −1.9s. `dangling-refs`
explains itself — it builds **its own `new Project`**, so its nodes are never cache hits and it pays
pure allocation. A global memo is not free for every gate.

## 3. Where the time goes at the API level

Every hot ts-morph call attributed to the gate that made it, on the memoized pass (130.2s of gate wall):

| api | calls | ms | **ms/call** |
| - | - | - | - |
| `getDescendantsOfKind` | 406,833 | 25,030 | 0.06 |
| **`getDescendants()` (kind-less)** | **12,394** | **24,182** | **1.95** |
| `forEachDescendant` | 30,041 | 11,084 | 0.37 |
| `getSymbol` | 124,057 | 7,844 | 0.06 |
| `getType` | 55,920 | 6,385 | 0.11 |
| `getText` | 3,013,396 | 1,161 | \~0 |
| `getFullText` | 17,072,962 | 516 | \~0 |

`getDescendants()` costs as much as `getDescendantsOfKind` from **33× fewer calls** — 32× more per
call, because kind-less traversal takes ts-morph's token-materializing path
(`useParseTreeSearchForKind`, `ts-morph.js:5799`). All of it sits in five gates.

Two attribution corrections to earlier reads of this data:

- **`findReferencesAsNodes` records ZERO calls.** The `caught-failure-ownership:1340` call site exists
  but is never reached on this corpus. Any claim that it dominates that gate is wrong.
- **`detached-work-traced`'s 33 `getSymbol()` calls cost 4,459ms — 135ms each.** That is the one-time
  Program/binder construction, charged to whichever gate touches the type graph first. It is a fixed
  cost of the run, not a defect in that gate.

## 4. Item C resolved per gate, by measurement

`2026-08-30-tsmorph-verify.md` demoted item C to P3 because raw traversal misses 1,698 JSDoc
identifiers, failing in the permissive direction. Correct — and this repo uses TSDoc heavily
(**1,309 `{@link` uses**; 12 gate/lib files read doc comments), so the risk is real rather than
theoretical.

But the risk is narrower than the demotion implies: **reading TSDoc is not the same as needing the
traversal to enumerate it.** A gate reading comments via `getFullText()` or `getJsDocs()` is unaffected.
Swapping `getDescendants()` for `forEachDescendant` and diffing all 236 gates:

| gate | `getDescendants` cost | verdict |
| - | - | - |
| `no-test-fabrication` | 8.8s | **safe** — findings identical |
| `ct-no-oneshot-live-read-assert` | 2.8s | **safe** (reads doc comments, but by text) |
| `domain-freshness-plane` | 2.2s | **safe** |
| `test-presence-client` | 1.4s | **safe** |
| `suppressions` | 5.9s | **UNSAFE** |

`suppressions` gains 4 findings and drops `admitted` 313 → 311. It loses nothing and *gains* false
"stale baseline" reds, because `// biome-ignore` markers live in **comment trivia** that `forEachChild`
never traverses, so the gate concludes its budgets are unearned. The failure is loud rather than silent
only because that gate's stale arm happens to catch it.

## 5. THE STRUCTURAL FINDING: dispatch is free, re-walking is not

Phase totals on the memoized pass:

| phase | gates | cost |
| - | - | - |
| **`visit`** (rides the one shared walk) | 129 | **8.8s** |
| `visitFile` | 35 | 46.4s |
| `run` | 82 | 75.0s |

The 110 gates with a `run` and/or `visitFile` hook, classified by what they reach for:

| class | gates | cost | heaviest |
| - | - | - | - |
| TARGETED (re-walks each file itself) | 44 | 39.1s | no-test-fabrication, caught-failure-ownership |
| SWEEP-ONLY (`getSourceFiles()`) | 28 | 29.2s | knob-wire-coverage, brand-in-name-position |
| FS-ONLY (disk reads) | 26 | 20.4s | suppressions, gate-ignore-inventory |
| SWEEP+FS | 9 | 18.0s | css-family-ownership, test-presence-client |
| OWN-PROJECT (`new Project`) | 3 | 9.9s | dangling-refs |

### 5.1 The marginal subscriber costs nothing

30 synthetic no-op gates were added subscribing to the five hottest kinds (`CallExpression`,
`Identifier`, `VariableDeclaration`, `PropertyAccessExpression`, `StringLiteral`):

```
extraGatesPerKind=6  extraGates=30  dispatches=15,808,944
RUNPASS 274258ms  gates=266  toolErrors=0     (baseline same rig: 277649ms, gates=236)
```

**15.8 million additional dispatches did not make the pass slower.** The cost is bounded by run-to-run
variance, so under \~0.3µs per dispatch. The shared walk already pays the traversal and the kind lookup
for every node; another subscriber only extends an inner loop.

### 5.2 Therefore the unified model, which is already the law

`contract/gate.ts` opens with: *"The ONE interface every single-pass gate module exports. A gate never
walks anything itself — it declares the SyntaxKinds it wants + a per-node predicate, and the runner
(pass.ts) feeds it via one shared walk."* And `_shared/ts-workspace.ts`'s `collectByKinds` is that
primitive, with its own recorded ruling against materializing kind maps ("holding 1.4M wrapped nodes
alive is a memory cliff — dispatch happens DURING the streaming walk").

So the unified system is not something to adopt. **It is documented law that 110 gates violate**, and
B′ — a `Map<SyntaxKind, Node[]>` cache — is in tension with that recorded ruling. (The ruling survives;
its input changed: it governs EAGER full materialization, while the memo is lazy and demand-driven at a
measured +0.08GB. But that reconciliation is only needed if the memo ships at all.)

**One method, stated:** a gate declares `kinds`, receives nodes through `visit`, and correlates in
`finalize`. `begin`/`run` shrink to non-AST input (baseline JSON, docs, disk globs) — which is file I/O,
not a second traversal method.

Under that model the repeats do not exist, so **B′ is unnecessary and no second mechanism has to be
learned, enforced, or remembered.**

## 6. Method, and what is NOT claimed

Scratch scripts, session scratchpad, prefix `cbtsm-` (untracked, outside the repo — the repo root is
linted and `scripts/**` is inside `harnessGlobs`, so an in-tree scratch file either trips biome or joins
the corpus it is measuring):

| script | what it does |
| - | - |
| `cbtsm-profile.ts` | real `getWorkspace` + `loadGateCorpus` + `runPass`, every hook `hrtime`-wrapped; optional prototype memo |
| `cbtsm-control.ts` | the planted positive/negative control matrix for the findings diff |
| `cbtsm-api.ts` | attributes every hot ts-morph API call to the gate making it |
| `cbtsm-desc.ts` / `cbtsm-combined.ts` | the `getDescendants` swap, all gates and then trivia-gate-excluded |
| `cbtsm-dispatch.ts` | the marginal-subscriber measurement (§5.1) |
| `cbtsm-stages.mjs` | the #889 stage-overlap arms |

- **Load.** Every arm ran on a shared box at load 3.6–16.3 with a sibling lane live. **Absolute
  milliseconds carry ±25%; the ratios, the findings diffs and the call counts are what is asserted.**
  Baseline and treatment arms were always run back-to-back to share load conditions.
- **The memo arms are a prototype patch on `Node.prototype`, not an implemented helper.** Unlike the
  prior study's framing this is NOT merely an upper bound: the patch pays the full WeakMap + Map lookup
  on all 406,833 calls, which is exactly what a `ctx` helper would pay. The remaining unmeasured delta is
  one function-call frame.
- **The dispatch measurement (§5.1) is a bound, not a point estimate.** The treatment arm came back
  3.4s *faster* than baseline, which is noise; the claim is only that 15.8M dispatches cost less than
  variance.
- **`getFullText` memoization was tested and is a dead end** — 17,066,364 hits at 99.96%, and the pass
  ran 5s *slower*. `getFullText()` is already O(1). The prior study's §3.5 cost is the `.split("\n")`
  and regex gates run ON the text, which no text cache can touch. First attempt returned
  `hits=0 misses=0` because `SourceFile.prototype` shadows `Node.prototype.getFullText`; that zero was
  an instrument failure, not a result, and is recorded here so nobody re-derives it as one.
- **#889 (stage overlap) was measured and is worth \~43s, not \~100s** — see §7. Not pursued further by
  owner ruling.
- **I did not run `pnpm check` or `pnpm test`.** The correctness evidence is the 236-gate
  findings-and-scan fingerprint diff with its control matrix, not a suite run.

## 7. #889 measured, then parked by owner ruling

Two shapes, both on warm caches:

- **Small stages against each other (cap 3):** wall 53.2s → 45.0s, only **−8.2s**, while CPU time went
  53.2s → 104.5s and load hit **16.34**. biome/tsc/eslint/depcruise are already internally parallel, so
  concurrency mostly time-slices the same cores. `types:packages` 10.4s → 29.0s.
- **The actual #889 shape — small stages beside `structure:full`, cap 2:** wall **322.4s → 279.2s
  (−43.2s)**, the small stages hiding entirely behind the pole, which paid only **+11.4s (+4%)**. Load
  settled at 4.78.

Real but worth \~43s on the 6 stages measured (of \~16), and worth less once the pole shortens.
**Owner ruled 2026-08-31 not to pursue stage overlap.** Recorded here so the measurement is not redone.

## 8. Incidental findings

- **`scripts/worktree-bootstrap.sh` aborted silently after `pnpm install`.** `git worktree list |
  awk '…{exit}'` SIGPIPEs git once the worktree count makes the porcelain output exceed the pipe
  buffer, and `set -euo pipefail` turns that into an exit-141 that skips the `.env` link and the
  agent-memory links. A manually created worktree therefore looked provisioned (deps present) while
  every lane in it booted with an empty memory index. Fixed in this lane.
- **`css-family-ownership`, which landed 2026-08-31 in `edb05900e`, entered the fleet as the 4th most
  expensive gate** (15.6s baseline, 9.1s memoized) with 20,721 `getSymbol()` calls. New gates are
  adding to this bill.
- **`pass.ts:walkFile` reimplements `_shared/ts-workspace.ts:collectByKinds`** rather than calling it —
  same loop, plus the scanRoot/guard additions.
