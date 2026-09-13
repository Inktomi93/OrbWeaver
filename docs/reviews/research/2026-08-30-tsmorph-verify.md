---
kind: review
status: draft
updated: 2026-08-30
---

# Verification of the ts-morph speedup study (#887) — the diagnosis holds, the PLAN is mis-ranked and one item is unsound

Lane `cb-tsmorph-verify`, 2026-08-30, on `main` @ `f1db99834`. Read-only on the tree; every measurement
below was produced in this session by scratch scripts in the session scratchpad (§7). The study under
review is `docs/reviews/research/2026-08-30-ts-morph-speedups.md` (measured on worktree `wt/nate-research`
@ `7f574337a`).

## 0. Verdict in five lines

1. The **diagnosis is CONFIRMED** — the stage really is two-thirds of `pnpm check`, the bus-coverage family
   really is ~37% of it, the quadratic re-walk is real, and the token-kind cliff is real and mechanically
   explained by ts-morph source.
2. The **plan's ranking is wrong**. Item **B alone delivers item A's entire win**, measured: the bus family
   drops 74.0s → 2.5s with **byte-identical findings** and zero edits to `lib/bus-coverage.ts`. A is
   redundant work on the hottest file in the fleet.
3. Item **B's stated soundness premise is REFUTED** ("files are immutable during `runPass`, no gate
   manipulates"). Two live scratch-project doors reuse ONE `SourceFile` identity across differing texts, and
   one of them calls `getDescendantsOfKind`. A `WeakMap<SourceFile>` memo there returns **forgotten nodes
   that throw**. The fix is one word: key on **`sf.compilerNode`**, proven sound here.
4. Item **C is not a drop-in** and would make gates **more permissive**: raw `ts.forEachChild` misses
   **1,698 identifiers** repo-wide (all inside JSDoc) that `getDescendantsOfKind(Identifier)` returns.
5. The **60–90s landing is optimistic**. B alone lands the stage at **~150s** (from ~262s). The residual is
   six named gates, not the bus family. And **even a 60s stage leaves pre-commit at ~3 minutes** — the
   lefthook header's "~30s" is a **13× understatement today** and stays a lie after any §4 outcome.

## 1. Per-claim verdicts

### Claim 1 — "`structure:full` costs ~290s of a ~470s `pnpm check`" — **PARTIAL (true instance, unrepresentative number)**

`reports/verify-history.jsonl`, last 25 `scope:whole` `tier:static` runs (all 186 history rows are
`whole/full`; there is not one scoped row on record):

| | min | median | max |
| - | - | - | - |
| `structure:full` | 205,056ms | **256,559ms** | 324,259ms |
| whole-run total | 321,701ms | **385,352ms** | 589,486ms |

`structure:full` is a median **66.6%** of the run (range 48.4%–74.8%). The study's 290,050ms / 457,756ms is
the `af3fd5c81` run at 17:28 — a real datapoint at the **75th percentile**, not the middle. The honest
headline is **~257s of ~385s**. The `f5d019e0c` run the study cites as "the last real check" (307,308ms)
is the second-highest of the 25.

Two facts the study never states and that the plan depends on:

- **Stages run strictly sequentially.** For the newest run, `sum(stages) === totalMs` to the millisecond
  (382,906 = 382,906). So stage savings are pure subtraction from the hook's wall clock, and stage
  *parallelism* is an unexplored lever (§5).
- **Non-`structure:full` static stages cost a median 128,793ms on their own.** That is the floor no §4 item
  touches.

Variance across a single day is ±25% around the median. Any ratchet on this number (§4 D) must budget for
that; see §4.

### Claim 2 — the attribution (bus family ≈ 114.5s / 39%; visit tier ≈ 10s; the top-gate table) — **CONFIRMED in shape, PARTIAL in absolutes**

Independently re-derived (`cbtv-profile.ts`: real `getWorkspace` + `loadGateCorpus` + `runPass`, every
descriptor's `begin`/`visit`/`visitFile`/`run`/`finalize` wrapped in an `hrtime` accumulator; 233 gates
loaded, 233 active, 233 results, 0 tool errors):

