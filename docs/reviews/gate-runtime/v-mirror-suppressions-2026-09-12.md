---
kind: review
status: active
updated: 2026-09-12
---

# cb-v-mirror-suppressions — the three mirror policies (`aecbc6c6c`) and `suppressions` (`a33b2e339`)

**VERDICT: REFUTED — all four policies.** Every one passes `check:policy-conformance` and `gate:contract`
with zero rows of its own, and the substance of both conversions is sound: I RAN the §4.6 differential
neither commit supplied and it is clean in both directions with a planted control. What fails is the §5b
bar. `test-presence` and `test-presence-client` each carry FOUR narrowings no proof row holds — proven with
constructed fixtures that flip the verdict, not with an argument — the `suppressions` conversion ADDED two
live `diagnostic-legibility` findings and deleted a baselined spec without its `deletions` ledger row (the
live `monotonic-tests` gate reds on it in my own structure run), the new shared `lib/` door it added has
zero unit coverage and a reproducible site-ordering defect, the `mirror-index` §4.5 pin matrix is missing a
status I proved REACHABLE, and three headers name the wrong conversion parent while the fourth names no
legacy SHA at all.

## 1. What the four policies do on the real tree

`pnpm check:structure`, my worktree, run `agent-a6a13ad0d3d13521c-3517355-2026-09-12T15-19-20-682Z`, **exit 1**:

```
final policies: 246 ran · raw 1680 = waived 1197 + granted 206 + effective 277 (235 error, 42 warning)
  · 0 alarm(s) · 0 tool error(s) · 0 withheld
single-pass: ran 300/300 active gate(s) (54/54 legacy · 246/246 final) of 300 corpus file(s) — run COMPLETE
```

| policy | row | RAW → granted → effective | resource receipts |
| - | - | - | - |
| `test-layout` | `✗ test-layout (51)` · final hard/error · population 0 source · 8173 resource | 51 → 0 → **51** | `mirror-index:package-test: 6503` · `mirror-index:tooling-test: 2164` |
| `test-presence` | `✓` · final hard/error · population 1598 source · 6503 resource | 0 → 0 → **0** | `mirror-index:package-test: 6503` |
| `test-presence-client` | `✓` · final hard/error · population 1555 source · 6503 resource | 0 → 0 → **0** | `authored-text#1: 46` · `mirror-index:package-test: 6503` |
| `suppressions` | `✓` · final reviewed-grant/error · population 7497 source · 0 resource | 65 → **65 granted** → **0** | — |

`test-layout`'s 51 are **NOT a conversion defect** — see §2. The `suppressions` population is 7497 today
against the header's 7,484 at conversion; that is tree growth since 2026-09-12 morning, not a port error.

## 2. §4.6 — the differential nobody ran, run

`aecbc6c6c`'s message states a §4.1 cut census, an instrument control and a marker census, and **says
nothing about a conversion differential**; `grep -in 'differential|§4.6|replay'` over the commit body
returns nothing, and `mirror-index-family.test.ts` contains no differential. That is #2000
non-compliance ("silence is no longer compliance"), so I built it.

Method: `git show 90bbeb04f:<path>` for each legacy module, planted as a SIBLING scratch module in
`tooling/src/verify/gates/` (so its relative imports resolve), driven through its own `gate.run(ctx)` over
`projectCtx(R)` on the real tree, with `test-presence.baseline.json` restored beside it so the legacy
ratchet arm had its ledger. Every planted file removed; `git status --short` empty.

| policy | legacy side | final side | verdict |
| - | - | - | - |
| `test-layout` | **51 findings** | **51 findings** | **symmetric difference ZERO, both directions** (`comm -23` and `comm -13` over the sorted path sets both empty) |
| `test-presence` | 0 findings · `scan={admitted:2, admittedRatified:0}` (the two baseline rows) | 0 findings, no ratchet | vacuity shape 1 for catch parity; the widening probe below is what carries it |
| `test-presence-client` | 0 findings | 0 findings | vacuity shape 1 |

