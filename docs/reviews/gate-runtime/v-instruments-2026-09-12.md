---
kind: review
status: active
updated: 2026-09-12
---

# `cb-v-instruments` — fresh-context verifier verdicts for seventeen #1584 board rows

**Tree: `a182d1fab`** (`docs(playbook): Phase D is authority migration now…`), worktree
`.claude/worktrees/agent-ae4ea4395d28ba7ca`, branch `wt/agent-ae4ea4395d28ba7ca`, working tree CLEAN
throughout except this file. Every number below was produced by a command in this session; nothing is
re-quoted from a lane report, an issue body or a design doc.

## The two instruments the whole wave rests on

| instrument | result | exit |
| - | - | -: |
| `pnpm -s gate:contract` | `421 finding(s) across 297 gate module(s)` · **60 legacy** (modules carrying `descriptor-wrapper`) / **237 final** | 1 (baseline) |
| `pnpm -s check:policy-conformance` | `237 final policies · 2594 proof rows · 0 failure(s) · 131 grant rows · 0 invalid · 33162ms` | **0** |
| `pnpm -s check:structure` (the mandated real-tree leg) | `final policies: 237 ran · raw 2220 = waived 1177 + granted 131 + effective 912 (857 error, 55 warning) · 0 alarm(s) · **0 tool error(s)** · **0 withheld**` · `297/297 active gate(s)` · run COMPLETE | 1 (baseline) |

`check:structure` artifact:
`reports/runs/structure/agent-ae4ea4395d28ba7ca-2557378-2026-09-12T12-38-49-179Z/check-structure.json`.
Its `policy.authority.verdict` reads **`{"errors":857,"warnings":55,"blocking":857,"failOnWarnings":false}`** —
which is #2025's default-false claim, measured on the real tree rather than argued.

Run posture: the leg was taken on the orchestrator's explicit serialized "GO", alone, `pnpm -s` with no
`timeout` wrapper, after both fixture-planting `.repo.int` suites had FINISHED (structure was in fact run
BEFORE them in wall-clock order — strictly safer than the briefed order, since a planter cannot contaminate a
run that already completed).

## Verdicts

| board row | verdict | the measurement |
| - | - | - |
| **#1969** | **PARTIAL** | the `conformance.int.test.ts` half is CONFIRMED; the coupled `policy-conformance-stage.int.test.ts` half (`4c2c6daa6`) was BUMPED, which is what the issue said not to do, and its explanatory comment is now false |
| **#1974** | **CONFIRMED** | both re-pointed carriers are legacy TODAY; the suite runs 21 passed / 1 failed and the single failure is #2043 |
| **#1975** | **CONFIRMED** | `test-determinism` = **0 effective / 23 waived** on the real tree, under a planted positive control; the two real `Date.now()` sites were INJECTED, not waived |
| **#1978** | **CONFIRMED** | `policy-waiver-spelling` = **0** violations on the real tree, with a planted fix-less ordinary policy taking it 0 → 1; 5 sampled `fix` strings check out against their own `report.node` call |
| **#1986** | **CONFIRMED** | both new `plugin-dump-guard` rows die under my own planted break, one each |
| **#2007** | **CONFIRMED** | the differential is NOT vacuous: both engines report the SAME 4 live sites, and a planted overlay takes both to 6 |
| **#2025** | **CONFIRMED (door) · Needs owner (the open half)** | every default false, verified in source AND in the artifact; the open half is a DECISION and the doc undercounts it |
| **#2040** | **CONFIRMED, and it exposed a NEW defect** | `contract-banned-shapes.ts:287` IS now judged (SHARED arm); worklist 11 → **50**; three of the 35 new TAUTOLOGY rows are FALSE POSITIVES on #2041's own rows |
| **#2041** | **CONFIRMED** | 10 modules carry a literal-disjoint `messageIncludes`, 2 recorded NOT-APPLICABLE with the construction attempted; throw-probed 3, each reaching exactly ONE row |
| **#2030** | **CONFIRMED** | throw probes reproduce the lane's arm census exactly, and the planted-lookalike row DISCRIMINATES |
| **#2037** | **PARTIAL** | the plant's SHAPE matches installed `@types/node@26.1.1` byte-for-byte; the "**both branches** are exercised" claim is **REFUTED** |
| **#1951** | **CONFIRMED** | both planted-break claims reproduced by my own cut |
| **#1960** | **CONFIRMED** | both planted-break claims reproduced by my own cut |
| **#1963** | **CONFIRMED** | the §8.6 per-file reconciliation closes **14 = 14 = 14** across 9 files, zero `current < legacy` |
| **#1958** | **PARTIAL** | ARM E flags `getType`/`getSymbol` (planted positives, plus a negative control); it does NOT flag `ctx.checker()` — that half is a RUNTIME throw, a different tier |
| **#1991** | **CONFIRMED** | four message constants, three disjoint needles, a per-arm `messageIncludes` on every `mustFlag` row |
| **#1994** | **PARTIAL** | **8 of 9**, not 9 — `no-array-literal-querykey` still has no family test |

### Ready rows — closed on the tree, or not

| row | on the tree |
| - | - |
| #2040 | **closed on the tree** (with a new defect it created — see LEDGER ROWS) |
| #2041 | **closed on the tree** |
| #2030 | **closed on the tree** |
| #2037 | **NOT closed** — the shape fix landed; the "both branches" claim it also made is false in two files |
| #1951 | **closed on the tree** |
| #1960 | **closed on the tree** |
| #1963 | **closed on the tree** |
| #1958 | **closed on the tree** for the arm it actually built; the brief's `ctx.checker()` clause was never ARM E's job |
| #1991 | **closed on the tree** |
| #1994 | **NOT closed** — 8 of 9; the ninth is routed to #1993 by its own issue body |