| Phase | study (292.6s pass) | **this session (245.1s pass)** |
| - | - | - |
| `run` | 199.0s | **160.8s** (82 gates) |
| `visitFile` | 57.4s | **53.8s** (35 gates) |
| `begin` | 20.0s | **16.9s** (54 gates) |
| `visit` | 10.2s | **8.1s** (129 gates) |
| `finalize` | 0.4s | **0.4s** |
| harness remainder (the shared walk + dispatch) | 5.6s | **5.2s** |
| **bus-coverage family (5 gates)** | 114.5s = **39%** | **91.5s = 37.3%** |
| top-10 share of hook time | 66% | **65.6%** |

Every phase reproduces at 0.80–0.85× the study's absolute, uniformly — i.e. the same run at lower machine
load, not a different distribution. **The percentages are the durable claim; the absolute milliseconds are
not.** The top-gate table reproduces with minor reordering (`caught-failure-ownership` 11.7s vs 12.5s,
`freeze-provenance-write-pairing` 12.8s vs 15.2s, `bus-coverage` 49.3s vs 61.7s); the identity and shape
(`run`-heavy vs `visitFile`-heavy vs `begin`-heavy) of every top-20 row matches.

The study's "the single-pass design is doing its job; the cost is in code that opted out of it" is
**CONFIRMED**: the shared walk + all 129 `visit` gates together are **13.3s of 245.1s (5.4%)**.

### Claim 3a — `isCanonicalVariableBinding` re-walks the whole file per candidate×emitter — **CONFIRMED, by source AND by measurement**

Source: `tooling/src/verify/lib/bus-coverage.ts:108` runs `sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)`
over the entire file, and is reached from `:234` `[...emitterNames].find((name) => isCanonicalEmitterExpression(...))`
— a fresh `new Set()` seen-guard **per emitter name**, so nothing is shared across the 7 `CHAT_BUS_EVENT_TYPES`
emitters. `objectExpressions` (`:186-189`) repeats the same whole-file sweep per identifier argument.
`callDiscriminators` (`:259`) drives it from every `CallExpression` in emit scope.

Measurement (`cbtv-fixA.ts` — the five bus gates' real `run` hooks, same Project, `getDescendantsOfKind`
memoized per `(node, kind)`):

```
UNPATCHED run #1 (cold node-wrap cache): 84487ms
UNPATCHED run #2 (warm): 73951ms
MEMOIZED run:                            2501ms
memo: hits=152888 misses=3461 hitRate=97.79%
speedup 29.6x   saved 71450ms
findings IDENTICAL (warm vs memoized): true
```

**97.79% of the calls were repeats of a sweep already performed.** That is the quadratic, quantified.

### Claim 3b — the `useParseTreeSearchForKind` token-kind routing — **CONFIRMED verbatim from ts-morph 28.0.0 source**

`node_modules/.pnpm/ts-morph@28.0.0/node_modules/ts-morph/dist/ts-morph.js:5799`:

```js
function useParseTreeSearchForKind(thisNodeOrSyntaxKind, searchingKind) {
    return searchingKind >= common.SyntaxKind.FirstNode && searchingKind < common.SyntaxKind.FirstJSDocNode
        && getThisKind() !== common.SyntaxKind.SyntaxList;
```

consumed at `:3990/:3994/:3998` to choose `_getCompilerForEachChildren()` (cheap) vs `_getCompilerChildren()`
(`ExtendedParser.getCompilerChildren` — full token materialization). Kind numbers read from the installed
package: `FirstNode=167`, `FirstJSDocNode=310`; `Identifier=80`, `StringLiteral=11`,
`NoSubstitutionTemplateLiteral=15` (all below 167 → expensive path); `CallExpression=214`,
`VariableDeclaration=261`, `PropertyAccessExpression=212`, `YieldExpression=230` (cheap path). Exactly as
the study states.

Micro-benchmark reproduction (`cbtv-micro.ts`, fresh Project per arm, whole 6,213-file corpus):

| Arm | study | **this session** |
| - | - | - |
| A `getDescendantsOfKind(CallExpression)` | 2.55s / 359,215 | **2.01s / 359,329** |
| B `getDescendantsOfKind(Identifier)` | 18.2s / 1,565,284, **+4.2GB** | **19.5s / 1,566,028, +1.56GB** |
| C `forEachDescendant` + kind filter | 8.6s | **8.35s** |
| D raw `ts.forEachChild` + kind filter | 0.34s | **0.186s** |