**Planted positive control, both engines** (the differential's own falsifier): with
`tests/tooling/verify/vms-ghost-probe.test.ts` planted, the legacy replay goes 51 → 52 and the final policy
goes 51 → 52, both naming `no source for tooling/src/verify/vms-ghost-probe.ts`. So the equality above is a
measurement, not a pair of blind zeros. (My first attempt read final = 0 hits; the cause was MY instrument —
the planted legacy module was still in the gates dir and poisoned `loadMixedGateCorpus`. Corrected and
re-run clean.)

**So `test-layout`'s 51 real-tree findings are pre-existing baseline red**, identical on both sides: 50 are
`tests/tooling/verify/gates/*-family.test.ts` / `*-wave-*.test.ts` files whose `§4.7` twin
`tooling/src/verify/gates/<name>.ts` does not exist, plus `tests/tooling/verify/lib/bus-fact-relay.test.ts`.
Not this lane's defect; worth its own row elsewhere.

## 3. The retired `test-presence` baseline — where its two rows went

`test-presence.baseline.json` held exactly two rows
(`domain/chat/substrate/{assembly-access,turn-access}.ts`, 1 each). §12.5 allows a retiring baseline three
dispositions and this conversion used a FOURTH — **the demand was withdrawn by widening the exemption** —
declared in the header as a deliberate, orchestrator-approved widening. I re-derived its blast-radius claim
rather than reading it, with the §4.1 sibling-scratch-module harness (anchor asserted to occur EXACTLY ONCE
in the file, so a header/`why` quote cannot fake a clean cut):

| cut | claim | measured |
| - | - | - |
| `isPlumbingAtom`'s `Node.isSpreadElement` branch | "changes exactly TWO files, both domain, ZERO in entry/transport" | **exactly 2**, both `domain/chat/substrate/{assembly-access,turn-access}.ts`, zero elsewhere; `mustPass[15]` dies |
| `pushDomainResidual`'s `isPassThroughWiring(sf)` | "matches 11 files, 9 already tested" → 2 new findings | **exactly 2**, the same two files; `mustPass[15]` dies |

Both claims hold. The disposition is honest: these two rows were never a test anyone could write. It is
also the source of L6 below — the same widening MASKED two pre-existing pins.

## 4. `mirror-index` — the kind, and the refusal that is the whole point

`loadMirrorIndex` / `contract/resource-mirror.ts` were NOT touched by this commit (shipped at `899ec74a7`);
this conversion is the kind's first consumer set. `resolveResourceDeclarations` refusal, driven through
`runPolicyPass` in `mirror-index-family.test.ts` (11/11 pass, re-run by me):

| status | declaration | pinned? |
| - | - | - |
| `missing` | `mirror-index:package-test` (test space, source space) | YES — 3 rows |
| `missing` | `mirror-index:tooling-test` | YES |
| `empty` | `mirror-index:tooling-test` (bounded space, 0 files) | YES |
| `empty` | `mirror-index:package-test` | **NO** |
| `unresolved` | either declaration | **NO — and I proved it REACHABLE** |
| any | `authored-text` (`test-presence-client`) | **NO** — only the ready receipt is asserted |

The `unresolved` probe (a real `mkdtemp` tree with a symlink under `tests/`):

```
SYMLINK inside tests/: toolErrors=1 withheld=["test-layout"] findings=0
  population :: resource declaration mirror-index:package-test is unresolved: mirror family package-test
  test space tests: authored resource traverses a symbolic link: tests/ui/linked
```

All three module headers DECLARE this status ("a symlink anywhere on the walked path makes the tree
`unresolved` — a REFUSAL"). `docs/design/resource-policy-contract.md` obligation 6 requires **one pin per
declared resource per reachable status**. Row L4.

Also CONFIRMED, no defect: every declared resource is read only through `readyResourceValue`; no module owns
an executable not-ready branch; every receipt files `unresolved: 0` on a complete run; the family test's
`refusalShape` asserts all four axes as one object.

## 5. §4.1 — the cut battery (30 cuts, three rounds)

Harness: sibling scratch module, kebab-case id, anchor asserted unique, `verifyPolicyProofs` on the cut
module, `rmSync` in `finally`. **Instrument control first:** rewriting every `count: N` literal to
`count: 99` fails **every** `mustFlag` row in all four modules — `test-layout` 7/7, `test-presence` 18/18,
`test-presence-client` 11/11, `suppressions` 13/13. Every `count` is exact and load-bearing, and every
`mustFlag` row carries a numeric `expect.count` (0 rows without). One row in the corpus is bare-count-only
(`suppressions` `mustFlag[12]`, the scope split) and it is legitimate — the cut collapses 2 → 1.

RED (fence enforced, the named row dies):

| cut | dying rows |
| - | - |
| `test-layout` tooling `sourceDirectories` membership | `mustPass[7]` |
| `test-layout` package `srcExistsFor` dirIndex half | `mustPass[9]` |
| `test-layout` package `srcExistsFor` exact-file half | 9 rows |
| `test-layout` tooling dirIndex half | `mustPass[8]` |
| `test-layout` package suite-kind exemption | `mustPass[6]` |
| `test-layout` support/e2e exemption | `mustPass[0]` |
| `test-presence` tier `.d.ts` exemption | `mustPass[12]` |
| `test-presence` TIER pass-through exemption | `mustPass[8] [9] [11]` |
| `test-presence` `hasSchema` comment-blanking | `mustPass[3]` |
| `test-presence` server `index.ts` barrel skip | `mustPass[14]` |
| `test-presence` REAL_TREE_ANCHOR tripwire gate (REVERSE direction — opened, not cut) | 32 rows |
| `test-presence-client` `CLIENT_EXCLUDE_FILES` | `mustPass[7]` |
| `test-presence-client` direct-child fence | `mustPass[5]` |
| `test-presence-client` `UI_LOGIC_GROUPS` | `mustPass[8]` |
| `test-presence-client` `isStoreFile` comment-blanking | `mustPass[13]` |
| `test-presence-client` #883 `armed` fence | 19 rows |
| `suppressions` `scopeOf` → constant | `mustFlag[8] [12]` |
| `suppressions` `notUnder` captured-runtime fence | `mustPass[3]` |

CLEAN, classified (never counted — guide §4.1's three meanings):

| cut | individual | joint with the sibling that masks it | class |
| - | - | - | - |
| `test-layout` `MIRROR_MIN_SEGS` | CLEAN | RED (`mustPass[7] [10]`) with `sourceDirectories` | MUTUALLY REDUNDANT — and `mustPass[10]`'s `why` names it as the holder (L8) |
| `test-presence` `WIRING_ROOT_FILES` | CLEAN | RED (`mustPass[4] [5] [15]`) with the NEW domain pass-through | MUTUALLY REDUNDANT — created BY this conversion (L6) |
| `test-presence` `isFeatureRoot` depth | CLEAN | CLEAN (only `mustPass[15]` dies) | **UNENFORCED** (L5) |
| `test-presence` `isDeferredStubRunner` `!ENV_CALL` | CLEAN | CLEAN | **UNENFORCED** (L5) |
| `test-presence` `isErrorDeclarationOnly` `extends *Error` | CLEAN | CLEAN | **UNENFORCED** (L5) |
| `test-presence` `exportedCallables` class arm | CLEAN | CLEAN | **UNENFORCED** (L5) |
| `test-presence-client` `notNamed: ["index.ts"]` | CLEAN | — | **UNENFORCED** (L7) |
| `test-presence-client` `TYPE_ARGS` | CLEAN | — | **UNENFORCED** (L7) |
| `test-presence-client` `hasDirTest` registered-kind filter | CLEAN | — | **UNENFORCED** (L7) |
| `test-presence-client` clause-C `use*` const-arm exclusion | CLEAN | — | **UNENFORCED** (L7) |

**UNFALSIFIABLE is a claim you owe a row you WROTE AND RAN, so I wrote four** (same overlay, shipped module
vs cut module, both driven):

| constructed fixture | shipped | cut |
| - | - | - |
| `packages/client/src/data/index.ts` with a callable export, no mirror | 0 findings | **1** (`data/index.ts`) |
| `domain/tag/contract/holder.ts` exporting `class TagHolder extends Base` | **1** | 0 |
| `domain/tag/substrate/engine.ts` whose only export is a class | **1** | 0 |
| `state/counter.ts` action called as `bump<number>(1)` in its mirror | 0 | **1** |

Each is one `mustPass`/`mustFlag` row away from being pinned. These are UNENFORCED, not unfalsifiable.

## 6. `suppressions` — the authority migration, driven

Real tree, `knownPolicies:[suppressions]` (the non-suppressions `ordinary-waiver` alarms in that mode are
unknown-policy noise; the full-roster figure is `0 alarm(s)` from §1):

| arm | result |
| - | - |
| 65 shipped grants | `effective=0 granted=65` · **every `reviewedGrantConsumption.count === 1`** (distinct counts = `["1"]`) |
| CONTROL: 0 grants | `effective=65` — the population is real, not an empty read |
| PLANT an 8th `tests`-scope rule with no grant (`lint/nursery/vmsNeverRuledRule`) | `effective=1` — **no door, reds on sight** |
| PLANT a grant whose subject has no live site | `stale-reviewed-grant … was unused after a complete owner run` — the deleted STALE-RULE arm's successor is LIVE |

Grant-table shape: 65 rows = **46 `source` + 19 `tests`**. The legacy `RATIFIED_TEST_RULES` had **7** rows
(`useNamingConvention`, `noProcessEnv`, `noProcessGlobal`, `noBitwiseOperators`, `noExplicitAny`,
`useThrowOnlyError`, `@ts-expect-error`) — the census verifier's re-measurement, confirmed here against
`git show d23150315:…` — and **all 7 have a `tests`-scope grant**. `exception-authority-census.md:157` still
says 6 (L13). `suppressions-family.test.ts` (9 tests, re-run) is the strongest §4.3 set I have seen in this
program: intended row consumes once, wrong operation stays effective AND alarms stale, cross-file
aggregation names both sites, scope split is two identities, population fence with a mandatory in-population
anchor, and a shape tripwire on `authority`/`execution`/`family`.

Two things it does NOT hold, both real: the FILE-anchored door it depends on has no unit coverage (L9), and
the conversion left two live `diagnostic-legibility` findings behind (L1, measured below).

## 7. Marker census (§8 step 6) and coupled sites

`grep -rnE '@orb-gate-ignore[[:space:]]+(test-layout|test-presence|test-presence-client|suppressions)\b'`
over `packages tests tooling scripts docs .claude`: **3 hits, all three of them the modules' OWN header
prose** (which §8 step 6 excludes by name). **Planted positive control fired** on a scratch file with the
identical marker. `git grep` at `90bbeb04f`: **zero**. So legacy 0 = current 0 for all four ids — the
census claims hold, and the two ANCHOR MOVES (`test-presence`'s tripwires, `test-presence-client`'s #883
arm) orphan nothing.

- `grep -l` for the four ids as string literals across `tests/tooling/**`: only the two family tests. Broadened
  to bare substrings: `check-gates.repo.int.test.ts`, `verify/ops/run.int.test.ts`,
  `verify/lib/suppression-directive.test.ts`, `verify/gates/simple-visitors-wave-2.test.ts`,
  `verify/ops/ratchet-gate.test.ts`. **All five run green** (`pnpm test:scoped`, 5 files / 102 tests passed,
  560s — includes the `check-gates.repo.int` planter suite, run only after my structure leg finished).
- `pnpm debt` — exit 0, four sections (`density-tier`, `duplicate-action-doors`, `orphan-export-ratchet`,
  `ct-unfed-reads`), **zero mentions of `test-presence` or `suppressions`**. No dangling reader.
- `pnpm verify --list` — no stale presence/suppressions/baseline stage. `baseline --help` no longer offers
  `test-presence` or `suppressions`.
- `pnpm gate:contract` — exit 1 on the pre-existing legacy backlog, **zero rows for any of the four modules**.
- `pnpm check:policy-conformance` — `246 final policies · 2818 proof rows · 0 failure(s) · 206 grant rows
  (whole table) · 0 invalid`.
- `check:ledgers-fresh` — exit 1, one STALE row, and it is **`gate-runtime-read-first.md`'s generated SIZE
  column**, unrelated to this lane. `docs/test-baseline/manifest.json` derives FRESH (2649), which is exactly
  why L2 is invisible to that stage and visible only to `monotonic-tests`.
- `Core-Enforcement-Active-Gates.md` — both rows are rewritten as MECHANISMS, name no deleted helper except
  in the sentence recording its deletion, and state the `suppressions` trade in BOTH directions. No defect.
- Stale coupled docs: L12, L13, L14.

## 8. `diagnostic-legibility` — measured per module, legacy vs final (L1)

I drove the live `diagnostic-legibility` policy over a one-file virtual project holding the legacy text and
then the final text **at the same repo path** — same policy, same reader, same population; the only variable
is the module's own authored diagnostics. Planted control included.

```
suppressions LEGACY:          findings=1  (398:38)
suppressions FINAL:           findings=3  (162:3, 164:3, 184:3)     <-- +2
test-layout  LEGACY:          findings=1  (40:7)
test-layout  FINAL:           findings=1  (136:36)                  <-- carried, not new
test-presence LEGACY/FINAL:   findings=0 / 0
test-presence-client L/F:     findings=0 / 0
CONTROL pointerless plant:    findings=1  (1:23)
```

`suppressions`' `MESSAGE` (`…and both of those are reviewed grants, one per rule per scope.`) ends with no
doc or code pointer, and it is assigned at three `message`/`unreadableMessage` properties. The policy is
`ordinary`, so the door exists (`@orb-waive diagnostic-legibility(message)`); the conversion took neither
door. Constitution/doctrine: **gates land on a FIXED tree.**

## LEDGER ROWS (15 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `suppressions` | cb-v-mirror-suppressions L1 · `tooling/src/verify/gates/suppressions.ts:162,164,184` | the conversion ADDED 2 live `diagnostic-legibility` findings (legacy 1 → final 3, measured per module against the same path with a planted control), neither fixed nor waived; the policy is `ordinary` so a door existed | other (gates land on a fixed tree · §5b.2/3 message quality) | **OPEN** | end `MESSAGE` with `core/Spine-Testing.md`-style pointer (`docs/design/962-blanket-suppression-control-plane.md` is the natural one) so all three properties inherit it, or `@orb-waive diagnostic-legibility(message)` at each with a stated end condition |
| `suppressions` | cb-v-mirror-suppressions L2 · `docs/test-baseline/manifest.json:2255` | `a33b2e339` deleted `tests/tooling/suppressions.residual.test.ts` (195 lines) but left its row in the manifest `files` array and added no `deletions` entry; the live `monotonic-tests` gate reds on it in my structure run. `ledgers:fresh` derives the manifest FRESH, so that stage cannot see it | other (coupled site: test-baseline deletions ledger) | **OPEN** | add a `deletions["tests/tooling/suppressions.residual.test.ts"].why` naming the successor (`tests/tooling/verify/gates/suppressions-family.test.ts`) and which residual arms retired with the baseline, exactly as `aecbc6c6c` did for its two |
| mirror family | cb-v-mirror-suppressions L3 · `tests/tooling/verify/gates/mirror-index-family.test.ts:1` | no §4.6 conversion differential for any of the three mirror policies — not a committed test, and `aecbc6c6c`'s message never states one ran or what it found (#2000: silence is not compliance) | §4.6 differential | **OPEN** | land §2 of this report's measurement as the record, or commit the legacy-replay differential; `test-layout` legacy 51 = final 51 with symmetric difference ZERO and a planted control that moves both sides to 52 |
| mirror family | cb-v-mirror-suppressions L4 · `tests/tooling/verify/gates/mirror-index-family.test.ts:95` | the §4.5 pin matrix is incomplete: `unresolved` is unpinned for every declaration and is REACHABLE (driven — a symlink under `tests/` gives `resource declaration mirror-index:package-test is unresolved … traverses a symbolic link`), `empty` is unpinned for `package-test`, and `authored-text` has no refusal pin at all | §4.5 pin | **OPEN** | add three `runPolicyPass` pins to the family test using the existing `scratch` `mkdtemp` fixture — a `symlinkSync` arm for `unresolved` (one per kind), an `mkdirSync`-only `tests/` for `package-test` `empty`, and an `authored-text` refusal arm — each asserting the four-axis `refusalShape` |
| `test-presence` | cb-v-mirror-suppressions L5 · `tooling/src/verify/gates/test-presence.ts:214,228,268,384` | FOUR narrowings no row holds, individually AND jointly with the new pass-through clause: `isFeatureRoot`'s depth test, `isDeferredStubRunner`'s `!ENV_CALL` clause, `isErrorDeclarationOnly`'s `extends *Error` test, and `exportedCallables`' exported-class arm. Two discriminating fixtures constructed and RUN: a `contract/` file exporting `class X extends Base` and a `substrate/` file whose only export is a class each flag at tip and go silent under the cut | §4.1 narrowing | **OPEN** | four rows: a `mustFlag` for a `contract/` class not extending `*Error`, a `mustFlag` for a class-only `substrate/` file, a `mustFlag` for a `workloads/runners/` stub that returns `deferred: true` AND calls `ctx.env` (give it a non-pass-through body so the widening does not mask it), and a `mustFlag` for a nested non-root `service.ts` |
| `test-presence` | cb-v-mirror-suppressions L6 · `tooling/src/verify/gates/test-presence.ts:757,772` | `mustPass[4]`'s `why` claims "THE `isFeatureRoot` NARROWING" and `mustPass[5]` claims the `context.ts` exemption, and NEITHER dies when that fence is cut — both fixtures (`return { db: ctx.db }`, `return { db, now }`) are plumbing atoms, so the conversion's OWN new `isPassThroughWiring` clause in `pushDomainResidual` now acquits them. Only the JOINT cut reds them | §4.1 narrowing | **OPEN** | give `mustPass[4]`/`[5]` bodies the pass-through predicate rejects (a guard, a second statement, a computed argument) so the wiring-root fence is the only thing acquitting them, and correct both `why` strings to state the measured cut result |
| `test-presence-client` | cb-v-mirror-suppressions L7 · `tooling/src/verify/gates/test-presence-client.ts:205,317,240,176` | FOUR narrowings no row holds: the `notNamed: ["index.ts"]` population fence, `TYPE_ARGS` (whose header credits it with preventing four false REDs at #619), `hasDirTest`'s registered-kind filter, and clause C's `use*` const-arm exclusion. Two fixtures constructed and RUN: a `data/index.ts` with a callable export flags only under the cut, and `bump<number>(1)` in a mirror flags only under the cut | §4.1 narrowing | **OPEN** | four rows: a `mustPass` holding a logic-bearing `data/index.ts`, a `mustPass` whose mirror calls an action with explicit type arguments, a `mustFlag` whose mirror directory holds ONLY a `.test-d.ts`/`.spec.ts`, and a `mustPass` for a `use*`-prefixed exported const in a store file |
| `test-layout` | cb-v-mirror-suppressions L8 · `tooling/src/verify/gates/test-layout.ts:107` | `MIRROR_MIN_SEGS` is MUTUALLY REDUNDANT with the `sourceDirectories` fence — cut alone it is CLEAN, cut jointly it reds `mustPass[7] [10]` — while `mustPass[10]`'s `why` asserts "the §4.7 arm needs `tooling/<dir>/<file>` before it judges anything", i.e. names this clause as its holder. A flat file's `toolDir` always carries a test suffix, so no fixture can make it the deciding fence | §4.1 narrowing | **OPEN** | either delete the clause (the `toolDir === undefined` half stays; `sourceDirectories` independently holds `mustPass[7]`) or rewrite `mustPass[10]`'s `why` to record it as MUTUALLY REDUNDANT with the measured joint-cut result, guide §4.1's fourth outcome |
| `suppressions` | cb-v-mirror-suppressions L9 · `tooling/src/verify/lib/reviewed-grant-findings.ts:110` | `fileSiteList` dedupes and then sorts the RENDERED `file:line` strings with `localeCompare`, so a class with sites at lines 2 and 10 in one file names them out of order — driven: `site(s): packages/kit/src/sitesort.ts:10 (biome-ignore), packages/kit/src/sitesort.ts:2 (biome-ignore)`. The anchor is correct (it sorts numerically). The whole new exported door `reportReviewedGrantFileCandidates` has **0 references** in `tests/tooling/verify/lib/reviewed-grant-findings.test.ts`, whose five tests cover only the node door | other (shared `lib/` defect + missing mirror coverage) | **OPEN** | sort the file candidates numerically before rendering (reuse the `ordered` array `reportReviewedGrantFileCandidates` already computes) and add the door's own arms to the existing mirror spec — grouping, `note` rendering, the multi-file group, the cross-file anchor, and the all-unreadable message |
| mirror family | cb-v-mirror-suppressions L10 · `tooling/src/verify/gates/test-layout.ts:21` | all three mirror headers say "legacy at `90bbeb04f` (the parent of this conversion)"; the parent of `aecbc6c6c` is **`6b1d01be0`**, eight commits later. The four files are byte-identical between the two shas, so the cited BYTES are right and only the parenthetical is false — but §5b.5 asks for the legacy SHA as the conversion PARENT, and a reader diffing `<sha>^` gets the wrong tree | §5b.5 header | **OPEN** | replace the sha with `6b1d01be0` in all three headers (`test-layout.ts:21`, `test-presence.ts:54`, `test-presence-client.ts:25`), or keep `90bbeb04f` and drop the false "(the parent of this conversion)" gloss |
| `suppressions` | cb-v-mirror-suppressions L11 · `tooling/src/verify/gates/suppressions.ts:90` | the §5b.5 header carries FAMILY, POPULATION PORT, MARKER CENSUS and DECLARED LIMITS but **no legacy SHA** — a hand read over the whole header span finds no hex at all. The replay sha `02382639e` lives only in the commit message and in `reviewed-grants.ts`'s `why` strings | §5b.5 header | **OPEN** | add the conversion parent `d23150315` to the POPULATION PORT line (and note `02382639e` as the frozen-dispatcher replay sha if that is the one the differential used) |
| `test-presence` | cb-v-mirror-suppressions L12 · `docs/architecture/core/Spine-Testing.md:106` | LAW doc still states the #767 residual population "rides a shrink-only DEBT ratchet (`tooling/src/verify/gates/test-presence.baseline.json`, enumerable with `pnpm debt`); it is another lane's named burn-down". All three are deleted — driven: `pnpm debt` exits 0 with four sections and zero `test-presence` mentions. `test-presence.ts`'s own header cites this doc as its law | other (coupled site: law doc) | **OPEN** | replace the paragraph with the landed outcome: the ratchet is retired (#2062), the two rows were correctly UNDEMANDED by the PASS-THROUGH shape exemption the #773 tier arm always had, and the demand is now held by the policy's own `mustPass[15]`/`mustFlag[16]` |
| both | cb-v-mirror-suppressions L13 · `docs/reviews/gate-runtime/exception-authority-census.md:36,37,135,139,157` | this `status: active`, read-in-full tier-4 doc now carries five rows describing DELETED artifacts with no landed-disposition note (`suppressions` 274 file rows / 572 occurrences · `test-presence` 2 debt rows · `test-presence.baseline.json` tied to #772 · `suppressions.baseline.json` 27 burnable · `suppressions.ts:46,201`), and `:157` additionally still says "6 test rule classifications" where the legacy table had **7** and all 7 migrated. Neither commit touched it, though the doc's §2 shows in-place correction is its established practice | other (coupled site: live-law review doc) | **OPEN** | add a dated LANDED note on each of the five rows naming the conversion commit and the disposition, and correct `:157` to 7 source-table-mirrored test rules now carried as 19 `tests`-scope grants |
| `suppressions` | cb-v-mirror-suppressions L14 · `docs/design/962-blanket-suppression-control-plane.md:212` | this `status: active` design doc's live "Coupled sites" list still names `ops/gen/suppressions.ts`, `suppressions.residual.test.ts`, "the baseline" and "`debt.ts`'s `why` prose" as sites to maintain; all four are deleted | other (coupled site: design doc) | **OPEN** | replace the Ledger line with the reviewed-grant surface (`lib/reviewed-grants.ts` rows · `lib/reviewed-grant-findings.ts`'s file door · `tests/tooling/verify/gates/suppressions-family.test.ts`) and note the ratchet's retirement date |
| `test-presence-client` | cb-v-mirror-suppressions L15 · `tooling/src/verify/gates/test-presence-client.ts:97` | `CLIENT_EXCLUDE_FILES = ["data/trpc.ts"]` was carried forward verbatim with **no rename/deletion liveness** (board #2103 re-derived: still true after `aecbc6c6c`). Guide §12.4: "Sanctioned homes are exact reviewed grants with rename/deletion liveness, never population subtraction." If `packages/client/src/data/trpc.ts` is renamed or deleted the subtraction silently rots and the header's stated reason survives as a lie. The header calls it "POPULATION VOCABULARY, not grants", which is the classification the ruling forbids for a single named FILE | §4.3 grant | **OPEN** | either migrate the one row to a reviewed grant keyed `(subject: "packages/client/src/data/trpc.ts", operation)` so central `stale-reviewed-grant` holds its liveness — which splits an arm to `reviewed-grant` and needs a `-health`-style decision — or add a hard liveness arm that reds when the excluded path is absent from `mirror.sourceFiles`, pinned by a `mustFlag` row |

## WHAT I DID NOT COVER

- **The 51 pre-existing `test-layout` real-tree findings were not filed as a row.** They are identical on
  both sides of the differential (legacy 51 = final 51) so they are not this conversion's defect, but they
  are 51 live `hard`/`error` findings on `main` — 50 `tests/tooling/verify/gates/*-family|wave*.test.ts`
  files with no `§4.7` source twin plus `tests/tooling/verify/lib/bus-fact-relay.test.ts`. Whether the right
  fix is a `.suite.test.ts` rename wave or a §4.7 exemption for family tests is an orchestrator call, not
  mine. The other four `monotonic-tests` findings (`owner-scoped-{reads,upserts,writes}.test.ts`,
  `verify/ops/structure-mixed.int.test.ts`) predate both commits and belong to other lanes.
- **I did not replay `suppressions`' 16 legacy proof examples** through the frozen legacy dispatcher. The
  commit message states that differential and its one classified delta, which #2000 accepts; I verified the
  classified delta's shape is the one the module's `mustFlag[10]` pins (`count: 1`, both coordinates, both
  tokens) but did not re-run the replay. Its population differential I did not re-derive either — the
  header's 7,484-on-both-sides is a 2026-09-12-morning measurement and the tree is 7,497 today.
- **No `no-blanket-suppression` re-derivation.** The `suppressions` header cites a standing refusal for its
  sibling (arm C reads the git index); read-first §2 records the same, so I took it as current law rather
  than re-deriving the arm.
- **`authored-text`'s per-call receipt semantics** I confirmed only through the family test's ready arm and
  the structure receipt (`authored-text#1: 46`); I did not probe what happens when a demanded path is absent,
  so L4's `authored-text` cell names the missing pin without proving that status reachable.
- **No `--push` tier, no CT, no e2e.** Nothing in either diff reaches a browser surface; the four policies'
  behavioural tier is `tests/tooling/**` node suites, which I ran.
- **`pnpm check` as a whole** I did not run — only its `structure`, `policy-conformance`, `gate:contract`,
  `ledgers-fresh` and `debt` stages, plus the named node suites. The structure leg was serialized on the
  orchestrator's GO and is the one whole-tree verdict in this report.