## The evidence, row by row

### #1969 — the shrinking legacy floor

`tests/tooling/verify/ops/conformance.int.test.ts:417-433` replaces `compared > 1000` with a property.
Read in full. It **cannot go vacuous in the sense the issue named**: `legacyExamples + finalExamples` is
asserted `> 0` before the equality, so an empty corpus REDS instead of passing. Ran it: 12 files / 130 tests
passed, exit 0 (`reports/runs/test/agent-ae4ea4395d28ba7ca-2413292-2026-09-12T12-18-22-152Z`).

One correction to the assertion's own comment. It says *"Both halves are derived here independently of the
sweeps' own traversals"*. The LEGACY half is (the `fsBacked` filter and the row sum are re-spelled inline at
`:421`, duplicating `sweep`'s logic at `:211-218`). The FINAL half is **not**: `:422` calls
`virtualProofsOf(p)` and `policySweep` at `:260` iterates the SAME `virtualProofsOf(policy)`. A `continue`
inside `policySweep`'s body would still red — that is the skip the property was written for — but a
mis-filter inside `virtualProofsOf` moves both sides together and stays green. Downgrade the word
"independently" to "for the legacy half", or re-derive the final denominator from `policy.mustFlag`/
`policy.mustPass` directly.

**The coupled half is a real miss.** `4c2c6daa6` bumped
`tests/tooling/verify/ops/policy-conformance-stage.int.test.ts` `8 → 9` and `10 → 11`. #1969's own
disposition says the fix owes *"the intent stated in the assertion's `why`, because the current one records
a number and not a property."* This half still records a number, and the number is COUPLED: the planted
world shims the REAL `baseui-render-prop-composition` policy (`realPolicyShim(repoRoot, …)` at `:53`), whose
live row count I measured as **`mustFlag 4 · mustPass 5 · total 9`** — exactly the bumped literal. Any lane
adding a row to that module reds this suite again, and `tests/tooling/**` is `--full`-only so nobody will
see it. Worse, the comment two lines above the literal still reads *"The real policy carries 4 mustFlag + 4
mustPass rows"* — **stale, and off by one on the `mustPass` side**: the lane bumped the number and left the
prose that explains it.

FIX SPEC: derive the expected row count from the shimmed policy at test time
(`baseuiRenderPropComposition.mustFlag.length + .mustPass.length + plantedLegacyRows`), or assert the
SUBSTRING `"1 final policies ·"` plus a separately derived count; and correct the `4 mustFlag + 4 mustPass`
comment to `4 mustFlag + 5 mustPass` in the same edit.

### #1974 / #1975 — the dead carrier and the eleven

**Carriers are legacy TODAY.** `pnpm -s gate:contract` names 60 modules carrying `descriptor-wrapper`, and
`gates/query-machine-seals.ts` and `gates/no-test-fabrication.ts` are both in that list. So the re-pointing
is live, not a claim about 2026-09-11.

**I ran `tests/tooling/gate-ignore-grammar.repo.int.test.ts` in my own worktree**: `1 failed | 21 passed`.
The one failure is the LIVE-corpus arm, and it names four STALE `integer-line-boxes` markers —
`packages/ui/src/charts/meter/variants.ts:307,309,311` and `packages/ui/src/markdown/markdown.tsx:257` —
i.e. **#2043 exactly, and nothing else**. `git status --short` was EMPTY after the run: no `__g_gi` fixture
leaked.

**I ran `tests/tooling/gate-conformance.repo.int.test.ts`**: `1 failed | 3 passed`. The `#1969` re-pointed
arm — *"the legacy loader discovers a non-empty descriptor corpus"* — **PASSES**. The one failure is
`json-column-write-parity` `mustFlag` *"expected a finding (count=7 …) but got 10"* — **#2044 exactly**.
Tree clean after.

**#1975's eleven.** `check:structure` gives `test-determinism` **0 effective / 23 waived**. Planted positive
control: a scratch `tests/tooling/__cbvi_determinism.test.ts` containing `Date.now()` took the raw count
**23 → 24** and was named in the finding list, so the zero is a measurement and not a blind detector. The
split the issue demanded held: the nine fixture-string sites are waived one reason each, and the two REAL
`Date.now()` sites in `browser-run-marker.suite.int.test.ts:141-142` were **injected with `FROZEN_AT_MS`,
not waived**, with a header explaining that the marker segment is opaque and a waiver would have recorded a
false reason. That is the "read the test first" outcome, not the bulk waive.

### #1978 / #1986 — the waiver spellings and the two security rows

`policy-waiver-spelling` reports **0** violations in my `check:structure` artifact. Positive control: a
planted `tooling/src/verify/gates/__cbvi_nospelling.ts` — an ordinary policy whose `fix` deliberately names
no spelling — took it **0 → 1**, flagged at `__cbvi_nospelling.ts:14`. Plant deleted; tree clean.

Five `fix` strings sampled against their own `report.node` call, not against the message:

| module | `report.node` | `fix` names | verdict |
| - | - | - | - |
| `bounded-list-limit` | `:135` `{ token: LIMIT_KEY, offset: nameNode.getText().indexOf(LIMIT_KEY) }`, `LIMIT_KEY = "limit"` | "the literal `limit` — the unbounded field's own property key" | exact |
| `member-card-clamped` | `:91`/`:100` via `reportName` (`{ token, offset: 0 }` on the NAME node), `:106` `{ token: DELETED_VERB, offset: 0 }` on the identifier itself | names all THREE arms: `MemberCardView`, the clamp symbol's own name, `getRosterCardView` | exact, arm by arm |
| `no-forward-ref` | `:44` spreads `anchor(node)` = `{ token: EXPORT, offset: lastIndexOf(EXPORT) }`, `EXPORT = "forwardRef"` | "`forwardRef` when its import binding is readable, else the derived position" | exact, and it states the fallback |
| `turn-identity` | `:75` `{ token: PRINCIPAL_TYPE }`, `:86` `{ token: PRINCIPAL_OBJECT }` | "`Principal` or `principal`, whichever arm fired" | exact |
| `byte-check-cast` | `:220` `{ token: candidate.name, offset: candidate.hole.getText().indexOf(candidate.name) }` | "the referenced byte-limit constant's own identifier name … at its occurrence inside the CHECK clause" | exact |

Every one of the five is authored text at the reported coordinate, contains no paren and no newline, and
lives in code rather than comment trivia — so `locateFinding` binds and `report.node` does not throw.

**`plugin-dump-guard`, driven with a planted break each** (scratch sibling module, production
`verifyPolicyProofs`, removed in a `finally`):

| planted break | before | after |
| - | -: | - |
| drop `negatedGuardCall`'s `!`-prefix requirement | 0 failures | **1** — `mustFlag[6]`, the INVERTED guard: *"expected at least one effective finding but got 0"* |
| drop `guardedHelperDump`'s canonical-`HELPER` name check | 0 failures | **1** — `mustFlag[7]`, the non-canonical helper |

Both anchors were asserted to occur exactly ONCE in the module before the cut, so neither cut patched prose.

### #2007 — the 6 → 0 differential

Ran the committed test: PASSED (25.9 s). Then measured what it compares, because a set equality over an
empty set is §4.6 vacuity shape 1:

```
admitted (legacy scanRoot): 2757 of 7489
LEGACY findings: 4   toolErrors: 0
FINAL  findings: 4   status: success
  tests/tooling/verify/lib/suppression-directive.test.ts:11  expect · test
  tests/tooling/vite-async-hooks.test.ts:2                    expect · test
PLANTED CONTROL (a virtual overlay spec importing vitest directly): legacy 6 · final 6
```

So both engines see a NON-EMPTY set and agree on it, and a planted violation is seen by both — the equality
is load-bearing. Corroborated independently: `check:structure` reports `test-fixture-imports` at exactly **4
violations**.

**No catch was lost.** At the frozen legacy sha `519242add` the three named specs each carried
`import { expect, test } from "vitest"` — two `ImportSpecifier` nodes apiece, the six. Today all three import
from `../../../support/tool-fixtures.ts`. `schema-fact-wave-1.suite.test.ts:2` still carries
`import { describe } from "vitest"` and NEITHER engine flags it, so the two agree on that too.

### #2025 — `--fail-on-warnings`

Reachability and defaults, read in full and censused: three production entrypoints pass `failOnWarnings` —
`ops/structure.ts:182` (from argv, `parseWarningPromotion` returns `argv.length === 1`, so absent ⇒ FALSE),
`ops/scoped.ts:162` (`argv.includes(FAIL_ON_WARNINGS_FLAG)`, absent ⇒ FALSE) and
`ops/policy-conformance.ts:58` (literal `false`, deliberately). No fourth site sets it. The commit touched
**no** `gates/*.ts`, so no policy's `severity` or `authority` moved.

Re-drove the pins: `warning-promotion.suite.int.test.ts` and `cli.int.test.ts` both green inside the 12-file
batch (130 tests, exit 0), including *"`verify structure` refuses an unrecognised tail before doing any
work"*. And the real-tree artifact carries `failOnWarnings: false` with `blocking (857) == errors (857)`
while `warnings = 55` — the door is reachable and its default is off, measured end to end.

**Not re-derived by me:** the "byte-identical `check-structure.json` under HEAD vs under the door" claim.
That needs a second whole-tree run against a pre-door build and the structure slot is serialized; I did not
take a second slot. The structural argument above plus the two-sided pin is what I can certify.

**The open half is a DECISION → Needs owner, and the doc undercounts it.** §12.5 says *"Five policies declare
`warning`, and **THREE** of them are `authority: "hard"`"*, while its own table lists FOUR hard rows.
Measured off the loader: five `warning` policies, and **FOUR** are `hard` —

| policy | authority | severity | `workItem` | violations today |
| - | - | - | -: | -: |
| `over-art-plate-arm` | ordinary | warning | 2024 | 4 |
| `policy-proof-expectations` | **hard** | warning | 1968 | **50** |
| `policy-waiver-identity` | **hard** | warning | 1952 | 1 |
| `policy-waiver-spelling` | **hard** | warning | 1978 | 0 |
| `user-bus-deferred-member` | **hard** | warning | 1822 | 0 |

(4 + 50 + 1 + 0 + 0 = 55, which reconciles with `verdict.warnings`.) The doc's own note that the soundness
enforcer's findings *"stop nothing"* is now sharper than when it was written: **50**, not 11.

### #2040 — ARM M, and the defect it created