Timings CONFIRMED. The **+4.2GB heap figure did NOT reproduce** — I measured `heapUsed` delta of +1.56GB.
The cliff's *direction* and *magnitude in time* (105× vs arm D) are solid; treat "4.2GB" as unverified.
A second, smaller discrepancy: the study's "1.35s warm" for arm A did not reproduce — my warm re-sweep was
**slower** than cold (3.11s vs 2.01s). Both are load-sensitive; neither changes any conclusion.

### Claim 3c — "no gate manipulates during `runPass`, so a `WeakMap<SourceFile>` memo is sound" — **REFUTED**

The premise is true of the *workspace* Project and false of the harness as a whole. Two `lib/` doors build
scratch Projects and **re-`createSourceFile` at a fixed path with `overwrite: true`**:

- `tooling/src/verify/lib/comment-spans.ts:89` — path `comment-scan.tsx`, overwritten on **every call**;
  reached from `lib/gate-ignore.ts` and `gates/test-presence-client.ts`.
- `tooling/src/verify/lib/config-static-read.ts:138` — path = the config's `rel`; and **`:158` calls
  `sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)` on that SourceFile.** Callers:
  `gates/eslint-grant-liveness.ts:92`, `gates/depcruise-grant-liveness.ts:104`.

`createSourceFile(..., { overwrite: true })` **reuses the `SourceFile` JS object** and forgets its old
descendants (`cbtv-overwrite.mjs`):

```
SourceFile object identity reused across overwrite: true
memo call1: [ 'alpha' ]
same obj? true
memo call2 (would be STALE if identity reused):
  [ 'THREW:Attempted to get information from a node that was removed or …' ]
```

So a `WeakMap<SourceFile, Map<SyntaxKind, Node[]>>` layered over `config-static-read.ts:158` returns
forgotten nodes on the **second** read of the same config path. Within one `runPass` the two grant-liveness
gates read two different `rel`s, so it is latent there — but `verifyGateProofs` and the `tests/tooling`
suites call `runPass` many times per process, re-reading the same `rel`, which makes it **reachable**. And
the plan's own enforcement gate (`no-raw-descendants-of-kind`, `scanRoot = tooling/src/verify/**`) is what
would *force* that site through the memo. The plan as written ships the bug it enables.

**The fix is one word.** `sf.compilerNode` identity is NOT reused across an overwrite (`cbtv-key.mjs`):

```
SourceFile identity reused:   true
compilerNode identity reused: false
compilerNode-keyed memo call1: [ 'alpha' ]
compilerNode-keyed memo call2: [ 'beta', 'gamma' ]     ← correct
```

Key the WeakMap on `sf.compilerNode` and B is sound unconditionally — no carve-out, no gate exemption, no
`runPass`-boundary reset needed (a stale entry becomes unreachable when the compiler node is replaced, and
the WeakMap releases it). GATE-AUTHORING.md §5 already names this "overwrite-identity trap"; the study did
not connect it to its own proposal.

**No other manipulation exists.** `ast-grep -l ts tooling/src/verify` (scannedFileCount=**303**;
`-l tsx` scannedFileCount=**0**, so the tree is `.ts`-only and the single-language sweep is complete):
`replaceWithText` 0, `addStatements` 0, `insertStatements` 0, `formatText` 0, `removeText` 0,
`insertText` 0, `replaceText` 0, `forgetNodesCreatedInBlock` 0; `createSourceFile` 3,
`addSourceFileAtPath` 3, `addSourceFilesAtPaths` 1. Positive control: the same instrument returns
**229** for `getDescendantsOfKind` — matching the study's count exactly.

### Claim 4 — "A (−110s) + B/C lands the stage in the 60–90s band" — **PARTIAL; the split is wrong and the band is optimistic**

The decisive measurement (`cbtv-fullmemo.ts` — the **whole 233-gate pass**, three runs on one Project:
unpatched cold, unpatched warm as the control, then memoized; every gate's findings **and** `scan` record
fingerprinted and diffed):

```
PASS 1 (unpatched, cold wrap cache): 252217ms  gates=233  toolErrors=0  heap=5.96GB
PASS 2 (unpatched, warm) — the CONTROL: 223008ms  gates=233  toolErrors=0  heap=6.20GB
PASS 3 (MEMOIZED):                     77401ms  gates=233  toolErrors=0  heap=6.24GB
memo hits=279248 misses=117767 hitRate=70.34%
top memoized kinds (kind:hits): 261:151915 214:42543 212:9940 172:8033 11:7072 …
WALL: control(warm)=223008ms  memoized=77401ms  saved=145607ms  (65.3%)

SELF-CONTROL (pass1 vs pass2, both unpatched): IDENTICAL across all 233 gates
MEMO SOUNDNESS (control vs memoized):          IDENTICAL across all 233 gates
```

Kind `261` is `VariableDeclaration` with **151,915** cache hits — the bus-coverage quadratic, top of the
list. Kind `214` is `CallExpression`.

> **The findings-diff instrument carries a planted positive control** (`cbtv-control2.ts`), because my
> *first* control came back blind and I do not get to report an "IDENTICAL" from an unproven instrument:
>
> ```
> PLANT 1 (drop last element)         -> differing: domain-events-coverage, rpg-bus-coverage, user-bus-coverage
> PLANT 2 (VariableDeclaration=empty) -> differing: user-bus-coverage
> RESTORED (negative control)         -> differing: NONE (correct)
> ```
>
> (The first attempt planted a *kind-blind* memo, which is a legitimate no-op for gates that ask one kind
> per node — instrument fine, plant unreachable. Declared limit: the control was run on 3 gates, not 233;
> the fingerprint mechanism is the same code path for all.)

**Re-priced, within-harness (the only fair comparison):**

| | pass wall | stage estimate |
| - | - | - |
| today, profiler harness | 245.1s | ~257s median (`verify-history`) |
| **+ B (memo), profiler harness, cold** | **138.3s** | **~148s** |
| + B (memo), fullmemo harness, warm caches | 77.4s | (best case, not a cold-run number) |

So **item B alone buys ~110s off the stage** — and it needs **zero** changes to `lib/bus-coverage.ts`, i.e.
item **A is subsumed**. Post-B the bus family is **3.4s = 2.5% of the pass** (`cbtv-profile-memo.ts`,
memo keyed on `compilerNode`), and `contract-verb-presence` falls 14.2s → 1.7s,
`freeze-provenance-write-pairing` 12.8s → 2.5s, both for free.

The **residual after B** is a different set of gates entirely, and it is what the 60–90s band actually
requires:

| gate | post-B | shape |
| - | - | - |
| suppressions | 19.4s | `run`, `getDescendants()` per file (§3.2) |
| knob-wire-coverage | 11.1s | `run`, Identifier sweeps + per-node `getType()` |
| no-test-fabrication | 9.8s | `visitFile`, `getDescendants()` |
| test-presence-client | 9.0s | `run` (via `comment-spans` blanking) |
| caught-failure-ownership | 8.5s | `visitFile` |
| dangling-refs | 7.8s | `run` (second whole-project walk + its own `new Project`) |
| gate-ignore-inventory | 6.3s | `visitFile` |
| detached-work-traced | 6.1s | `begin` |
| brand-in-name-position | 5.2s | `visitFile`, double full-text split |

Top-9 residual ≈ 83s of the 138s pass. **B + fully solving all nine** would reach the 60–90s band; B + the
tractable half of them lands ~110–120s. The study's "A + B/C ⇒ 60–90s" is directionally right and
arithmetically optimistic.

### Claim 5 — item C, the raw-node token helper ("18.2s → 0.34s") — **the timing is right; the SEMANTICS are REFUTED**

Arm B and arm D do not return the same set. Over the whole corpus, `getDescendantsOfKind(Identifier)`
returns **1,566,028** and raw `ts.forEachChild` returns **1,564,330** — a gap of **1,698**, in the
`getDescendantsOfKind`-only direction on every one of the differing files (`cbtv-gap.ts`; the raw walk never
found an extra).

The gap is **JSDoc**. `ts.forEachChild` does not descend into JSDoc nodes; the token path does. Receipts:
`tests/support/db.ts:175` = `{@link countingClient}`; `tests/support/wire-ready.ts:11` = `{@link WireReady}`;
`tests/client/components/face-strip.fixtures.tsx:21,23,25` = `@defaultValue` tags.

This matters because it fails in the **permissive** direction: a liveness/reference gate re-pointed at the
raw helper stops seeing `{@link X}` as a reference to `X`, and reports a false clean on exactly the dynamic
seam the doctrine says ships with its lens. `dangling-refs` and the `test-presence*` family are the
candidates. **C is a per-gate judgement call — "does this gate want JSDoc identifiers?" — not a mechanical
migration, and it must never be enforced by a blanket gate.**

### Claim 6 — the §4 E "don'ts": load-tier work is pointless — **CONFIRMED**