`contract-banned-shapes.ts:287` **is now judged**: driving `policy-proof-expectations` over the real tree
reports it with the SHARED arm (*"`messageIncludes` is contained in the static text of MORE THAN ONE of this
module's message sources"*). The mechanism is exactly the one #2040 built —
`missingSubject` (`:119`) is an expression-bodied arrow, so `callSegments` reads through it and
`missingHome`'s `${missingSubject(subject, home)}` span now contributes `"SILENT NO-OP"` as static text. The
refutation-ledger row *"a call-composed message is an ARM M blind spot"* is CLOSED.

**Worklist size NOW: 50** (owner `success`, population `complete`, 0 tool errors), against the 11 the design
doc records — corroborated exactly by `check:structure`'s per-policy row (`violations: 50`). Arm tally:

| arm | count |
| - | -: |
| `mustFlag` row with no `expect.count` | **11** (unchanged — the #1968/#2001 measured registry-cardinality exemption) |
| SHARED (`MORE THAN ONE … message sources`) | **4** — `contract-banned-shapes` ×1, `ownerid-registry` ×3 |
| TAUTOLOGY (`matches every finding this policy can emit`) | **35** |

**Three of the 35 TAUTOLOGY findings are FALSE POSITIVES, and they are on rows #2041 landed hours earlier**
— `single-stream-transport.ts:182`, `no-raw-clock.ts:180`, `no-raw-random.ts:162`, i.e. the
`messageIncludes: "CANNOT be established"` #944 rows. Mechanism, read in the code:
`lib/policy-descriptor-read.ts:214` folds a `ConditionalExpression` into ONE `StaticSegments` whose
`segments` are the UNION of both branches. Those three modules emit their two texts from ONE `ctx.report`
call with a conditional message (`single-stream-transport.ts:128`
`` `${found.unreadable ? UNREADABLE : MESSAGE} Proc: …` ``; `no-raw-clock.ts:115` the same shape through a
local `message` identifier), so the census counts one source containing both texts. Modules that use TWO
report calls (`no-mint-via-cast`, `membership-enforcer`) are judged correctly and are absent from the
worklist. The claim is factually false: my throw probe (below) shows the row reaches ONLY the unreadable
arm. The finding's own remedy — *"Drop it or add a second message shape"* — would delete the sole
discriminator on a fail-closed HARD ban.

### #2041 — the #944 third answer, per module

Literal disjointness checked mechanically: for each of the ten, the string `CANNOT be established` occurs
exactly **2** times in the module — once in the `UNREADABLE` constant and once in the proof row — and **0**
times inside the ordinary `MESSAGE` constant. So the needle cannot match the ordinary arm.

| module | plane | `#944` arm | receipt |
| - | - | - | - |
| `single-stream-transport` | server | **REACHED + pinned** | disjoint `messageIncludes`; **throw-probed** → `mustFlag[4]` alone reds |
| `no-raw-clock` | server | **REACHED + pinned** | disjoint `messageIncludes` (`:180`) |
| `no-raw-random` | server | **REACHED + pinned** | disjoint `messageIncludes` (`:162`) |
| `membership-enforcer` | server | **REACHED + pinned** | **throw-probed** → `mustFlag[5]` alone reds |
| `discovery-no-stats-rollups` | server | **REACHED + pinned** | disjoint `messageIncludes` (`:141`) |
| `persistence-no-in-memory-state` | server | **REACHED + pinned** | disjoint `messageIncludes`; its advertising row was REPLACED, not kept |
| `no-await-db-in-loop` | server | **REACHED + pinned** | disjoint `messageIncludes` (`:197`) |
| `no-raw-id` | id-brand-flow | **REACHED + pinned**, and a repaired FAIL-OPEN | disjoint `messageIncludes` |
| `no-mint-via-cast` | id-brand-flow | **REACHED + pinned**, and a repaired FAIL-OPEN in a `hard`/`error` ban | **throw-probed** → `mustFlag[2]` alone reds |
| `no-fake-disabled-id` | id-brand-flow | **REACHED + pinned** | disjoint `messageIncludes` |
| `no-loose-id-cast` | id-brand-flow | **NOT APPLICABLE, recorded** | header `:2-12` states the construction attempted (`value as unknown as Missing` yields an error type indistinguishable from every legitimate non-brand target) and routes the identity to tsc |
| `brand-in-name-position` | id-brand-flow | **NOT APPLICABLE, recorded** | header `:4-13`: the subject is a CENSUS join, nothing resolves an origin, and a missing type node is a TOOL ERROR that withholds the whole policy |

Ten pinned + two recorded = the twelve the commit claims. Throw probes, three modules, each with a
uniqueness-asserted anchor:

```
single-stream-transport   BEFORE 0 failure(s) · AFTER 1 · mustFlag[4]  (THE FAIL-CLOSED THIRD ANSWER)
membership-enforcer       BEFORE 0 failure(s) · AFTER 1 · mustFlag[5]  (THE FAIL-CLOSED THIRD ANSWER)
no-mint-via-cast          BEFORE 0 failure(s) · AFTER 1 · mustFlag[2]  (THE FAIL-CLOSED THIRD ANSWER)
```

Exactly one row reaches the arm in each module, and it is the #944 row — so the row both REACHES the arm and
DISCRIMINATES on it. The four repaired fail-opens are visible in the source: `id-brand.ts#createKitIdCallMatcher`
returns a three-valued `KitIdCallVerdict` instead of a boolean, and `no-mint-via-cast.ts#argumentVerdict`
routes an unresolved origin through `classifyOriginRefusal` rather than `return false`.

Real-tree cost of the flip, from my artifact: `no-mint-via-cast` 0 effective, `no-raw-id` 1 effective / 25
waived, `single-stream-transport` 0 / 2 granted, `no-raw-clock` 0 / 2 granted, `no-raw-random` 0 / 1 granted,
`persistence-no-in-memory-state` 0 / 43 waived, `no-await-db-in-loop` 0 / 8 waived. No policy withheld, no
tool error. The lane's "the flip admits no new live finding" holds.

### #2030 / #2037 — the ambient plant

**Shape fidelity: CONFIRMED byte-for-byte against the installed package.** `node_modules/@types/node`
`package.json` version `26.1.1`; `process.d.ts:1` `declare module "node:process" {`, `:139` `global {`,
`:140` `var process: NodeJS.Process;`, `:2212` `export = process;`, `:2214` `declare module "process" {`.
`gates/_proof/node-types.ts#PROCESS_SURFACE` reproduces that structure.

**Which branch each row takes — throw probes on the three arms of `readsProcessEnv`:**

```
ARM 1 PRECISE ambient global   BEFORE 0 · AFTER 3 → mustFlag[8], mustFlag[9], mustPass[4]
ARM 2 node:process MODULE door BEFORE 0 · AFTER 6 → mustFlag[2..7]
ARM 3 FAIL-CLOSED unreadable   BEFORE 0 · AFTER 3 → mustFlag[0], mustFlag[1], mustPass[1]
```

This reproduces the lane's own census exactly, and it settles the #2030 defect: the precise ambient arm,
previously reached by NOTHING, is now reached by three rows. **The planted-lookalike row DISCRIMINATES**:
cutting the `globalName === PROCESS_GLOBAL` comparison (anchor asserted unique) reds **`mustPass[4]` alone**.

**REFUTED — "both `isAmbientGlobalDeclaration` branches are exercised".** The predicate
(`lib/reference-fact-global.ts:63-69`) is
`trustedDeclaration && isDeclarationFile && (scriptGlobal || isGlobalAugmentation)`, and `||`
short-circuits. Measured with the same two ts-morph reads the predicate uses:

| declaration file | `getImportDeclarations()` | `getExportDeclarations()` | ⇒ `scriptGlobal` | decisive branch |
| - | -: | -: | - | - |
| the PLANT (`node-types.ts` → `@types/node/index.d.ts`) | 0 | 0 | **true** | `scriptGlobal` — `isGlobalAugmentation` never evaluated |
| `node-lookalike` | 0 | 0 | true | `scriptGlobal` |
| `argv-lookalike` | 0 | 0 | true | `scriptGlobal` |
| INSTALLED `@types/node/process.d.ts` | 0 | 0 | **true** | `scriptGlobal` |

The package's own imports sit INSIDE `declare module "node:process" { … }`, and `getImportDeclarations()`
reads top-level statements only, so the real file is script-global by this predicate too. Positive control
that this is not a false zero: the augmentation predicate returns **`process:aug=true`** for the planted
declaration — it WOULD accept, it is simply never asked. So `isGlobalAugmentation` is exercised by NO
fixture in this corpus and by no `process` read on the real tree.

That is a claim defect in two places, not a behaviour defect — and the plant is arguably MORE faithful
because of it. FIX SPEC: in `gates/_proof/node-types.ts`'s header, replace *"keeping them on the other
acceptance branch means both branches of `isAmbientGlobalDeclaration` are exercised by this corpus rather
than one"* with the measured fact (both take `scriptGlobal`; the augmentation branch has no exercising
fixture and none is reachable through a `@types/*` file, because the package's own imports are nested);
same correction to §4.8b's *"so the corpus now exercises both branches"*. If the augmentation branch is
meant to be live, it owes its own fixture — a `@types/*` declaration file with a TOP-LEVEL `import`/`export`
plus a `global {}` augmentation.

### #1951 / #1960 / #1963

**My own §4.1 cuts, each anchored on text asserted to occur exactly once:**

```
#1951 restore the bare-Identifier callee requirement   BEFORE 0 · AFTER 2 → mustFlag[4], mustFlag[5]
#1951 delete the two-argument narrowing                BEFORE 0 · AFTER 1 → mustPass[2]
#1960 unsubscribe TemplateHead/Middle/Tail             BEFORE 0 · AFTER 2 → mustFlag[3], mustFlag[4]
#1960 closingWidth back to a one-character close       BEFORE 0 · AFTER 1 → mustFlag[3]
```

Every planted-break receipt those modules' `why` strings claim is TRUE, reproduced independently.

**#1963 — the §8.6 per-file reconciliation**, marker-form only (`^\s*(//|/\*|\{/\*)\s*<opener>`), legacy side
read at the pre-conversion sha `99b7429e2` (`7be684811^`), gate self-quotes and engine fixtures excluded
(`verify/gates/**`, `verify/lib/**`, `gate-ignore-grammar*`, `tests/tooling/verify/lib/**`):

| file | legacy | current | verdict |
| - | -: | -: | - |
| `tests/server/entry/compose/chat.int.test.ts` | 2 | 2 | clean |
| `tests/server/entry/lifecycle.test.ts` | 1 | 1 | clean |
| `tests/server/infra/plugin-host/escape.suite.test.ts` | 2 | 2 | clean |
| `tests/server/infra/plugin-host/realm.test.ts` | 1 | 1 | clean |
| `tests/server/infra/plugin-host/sandbox.test.ts` | 4 | 4 | clean |
| `tests/tooling/_shared/proc.int.test.ts` | 1 | 1 | clean |
| `tests/tooling/snap/ops/session-client.int.test.ts` | 1 | 1 | clean |
| `tests/tooling/snap/ops/stage-keeper.int.test.ts` | 1 | 1 | clean |
| `tests/tooling/vitest-supervised.test.ts` | 1 | 1 | clean |
| **total** | **14** | **14** | **zero `current < legacy`, zero MULTI** |

The third leg of the arithmetic closes too: `check:structure` reports `test-determinism` **waived = 23** =
these 14 plus the 9 #1975 waivers in the excluded `tests/tooling/verify/lib/**` zone, with **0 effective**.

### #1958 — ARM E

Five fixtures driven through the production conformance harness against a COPY of the real
`gate-modernization` descriptor:

| planted fixture (all `analysis: "syntax"`) | ARM E |
| - | - |
| `getType()` nested inside a helper arrow, called from a visitor | **FLAGS** (`count 1`, `token "analysis"`) |
| `ctx.checker().getTypeAtLocation` | **DOES NOT FLAG** |
| `getType()` present only inside a STRING (negative control) | correctly silent |
| `ctx.node?.getSymbol?.()` — optional chain | **FLAGS** |
| `ctx.node.getContextualType()` | **DOES NOT FLAG** |

So the arm's vocabulary is exactly `TYPE_READ_METHODS = {getType, getSymbol}`, matched as call expressions
through a member access at any depth, and its MESSAGE says exactly that (*"its body calls `getType(`/
`getSymbol(`"*) — §5b.2 is satisfied and `getContextualType` is honestly outside the declared vocabulary.

The brief's phrasing — *"policies that reach `ctx.checker()` **or** a ts-morph `getType()` are now REDDED by
the honesty arm"* — conflates two enforcement tiers. `ctx.checker()` under a syntax owner is a RUNTIME
throw (`lib/policy-pass-context.ts:243-248`, `syntax owner <id> cannot access the type checker`), which the
module's own header states correctly. The practical gap worth recording: the runtime throw only fires if the
call EXECUTES, so a `ctx.checker()` in a rarely-taken branch of a syntax policy is caught by neither tier.
Adding `checker` to `TYPE_READ_METHODS` would close it statically at zero cost, since `ctx.checker()` is a
member call like the other two.

### #1991 / #1994 — the message split and the eight family tests

`no-color-literals` carries FOUR message constants (`MESSAGE_POLICY`, `MESSAGE_NON_TOKEN`, `MESSAGE_HEX`,
`MESSAGE_PALETTE`) and **every** `mustFlag` row carries a per-arm `messageIncludes`, read off the loader:

```
mustFlag[0] {count:1, token:"text-[#abc]",      messageIncludes:"arbitrary hex color class"}
mustFlag[1] {count:1, token:"bg-black",         messageIncludes:"named non-token color class"}
mustFlag[2] {count:1, token:"text-red-500",     messageIncludes:"Tailwind PALETTE-scale color class"}
mustFlag[3] {count:2, token:"bg-blue-300/50",   messageIncludes:"Tailwind PALETTE-scale color class"}
mustFlag[4] {count:3, token:"bg-red-500",       messageIncludes:"Tailwind PALETTE-scale color class"}
```

None of the three needles occurs in `MESSAGE_POLICY`, and `policy-proof-expectations` does not report the
module — the disjointness is confirmed by the enforcer as well as by reading.

**The eight modules given a family test**, by file:

- `tests/tooling/verify/gates/singleton-ordinary-policies.suite.test.ts` — `baseui-render-prop-composition`,
  `bus-on-data-no-store-write`, `membership-fan-guard`, `no-caller-user-id`,
  `no-external-media-without-gate`, `test-factory-contract` (**6**).
- `tests/tooling/verify/gates/unfenced-class-fragment-scanners.suite.test.ts` — `no-color-literals`,
  `no-raw-container-widths` (**2**).

Both carry what a proof row structurally cannot: the §4.2 identity arm through `runPolicyPass` asserting all
three of `effectiveFindings []`, `waivedFindings 1` and `authorityAlarms []`; the §4.8 fixture-specifier
resolution control; and, in the second file, the #1991 message-disjointness TRANSPLANT (a sibling arm's
needle proven NOT to match). Both headers state explicitly why §4.3 and §4.5 do not apply (all eight declare
`facts: []` and `resources: []`, resolve no home, derive no population), which is the recorded-inapplicability
half of #1994's "done when". Both files pass (inside the 12-file batch, 130 tests, exit 0).

**The NINTH is `no-array-literal-querykey`, and it is still missing.** Re-derived: **zero** hits for that id
across `tests/tooling/verify/gates/` (80 files scanned; positive control `no-color-literals` = 1 file). Its
own issue body routes it to #1993 alongside its two unenforced narrowings, so this is a scoping note rather
than a silent miss — but #1994's "done when" is 8 of 9.

## LEDGER ROWS (9 rows)

For verbatim append under a `### cb-v-instruments` section of
`docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md`.

| module | wave · `path:line` | defect | class | state | receipt | |
| - | - | - | - | - | - | - |
| `policy-proof-expectations` | cb-v-instruments `lib/policy-descriptor-read.ts:214` | ARM M's TAUTOLOGY arm FALSE-POSITIVES on a module whose two texts come from ONE report call with a conditional message: `staticSegments` folds a `ConditionalExpression` into ONE source whose segments are the UNION of both branches, so any substring of either branch reads as "matches every finding this policy can emit". Its remedy ("Drop it") would delete the sole discriminator on a fail-closed HARD-ban arm | §4.1 narrowing · instrument false positive | **OPEN — new** | measured on `a182d1fab`: worklist 50 = 11 no-`count` + 4 SHARED + 35 TAUTOLOGY; three of the 35 are #2041's own rows (`single-stream-transport.ts:182`, `no-raw-clock.ts:180`, `no-raw-random.ts:162`). Counter-receipt: a throw planted on `single-stream-transport`'s UNREADABLE report path reds **exactly** `mustFlag[4]`, so the row does discriminate. Modules using TWO report calls (`no-mint-via-cast`, `membership-enforcer`) are judged correctly and are absent from the worklist. `severity: warning`, so it blocks nothing — it misroutes a fix lane. The other 32 TAUTOLOGY rows are UNAUDITED by me | |
| `contract-banned-shapes` | w3 `:216` | `mustFlag[6]` cannot discriminate the two §4.6 arms; ARM M was blind to the call-composed message | §4.1 narrowing | **CLOSED — #2040, `62c6a85cc`** | re-derived by driving `policy-proof-expectations` over the real tree: `contract-banned-shapes.ts:287` is now reported with the SHARED arm ("contained in the static text of MORE THAN ONE of this module's message sources"). `missingSubject` (`:119`) is an expression-bodied arrow, so `callSegments` reads through it and `missingHome`'s `${missingSubject(...)}` span contributes `"SILENT NO-OP"`. The ledger's *"a call-composed message is an ARM M blind spot"* no longer holds | |
| `gates/_proof/node-types.ts` · design `gate-runtime-standardization.md` §4.8b | cb-v-instruments (#2037) | BOTH the plant's header and §4.8b claim the corpus "exercises both branches of `isAmbientGlobalDeclaration`". It exercises ONE: the predicate is `trusted && isDeclarationFile && (scriptGlobal \|\| isGlobalAugmentation)` and `\|\|` short-circuits | §5b.5 header · §4.8b method | **OPEN — new** | measured with the predicate's own two ts-morph reads: PLANT, both lookalikes AND installed `@types/node@26.1.1 process.d.ts` all have `getImportDeclarations()===0` / `getExportDeclarations()===0` at top level (the package's imports are nested inside `declare module`), so `scriptGlobal` is true for all four and `isGlobalAugmentation` is never evaluated. Positive control: the augmentation predicate returns TRUE for the planted `var process` when called directly, so this is not a false zero. The plant's SHAPE fidelity is separately CONFIRMED (`:1`/`:139`/`:140`/`:2212`/`:2214` match byte-for-byte) — the defect is the sentence, in two files | |
| `tests/tooling/verify/ops/policy-conformance-stage.int.test.ts` | cb-v-instruments (#1969) | the sibling of the retired `compared > 1000` floor was BUMPED `8→9` / `10→11` rather than re-expressed, and the literal is COUPLED to a shimmed real policy's live row count; the comment that explains it is now false | other (hard-coded coupled literal) | **OPEN — new** | `realPolicyShim(repoRoot, "baseui-render-prop-composition")` at `:53`; that policy measures `mustFlag 4 · mustPass 5 · total 9`, exactly the bumped literal, so any row added to it reds this suite again — and `tests/tooling/**` is `--full`-only, so nobody sees it. `:57` still reads *"The real policy carries 4 mustFlag + 4 mustPass rows"*, off by one. #1969's own disposition demanded a PROPERTY here, and the `conformance.int.test.ts` half got one | |
| `tests/tooling/verify/ops/conformance.int.test.ts` | cb-v-instruments (#1969) | the new property's comment claims both denominators are *"derived independently of the sweeps' own traversals"*; the FINAL half calls the same `virtualProofsOf` that `policySweep` iterates | other (comment overstates) | **OPEN — new, minor** | `:422` `corpus.final.reduce((n, p) => n + virtualProofsOf(p).length, 0)` vs `:260` `for (const proof of virtualProofsOf(policy))`. An in-loop `continue` still reds; a mis-filter inside `virtualProofsOf` moves both sides together. The legacy half IS independent (`:421` re-spells the `fsBacked` filter inline). Suite runs green, 130 tests, exit 0 | |
| `gate-modernization` ARM E | cb-v-instruments (#1958) | `ctx.checker()` under `analysis: "syntax"` is caught only by a RUNTIME throw, so an unexecuted branch is caught by no tier; `checker` is a member call and would cost nothing to add to `TYPE_READ_METHODS` | other (enforcement-ladder gap, honestly declared) | **OPEN — new, minor** | five planted fixtures through `verifyGateProofs` on a copy of the real descriptor: `getType()` nested in a helper FLAGS, `getSymbol?.()` FLAGS, `getType` inside a string correctly silent, `ctx.checker()` DOES NOT FLAG, `getContextualType()` DOES NOT FLAG. The module's MESSAGE names exactly `getType(`/`getSymbol(`, so §5b.2 holds and this is a scope gap, not a lying message | |
| `no-array-literal-querykey` | w? (#1994) | still the only one of #1994's nine with no family test anywhere | §4.2 identity home | **OPEN — #1993** | zero hits for the id across `tests/tooling/verify/gates/` (80 files scanned; control `no-color-literals` = 1). #1994's "done when" is therefore 8 of 9; its own issue body routes the ninth to #1993 | |
| design `gate-runtime-standardization.md` §12.5 | cb-v-instruments (#2025) | *"Five policies declare `warning`, and **THREE** of them are `authority: "hard"`"* contradicts the table directly beneath it and the loader | roster row | **OPEN — new, minor** | loader census on `a182d1fab`: five `warning` policies, **FOUR** `hard` — `policy-proof-expectations`, `policy-waiver-identity`, `policy-waiver-spelling`, `user-bus-deferred-member`; `over-art-plate-arm` is the one ordinary. Same section's "11 violations" for the soundness enforcer is now **50** | |
| `tests/server/entry/compose/chat.int.test.ts` | cb-v-instruments | the D53 ReDoS-watchdog test is load-fragile: it consumed 7634 ms of its 10000 ms budget on a QUIET re-run and TIMED OUT in a 9-file batch | other (budget) | **OPEN — new, not this wave's** | `bb1a896e1` touched only its COMMENTS (the `@orb-gate-ignore`→`@orb-waive` translation), so the fragility predates it. Batch: \`1 failed | 94 passed`; isolated re-run: `11 passed`, 7634 ms of 10 s. Candidate for `scaledBudget\` |

## WHAT I DID NOT COVER — load-bearing

1. **32 of the 35 TAUTOLOGY findings** in `policy-proof-expectations`' new worklist are unaudited by me. I
   proved three are false positives and identified the mechanism; I did not classify the rest, and the
   `-health` siblings that dominate the list (`testid-liveness-health` ×3, `tooling-argv-front-door-health`
   ×5, `session-channel-boundary-health` ×3, `d-citation-integrity` ×5, `dangling-doc-cite` ×4 …) are
   plausibly TRUE findings. **Do not read "3 false positives" as "the worklist is wrong."**
2. **#2025's byte-identical-artifact claim is NOT re-derived by me.** It needs a second whole-tree run
   against a pre-door build; the structure slot is serialized and I took one. What I certify is the source
   census of every `failOnWarnings` site, the two-sided pin passing, and `failOnWarnings: false` with
   `blocking == errors` in my own real-tree artifact.
3. **I ran no `--push`, no CT, no e2e, and no `pnpm check`.** The only whole-tree instrument I ran is
   `check:structure`, once.
4. **I did not audit the other 44 modules touched by `e7bbc809d`.** I sampled FIVE `fix` strings by reading
   their `report.node` calls; `policy-waiver-spelling` at 0 with a planted control is the mechanical
   backstop for the other 41, and it judges the SPELLING's presence, not whether the prose describing
   `<position>` is accurate. Those 41 prose descriptions are unread by me.
5. **The four repaired fail-opens in #2041 are verified by CODE READING plus proof rows, not by a
   before/after real-tree differential.** I did not restore the pre-`250c9eb60` modules and re-drive them,
   so "the flip admits no new live finding" rests on the lane's measurement plus my observation that all ten
   sit at 0 effective today.
6. **`gate-ignore-grammar.repo.int` and `gate-conformance.repo.int` each have exactly one failure, and I
   attributed each to a known row (#2043, #2044) by reading the assertion.** I did not verify that #2043 and
   \#2044 are themselves correctly scoped.
7. **§4.6 differentials for #1951 / #1960 / #1963 / #1991 were not run by me.** Those conversions predate
   this wave; I verified the DEFECT FIXES, not the original conversions' catch parity.
8. **I did not read `Core-Enforcement-Active-Gates.md` rows for any touched module**, so a stale roster row
   in this wave's blast radius would not have been caught by me.

## Proposed lessons (orchestrator owns the write)

- **A conditional message at ONE report site is ONE source to the descriptor reader, and that makes a
  soundness enforcer accuse a correct discriminator.**
  Index: `[cond msg = one source](conditional-message-is-one-census-source.md) — a `cond ? A : B`message
  folds into one StaticSegments whose text is the UNION; ARM M then calls a real discriminator a tautology.
  Body:`lib/policy-descriptor-read.ts#staticSegments`returns, for a`ConditionalExpression`, a single
  `StaticSegments`whose`segments`concatenate BOTH branches.`policy-proof-expectations`' TAUTOLOGY arm
  keys on "one message source containing the substring", so a policy that emits two disjoint texts from ONE
  `ctx.report`call is reported as having an empty discrimination claim — and its remedy ("drop the`messageIncludes\`") would delete the only pin on a fail-closed arm. **Two report calls are judged
  correctly; one call with a conditional is not.** When you add a #944 third answer, prefer two report
  calls, or expect the enforcer to accuse you. Verify the accusation with a throw probe before obeying it.

- **`||` in an acceptance predicate means the second branch may be dead, and "the fixture takes the other
  branch" is a claim about SHORT-CIRCUIT ORDER, not about the fixture.**
  Index: `[|| hides a dead branch](or-predicate-second-branch-may-be-dead.md) — plant-both-shapes proves
  nothing when the first disjunct is true for both.
  Body: `isAmbientGlobalDeclaration`is`trusted && isDeclarationFile && (scriptGlobal || isGlobalAugmentation)`.
  A lane planted a `global`augmentation "so both branches are exercised" — but`scriptGlobal`is`getImportDeclarations().length === 0 && getExportDeclarations().length === 0`, which is TRUE for the
  plant, for both lookalikes, and for the installed `@types/node/process.d.ts`(its imports are nested
  inside`declare module\`, and the ts-morph getters read top-level statements only). To claim a branch is
  exercised, evaluate the EARLIER disjuncts on your fixture, not just the one you intended.

- **`git grep -c <pattern> <sha> -- …` prefixes every line with the sha, so an `awk -F: '{s+=$2}'` control
  silently sums the wrong field and prints 0.**
  Index: `[grep -c at a sha shifts the field](git-grep-count-at-a-sha-shifts-awk-fields.md) — a control that
  reads 0 may be your field index, not the corpus.
  Body: `git grep -n … <sha>`yields`<sha>:<file>:<line>:…`while the worktree form yields`<file>:<line>:…`.
  My positive-control line for the legacy marker census printed 0 for exactly this reason while the real
  measurement (which stripped the `<sha>:`prefix with`sed\`) returned 14. A control that disagrees with a
  non-zero measurement is a bug in the control first.

- **A "same class, fix them together" issue can be half-fixed with a PROPERTY and half-fixed with a BUMP.**
  Index: `[half a property is a bump](same-class-fix-can-be-half-property-half-bump.md) — check the sibling
  the issue named, not only the headline assertion.
  Body: #1969 named two hard-coded counts and forbade bumping. `conformance.int.test.ts`got a real property;`policy-conformance-stage.int.test.ts`got`8→9`/`10→11\`, coupled to a shimmed real policy's live row
  count, with its explanatory comment left stale. A verifier reading only the headline assertion would have
  called it CONFIRMED.