`getWorkspace({root})` measured at **3,315–3,720ms** for 6,213 files (study: 4.9s) — **1.3–1.5% of the
pass**. `skipLoadingLibFiles`/`useInMemoryFileSystem` tuning is correctly ruled out. Likewise the
"parallelize the walk" don't: the shared walk + dispatch is **5.2s** (harness remainder), confirmed. Raw
walk baselines also confirmed: 4,686,614 compiler nodes in **176–189ms** (study 0.28s / 4,683,319).

## 2. Scoped-verify compatibility — **COMPATIBLE, and item A is worthless there**

How scoped reaches the gates: `lib/registry.ts:175-183` gives `structure:full` a
`scopedArgv: (sel) => sel.checkScopeArgv`, which `lib/selection.ts:27` resolves to
`node tooling/src/verify/cli.ts scoped …` → `ops/scoped.ts`. `runScopedPass` (`ops/scoped.ts:165-176`)
builds the **full** workspace via `projectCtx(root)` and then narrows only `ctx.files`; `partitionGates`
(`:129`) runs the `incremental-safe` gates and **defers every `scopeSafety: "whole-project"` gate wholesale**.

Live receipt (`node tooling/src/verify/cli.ts scoped --scope packages/ui/src/primitives/button`):

```
check:scope — folder packages/ui/src/primitives/button · 3 file(s) in scope
… 234 gate lines …
  ⚠ 102 whole-project gate(s) DEFERRED
EXIT=0 wall=10990ms
```

- **All five bus-coverage gates are `scopeSafety: "whole-project"`** (`bus-coverage.ts:45`,
  `user-bus-coverage.ts:36`, `automation-bus-coverage.ts:46`, `rpg-bus-coverage.ts:44`,
  `domain-events-coverage.ts:39`) — so they are **already deferred** at every scoped tier. **Item A buys a
  scoped run exactly zero.** Item B buys whatever the 131 incremental gates spend on `getDescendantsOfKind`
  over the scoped fileset — small at 3 files, larger for `--package`.
- A scoped run costs **11.0s total** including the ~3.5s full-workspace load. There is no scoped-run
  performance problem to fix.
- **Memo behaviour is identical under scoping.** `SourceFile` (and `compilerNode`) identity is stable within
  a Project; scoping changes only which files the pass iterates. Nothing invalidates.
- **Conformance is already safe, by prior art.** `ops/conformance.ts:63-77` `loadInMemoryExample` gives every
  example a **unique virtual root** (`exampleSeq`) and removes the previous example's files, precisely
  because "a re-created SourceFile restarts its script version" corrupted the language service. So the
  many-passes-over-synthetic-projects pattern **never reuses a `SourceFile` identity**, and a memo — on
  either key — is sound there. `runFsBackedExample` (`:118`) builds a fresh `new Project` per example.
  Removed SourceFiles become GC-eligible, so the WeakMap does not retain them.
- **Hazards, named:** (1) the `createSourceFile(overwrite)` identity reuse of §1 claim 3c — solved by the
  `compilerNode` key; (2) `runPass`-scoped cache *reset* as the study proposes is **not** a substitute for
  the right key, and is actively worse — it would still be stale *within* a single pass at
  `config-static-read.ts:158` if two configs shared a path, and it needlessly discards a warm cache across
  the conformance suite's 1,461 examples; (3) memory: the memo added **+0.04GB** to a 6.20GB peak
  (117,767 cached lists), so it is not a heap risk under the 16GB floor — but it must not be applied to
  arm-B token kinds *and* held for the life of a long-lived process, since those lists are the 1.5M-node ones.

## 3. Lefthook compatibility — **no wiring changes, and the header is lying today**

`lefthook.yml`: `pre-commit` → `pnpm check`; `pre-merge-commit` → `pnpm check` (same body, the 2026-08-01
non-conflicted-auto-merge hole); `pre-push` → `pnpm verify --push`; `post-checkout` → the deps bootstrap.
`package.json:101` `check` = `nice -n 19 node tooling/src/verify/cli.ts run --static`. **None of the §4
items touches any of this** — they are all inside the `structure:full` stage's own process. Confirmed
compatible.

**The header lie is real.** `lefthook.yml` (pre-commit bullet) says the static bundle is "**~30s**". Measured
over the last 25 whole static runs: **median 385s, min 322s, max 589s**. That is a **13× understatement**,
and it materially misinforms anyone reasoning about commit cadence. Flagging it as a separate fix
regardless of what happens to §4.

Wall-clock arithmetic (stages are strictly sequential, proven in §1 claim 1, so this is addition):

| scenario | `structure:full` | pre-commit / pre-merge-commit total |
| - | - | - |
| **today (median)** | 257s | **385s ≈ 6m25s** |
| **+ B only** (measured 138.3/245.1 ratio applied) | ~148s | **~274s ≈ 4m34s** (−29%) |
| + B + C + the §3.2/§3.5 residual, realistic | ~110s | **~239s ≈ 4m00s** |
| + the study's optimistic floor | 60s | **~189s ≈ 3m09s** |

`pre-push` (`verify --push`) adds `deps:orphan-ratchet` + `tests:node` + `e2e-smoke` + `quality:cpd` on top
of the static bundle (~16–17 min total per doctrine), so it absorbs the same subtraction: **−110s off a
~17-minute push, ~11%**. Structure is not the push tier's problem.

**The load-bearing consequence: even the best §4 outcome leaves pre-commit above 3 minutes,** because the
non-structure static stages cost a median **129s** on their own (`ledgers:fresh` 25s, `lint:biome` 19s,
`docs:catalog` 15–18s, `types:packages` 11–12s, `tests:execution-membership` 7–10s, `imports:depcruise`
7–9s, `deps:knip` 5–7s, the rest under 7s). If the felt pain is "commits are slow", §4 is half the answer.

## 4. The improved plan

**B′ — memoize `getDescendantsOfKind` per `(compilerNode, kind)` behind ONE harness helper. P1, −110s.**
This is the whole recommendation. Measured: 223.0s → 77.4s on the full pass (−65.3%), byte-identical
findings and `scan` records across all 233 gates, +0.04GB heap. **Key on `sf.compilerNode`, never on `sf`**
(§1 claim 3c) — that single choice is what makes it sound under the scratch-project doors, and it removes
the need for the study's `runPass`-boundary reset entirely. No per-`runPass` reset; no cache invalidation
to reason about.

**A — DROP IT.** Subsumed by B′ with zero edits to `lib/bus-coverage.ts` (74.0s → 2.5s, findings identical).
Hand-indexing the fleet's most safety-critical shared lib for a win B′ already delivers is pure risk.
*Unless* a follow-up wants the last 3.4s, which is not worth touching that file for.

**Migration gate — SCOPE IT DOWN, and only after B′ has landed and a full `pnpm check` is green.** A blanket
`no-raw-descendants-of-kind` over `tooling/src/verify/**` is what turns the scratch-project hazard into a
shipped bug, and it also captures `lib/comment-spans.ts` and `lib/config-static-read.ts`, whose whole job is
to hold a *deliberately* reused scratch SourceFile. Either exempt those two files with a cited reason, or —
better — make the helper itself the only door and let the `compilerNode` key make the exemption unnecessary.
Per doctrine the gate ships with a planted positive control in both directions and a committed pin.

**C — DEMOTE to per-gate, never a blanket migration. P3.** The 105× timing is real; the semantics are not
equivalent (1,698 JSDoc identifiers, §1 claim 5), and the divergence is in the permissive direction. Do it
only where a gate's author states "JSDoc identifiers are out of scope for this check", one gate at a time,
each with a before/after findings diff. It is worth roughly 20–30s of the post-B′ residual, concentrated in
`suppressions` (19.4s) and `no-test-fabrication` (9.8s) — both of which use `getDescendants()` (no kind), a
shape B′ does not help.

**D — per-gate timing in the artifact: KEEP. Ratcheting the TOTAL: DROP.** The per-gate/per-phase table is
straightforwardly worth it (`reports/check-structure.json` carries no timing at all today, which is why this
went dark for months) and the `guard()` wrapper is exactly the right seam — my profiler is that wrapper.
But **do not ratchet the total**: measured same-day variance is 205s–324s, a **±23% band around the median**,
so a total-ratchet either sits so loose it catches nothing or flakes on load. Ratchet the *right* thing
instead: a **per-gate budget alarm** next to `zeroScanGates` (a `⚠` when one gate exceeds, say, 8s), which is
load-proportional across the whole run and so far more stable than an absolute total. And the artifact must
record `scope` alongside the timings — a scoped run's numbers are not comparable to a whole run's.

**E — new, and bigger than C: stages run SEQUENTIALLY.** Proven in §1 claim 1 (`sum(stages) === totalMs`
exactly). `lint:biome`, `lint:eslint`, `docs:catalog`, `docs:format`, `deps:knip`, `imports:depcruise` and
the three `structure:*` small stages are mutually independent processes with no shared state. Running the
non-`structure:full` static stages *concurrently with* `structure:full` would hide most of that 129s floor
behind the long pole — worth **~100s at today's numbers and ~60s post-B′**, i.e. more than item C, for
scheduler work in `ops/run.ts` rather than gate surgery. Caveats to price first: the 16GB heap floor is
per-process, several stages are already multi-process (`types:packages` is `pnpm -r`), and the box is
co-hosted — this needs a concurrency cap, not a fan-out. Not recommended blind; recommended as the next
thing to *measure*.

**F — parallelizing the `run` phase across workers: still DON'T.** The study rules this out for the walk
(correctly, 5.2s). The `run` phase is 73.8s post-B′ across 82 independent gates, which looks tempting — but
they share one ts-morph Project, so a worker fan-out means N× a 3.3s load and N× ~1GB, and several gates
carry cross-gate module state (`gateIgnoreUses` in `pass.ts:177`). Confirming the study's instinct with the
numbers it did not take.

## 5. Declared limits

- All timings were taken on a **shared, loaded box** (load-avg 5.4–11.1 through the session, sibling lanes
  and at least one full `pnpm check` running concurrently — `reports/verify.json` changed under me mid-run).
  Every absolute millisecond carries ±25% at least; **every ratio and every findings-diff is load-immune and
  is what I am actually asserting.**
- The whole-pass memo results are from an in-process **monkey-patch of `Node.prototype.getDescendantsOfKind`**,
  not from an implemented helper. It is an upper bound on B′'s win and a sound test of B′'s *correctness*;
  the real implementation's overhead (one WeakMap lookup per call site) is not measured but is bounded by the
  70.34% hit rate.
- The findings-diff positive control was planted against **3 gates**, not all 233 (§1 claim 4). The
  fingerprint code path is identical for all.
- I did **not** re-verify the study's §1 web-research table (ts-morph releases, `tsgo-wasm`, TypeScript 7.0)
  or its §5 (`pnpm ast` / codemod consumers). Out of scope for this lane; the §1 table's conclusions do not
  depend on anything I measured.
- The `+4.2GB` heap figure for arm B and the `1.35s warm` figure for arm A are the two numbers that did not
  reproduce; neither is load-bearing for any recommendation.
- I did not run `pnpm check` or `pnpm test` (brief-forbidden). The B′ correctness evidence is the 233-gate
  findings-and-scan diff, not a gate-suite run.

## 6. Method and reproducibility

Scratch scripts, session scratchpad, prefix `cbtv-` (untracked, outside the repo):

| script | what it does |
| - | - |
| `cbtv-profile.ts` | the §2.2/§2.3 re-derivation: real `getWorkspace` + `loadGateCorpus` + `runPass`, every descriptor hook `hrtime`-wrapped |
| `cbtv-profile-memo.ts` | same, with `getDescendantsOfKind` memoized on `compilerNode` — the post-B′ table |
| `cbtv-fullmemo.ts` | 3 full passes (cold / warm control / memoized), full findings+scan fingerprint diff |
| `cbtv-fixA.ts` | the bus-coverage family in isolation, unpatched vs memoized, hit/miss census |
| `cbtv-control2.ts` | the planted positive controls for the findings-diff instrument |
| `cbtv-micro.ts` | §2.4 arms A/A2/B/C/D on fresh Projects |
| `cbtv-gap.ts` | the arm-B vs arm-D identifier set difference and its JSDoc attribution |
| `cbtv-overwrite.mjs`, `cbtv-key.mjs` | the `createSourceFile(overwrite)` identity probes |

All run as `nice -n 19 node --max-old-space-size=16384 <script> > <log> 2>&1`, one at a time, exit 0, logs
read in full. Zero tool errors in every `runPass`; every pass reported `gates=233 active=233 passResults=233`.

Negative-claim receipts: `ast-grep run -l ts tooling/src/verify --inspect summary` → `scannedFileCount=303`
(and `-l tsx` → `scannedFileCount=0`, so the tree is `.ts`-only), positive control = 229 hits for
`$X.getDescendantsOfKind($$$A)`.
