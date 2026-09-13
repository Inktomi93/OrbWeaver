---
kind: review
status: active
updated: 2026-09-12
---

# v-audit-wave6 — the origin-client family (12 policies) against §5b PRISTINE (#1584)

Read-only adversarial audit of the twelve canonical-origin client policies imported by
[`tests/tooling/verify/gates/origin-client-family.test.ts`](../../../tests/tooling/verify/gates/origin-client-family.test.ts),
held to [`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b's seven
criteria and §4's proof rules. Method, verdict shape and the four-way clean-cut classification are copied
from [`v-audit-wave4-2026-09-12.md`](v-audit-wave4-2026-09-12.md) so the waves are comparable. Every
number below came out of a run produced in this session, in an isolated worktree at `178ee3a4c`.

## Headline

**All twelve are FINAL, all twelve pass conformance, and all twelve are REFUTED.** The family is the
BEST yet measured on proof mechanics (61 of 61 `mustFlag` rows carry `count`; 12 of 12 identity arms exist
AND discriminate) and the WORST yet measured on two things nobody has checked before:

1. **The advertised THIRD ANSWER is unproven in 9 of the 12.** Every module's header sells the #944
   fail-closed arm — *"THREE ANSWERS: … a candidate the readers cannot place is REPORTED as unreadable"*.
   I planted a `throw` in that branch in each module and ran its own rows: **nine modules never reach it.**
   The virtue the whole family is named for is, in three quarters of it, dead code with a nice paragraph.
2. **§5b.3 — 1 of 12 `fix` strings names the exact waiver spelling** (`zustand-selector-stability`).
   Eleven ordinary policies fire on an author who is given no `@orb-waive` spelling to copy, in a family
   whose report anchors are deliberately NOT what a reader would call the offense.

| Property | Wave 1 (10) | Wave 2 (7) | Wave 4 (9) | **Wave 6 (12)** |
| - | -: | -: | -: | -: |
| §4.1 narrowings genuinely UNENFORCED | 12 of 30 (40%) | 5 of 30 (17%) | 10 of 31 (32%) | **25 of 59 (42%)**, each with a built falsifier |
| §4.2 identity arm present at all | 10 of 10 | 7 of 7 | 6 of 9 | **12 of 12** |
| §4.2 arm DISCRIMINATES (dead-position control) | — | — | 4 run | **12 of 12 alarm** |
| `fix` names the exact waiver spelling (§5b.3) | — | 7 of 7 | 4 of 8 | **1 of 12** |
| `mustFlag` rows with no `count` | 2 of 33 | 0 of 45 | 10 of 36 | **0 of 61** |
| Discriminators surviving a sibling-arm transplant | 5 of 8 | 6 of 6 | 21 of 22 | **4 of 6** |
| Header records a FAMILY decision (§5b.4/5) | — | — | — | **2 of 12** |
| Header records a POPULATION PORT (§5b.5) | — | 6 of 7 | 1 of 9 | **1 of 12** |
| §4.5 refusal / receipt pins where owed | 5 of 7 | 5 of 7 | 1 of 9 | **2 of 3** |
| The #944 unreadable arm reached by any row | — | — | — | **3 of 12** |
| `ctx.relativePath` #1972 exposure | 1 live | 5 reproduced | 0 | **0 — checked, clean, receipt in D7** |
| real-tree `check:structure` — tool errors · withheld | not run (#1972 landed here) | — | 0 · 0 | **0 · 0, all twelve on non-empty populations** |

| # | Module | Verdict |
| -: | - | - |
| 1 | `fetch-fn-in-features` | **REFUTED** (3, 5, 6) — 2 unenforced spelling fences w/ falsifiers; unreadable arm unreached; singleton family with no stated reason |
| 2 | `no-chat-trpc-in-surface` | **REFUTED** (3, 6) — the WHOLE `isProxyRoot` predicate is unenforced (D2); unreadable arm unreached. Family decision recorded (one of two) |
| 3 | `no-context-provider` | **REFUTED** (3, 5, 6) — the `.Provider` member fence unenforced; unreadable arm unreached; no family note |
| 4 | `no-context-returntype` | **REFUTED** (3, 5, 6) — 1 mutually-redundant + 1 unfalsifiable cut; unreadable arm unreached; singleton with no reason |
| 5 | `no-forward-ref` | **REFUTED** (3, 5, 6) — both shared-reader fences unenforced (D3); unreadable arm unreached; header names no family/reader |
| 6 | `no-inline-optimistic-in-surface` | **REFUTED** (3, 5, 6) — the two-method set and the computed-key fence unenforced; unreadable arm unreached |
| 7 | `no-manual-autosave-flush` | **REFUTED** (3, 5, 6) — 3 unenforced incl. a real module-scope ESCAPE (D4); unreadable arm unreached and message-only |
| 8 | `no-manual-token-estimate` | **REFUTED** (3, 5, 6) — **the worst of the twelve.** 5 unenforced cuts incl. both divisor fences that ARE the law's discrimination; an advertised rename tripwire with NO pin (D5) |
| 9 | `no-multiplexed-mutation-error` | **REFUTED** (3, 5, 6) — 3 unenforced; message pair is one-way (D6). Unreadable arm PROVEN; §4.5 pin present |
| 10 | `no-static-staletime` | **REFUTED** (3, 5, 6) — 3 unenforced; roster row is content-free. Unreadable arm PROVEN; message pair discriminates BOTH ways |
| 11 | `no-use-context` | **REFUTED** (3, 5, 6) — as `no-forward-ref`, plus a **stale, inverted roster row** (D8) |
| 12 | `zustand-selector-stability` | **REFUTED (minor — 1 and 6)** — 2 unenforced home-identity halves + 1 unreachable branch. §5b.3 ✓ §5b.4 ✓ §5b.5 ✓ §4.5 pin ✓, and its header's narrowing claims are TRUE by measurement. **The copy candidate** |

**Copy candidate: `zustand-selector-stability`, with two named repairs first** (J4/J5 below). **Do NOT point
a lane at `no-manual-token-estimate`** — it is the family's densest collection of unpinned fences and it
advertises a refusal nothing exercises.

## Premise checks (brief corrections, verified)

1. **The 12 subjects the brief named are exactly the 12 the family test imports.** Re-derived from
   `origin-client-family.test.ts:2-16`. No difference.
2. **All 12 are FRESH — none is a re-audit.** Receipt: a single `grep -nE` over the five prior audit
   documents (`v-exemplar-audit-2026-09-12.md`, `v-audit-wave2/3/4-2026-09-12.md`, `v-gate-batch-2026-09-12.md`
   — 2,907 non-empty lines combined) for all twelve ids returns **zero hits, exit 1**; the same pattern
   matches in `origin-client-family-1584.md`, `shared-semantic-readers.md` and `simple-visitors-*.md`
   (the conversion record and the census), which is the positive control that the pattern works.
3. **All 12 are FINAL `defineGate` policies**, not legacy — loaded and branded by the conformance driver
   in this session (`verifyPolicyProofs` accepted each as a `GatePolicy`), and none appears in
   `loadGates()`'s 104-module legacy roster (D9's receipt).
4. **Judged against §4.2's POSITIVE arm only** (`ordinary-visitors-family.test.ts:187-196`), per the
   orchestrator's correction. No per-module negative arm is counted as owed, and none of the twelve
   carries one.

## What I ran

| Instrument | Result |
| - | - |
| `pnpm check:policy-conformance` (baseline, `178ee3a4c`) | `167 final policies · 1679 proof rows · **0 failure(s)** · 105 grant rows · 0 invalid · 23071ms`, **exit 0** |
| **instrument control, run FIRST** | planted `count: 99` on `no-forward-ref` `mustFlag[0]` → `expected effective finding count=99 but got 2`; restored. The driver can fail |
| 59 §4.1 narrowing cuts (incl. 3 cluster cuts) | 29 clean / 30 red — every cut `cp`-backed in memory and restored in a `finally` |
| 26 falsifier rows, each run in BOTH arms (row alone → row + cut) | 24 built falsifiers PASS unmodified and RED under their cut; 2 probes came back UNFALSIFIABLE |
| 11 branch-reachability probes (a `throw` planted in the unreadable/unresolved branch) | 9 branches proven UNREACHED by their module's own rows |
| 6 sibling-arm `messageIncludes` transplants | 4 RED (honest discriminators), 2 PASS (D6) |
| 12 dead-position controls + 1 foreign-policy-id control | **13 of 13 ALARM** |
| `runPolicyPass` refusal probe on `no-manual-token-estimate` | tripwire WORKS, is UNPINNED — both messages measured (D5) |
| `ast-grep --lang ts` + `--lang tsx` over `tooling/src/verify/gates/` (271 `.ts` files) | `ctx.relativePath` = 91 ts / 0 tsx matches; my family's 3 sites all read `ctx.files` members (D7) |
| `loadGates()` vs `tests/tooling/gate-spelling-twins.baseline.json` | 104 legacy modules vs 79 ledger rows → **54 orphan rows, 7 of them my subjects** (D9) |
| `pnpm check:structure` (once) | **`0 tool error(s)` · `0 withheld`**; `complete: true`, `ran 271/271` (104 legacy + 167 final); all twelve on non-empty real-tree populations. Read from the run's own artifact — its stdout was lost under three concurrent structure runs. Slot: `reports/runs/structure/agent-acaa01f5b2f103c1c-3568256-2026-09-12T00-16-53-571Z/` |

Every probe ran through `verifyPolicyProofs` — the exact function the production stage calls
(`ops/policy-conformance-stage.ts`) and the exact function this family's own test calls
(`origin-client-family.test.ts:19`). `git status --short` was EMPTY after every batch and at the end.

## DEFECTS

### D1 — the #944 THIRD ANSWER is UNPROVEN in nine of twelve (HIGH, family-wide)

Eleven of the twelve implement a fail-closed `unreadable` report and ten say so in their header in
near-identical words: *"THREE ANSWERS: … a candidate whose origin the shared readers cannot resolve is
REPORTED as unreadable (GATE-AUTHORING §5, #944)"*. I replaced the report call in that branch with
`throw new Error("WAVE6-REACHED-UNREADABLE")` and ran each module's own declared rows:

| Module | branch reached by a declared row? |
| - | - |
| `fetch-fn-in-features` | **NO** |
| `no-chat-trpc-in-surface` (both sites) | **NO** |
| `no-context-provider` | **NO** |
| `no-context-returntype` | **NO** |
| `no-forward-ref` (shared `react-origin` emit) | **NO** |
| `no-use-context` (same emit) | **NO** |
| `no-inline-optimistic-in-surface` | **NO** |
| `no-manual-autosave-flush` | **NO** |
| `no-manual-token-estimate` | **NO** |
| `no-static-staletime` | YES — `mustFlag[4]`, `messageIncludes: "CANNOT be established"` |
| `no-multiplexed-mutation-error` | YES — `mustFlag[4]`, same |
| `zustand-selector-stability` | YES — `mustFlag[4]` (the `any`/`unknown` erasure arm) |

The three that DO prove it are the three that wrote a `mustFlag` row whose `expect` names the unreadable
message. That is the whole fix, one row each: a fixture with an unplaceable receiver plus
`expect: { count: 1, messageIncludes: "CANNOT be established" }`.

Why it matters more than a missing row usually does: this arm is the difference between the converted
policy and the legacy one it replaced. If a future reader change turns `unreadable` back into `other`
(silence) in any of those nine, **every declared row stays green** — the exact regression
`no-forward-ref`'s own `mustFlag[1]` was written to catch in the OTHER direction.

### D2 — `no-chat-trpc-in-surface`: the WHOLE `isProxyRoot` predicate is unenforced, and only a message discriminates it (HIGH)

`isProxyRoot` (`no-chat-trpc-in-surface.ts:52-55`) is two conditions — the root's type is named
`TRPCOptionsProxy` AND it is declared by `@trpc/tanstack-react-query`. Cut each: clean. Cut the whole
predicate (`return identity.kind === "resolved"`): **still clean, 0 failures.** It is not mutual
redundancy with a sibling fence either — the cluster cut of the member-package fence AND `isProxyRoot`
together reds 2 rows, so the MEMBER fence is what is carrying both.

The falsifier, built and run in both arms:

```ts
// mustFlag, expect { count: 1, messageIncludes: "CANNOT be established" }
"packages/client/src/features/chat/surfaces/local-root.tsx":
  'import type { DecorateMutationProcedure } from "@trpc/tanstack-react-query";\n' +
  'declare const local: { chat: { send: DecorateMutationProcedure } };\n' +
  'export const go = (): unknown => local.chat.send.mutationOptions();\n'
```

Unmodified: **PASSES** (the member is trpc-declared, the root is not the proxy, so the policy reports the
UNREADABLE message). With `isProxyRoot` cut: **RED** (it reports the ordinary message instead).

**The count never changes — only the message does**, which is exactly why every existing count-only row is
blind to it. This ONE row closes D2 and this module's half of D1 at the same time.

### D3 — `no-forward-ref` / `no-use-context`: both shared-reader fences that prevent a repo-wide false-accusation are unenforced (HIGH)

Neither module holds any narrowing of its own; everything is in `lib/react-origin.ts`, shared by three
policies. Two of its four fences cut clean, and both are the ones standing between the fail-closed arm and
the whole corpus:

| Cut | Site | Falsifier (unmodified → cut) |
| - | - | - |
| the candidate spelling prefilter | `react-origin.ts:118-120` | `declare const opaque: any; opaque.doIt();` in a `.tsx` — **PASS → RED** (reported as unreadable) |
| `importDoor`'s exported-name fence | `react-origin.ts:135-137` | `import { mystery } from "./nowhere.ts";` — **PASS → RED** (reported as unreadable) |

The header already records what happens without the second one — *"Resolving every `from "react"` specifier
instead cost 439 false 'unreadable' findings per policy on the real tree"* — and the comment above the
first calls it a cost filter, which understates it: it is also the semantic fence that keeps every
unreadable call in `@authored` from becoming an accusation. **A measured 439-finding incident recorded in a
comment and pinned by no row is precisely the §4.1 "narrowing nothing was ever shown to enforce".** The cut
is in a SHARED reader, so the two rows owed protect `no-context-provider` and every future `react-origin`
member too.

### D4 — `no-manual-autosave-flush`: a module-scope pair in a `features/**` file is unreported, and nothing says so (MEDIUM-HIGH)

`enclosingBody` (`:73-75`) returns `undefined` at module scope and the visitor drops the call. Falsifier,
built and run:

```ts
'import type { FormApi } from "@tanstack/form-core";\ndeclare const form: FormApi;\n' +
'form.pushFieldValue("items", 1);\nvoid form.handleSubmit();\nexport const done = 1;\n'
```

Unmodified: **PASSES.** With `enclosingBody` falling back to the source file: **RED.** Two further
unenforced fences in the same module, both with built falsifiers: the member-name set (`form.reset()` beside
`handleSubmit()` — PASS → RED when the `ARRAY_OPS`/`SUBMIT` filter is cut) and the `features/**` population
(the founding fixture moved to a proof-tree path — there is no `packages/client/src/forms/editor/flush.ts` on the real tree — PASS → RED when `under` is cut;
this row needs a SECOND admitted file or the run is a `[population]` tool error rather than a finding).

The module's header documents its OTHER declared limits carefully (the nested-function rule has its own
`mustPass` row). The module-scope hole has neither a row nor a sentence.

### D5 — `no-manual-token-estimate`: five unenforced fences, and an advertised refusal with no pin (HIGH)

Worst cut record in the family. Five clean cuts, each with a falsifier I built and ran in both arms:

| Cut | Site | Falsifier (unmodified → cut) |
| - | - | - |
| unnamed divisor must be exactly `4` | `:95` | `text.length / 5` — **PASS → RED** |
| the chars-per-token RANGE (3..5) | `:99` | `const CHARS_PER_TOKEN = 40; text.length / CHARS_PER_TOKEN` — **PASS → RED** |
| the `/` operator fence | `:110` | `text.length * 4` — **PASS → RED** |
| the left member must be `length` | `:114` | `s.size / 4` on a `Set<string>` — **PASS → RED** |
| population `notNamed: ["*.test.ts", …]` | `:120` | the founding fixture at `…/verb.test.ts` — **PASS → RED** |

The NAME half of the divisor test is pinned (`PAGE_SIZE` row) and its header calls that fence "LAW, not
spelling laziness" — correctly; but the RANGE half beside it, in the same expression, has nothing.

**And its rename tripwire is unpinned.** The module files a population receipt for `estimateTokens` and its
header promises *"a rename of the estimator's home REFUSES the run"*. Its two siblings with the identical
design (`zustand-selector-stability`, `no-multiplexed-mutation-error`) have a `runPolicyPass` pin in
`origin-client-family.test.ts:55-96`; this one has none. I measured both sides by hand (§4.5b's honest
output) — the tripwire WORKS:

```
HEALTHY  toolErrors: []            withheld: []                          receipts: [{kind:"population",source:"estimateTokens",members:1,unresolved:0}]
RENAMED  toolErrors: [{policyId:"no-manual-token-estimate",phase:"receipt",
                       message:'policy receipt refused: population "estimateTokens" resolved zero members'}]
         withheld: ["no-manual-token-estimate"]   effectiveFindings: 0
MOVED    (home file renamed away) — identical refusal
```

A third pin in the family test, copied from the two beside it, is the whole fix.

### D6 — three modules build `UNREADABLE` by EMBEDDING `MESSAGE`, so a base-message pin can never discriminate (MEDIUM)

`no-multiplexed-mutation-error:40`, `no-manual-autosave-flush:43` and `zustand-selector-stability:53` all
spell `const UNREADABLE = \`${MESSAGE} …\`\`. Transplant results (6 run):

| Row | transplant | result |
| - | - | - |
| `fetch-fn-in-features[0]` `"NEVER writes fetch"` → the UNREADABLE text | | **RED** ✓ |
| `no-forward-ref[1]` `"React 19 deprecates"` → the UNREADABLE text | | **RED** ✓ |
| `no-use-context[1]` same | | **RED** ✓ |
| `no-static-staletime[4]` `"CANNOT be established"` → a base-MESSAGE fragment | | **RED** ✓ |
| `no-multiplexed-mutation-error[4]` → a base-MESSAGE fragment | | **PASSES** |
| `zustand-selector-stability[4]` → a base-MESSAGE fragment | | **PASSES** |

The two rows as AUTHORED are honest (they assert the unreadable-only suffix). What the transplant proves is
that the message pair discriminates in ONE direction only: in these three modules no pin on the ORDINARY
message can ever establish that the verdict was ordinary rather than unreadable, because the unreadable
message contains it. A lane copying this shape and pinning the base message would write a tautology and not
know it. The disjoint-message pairs (`fetch`, `staletime`, the two React modules) are the shape to copy.

### D7 — what is CLEAN, stated with its receipt

- **`ctx.relativePath` (#1972): zero exposure in this family.** `ast-grep --lang ts` over
  `tooling/src/verify/gates/` (271 `.ts` files scanned) returns 91 matches, `--lang tsx` returns 0. This
  family owns exactly three: `no-manual-token-estimate.ts:143`, `zustand-selector-stability.ts:136`,
  `no-multiplexed-mutation-error.ts:102` — each `ctx.files.find((file) => ctx.relativePath(file) === HOME)`,
  i.e. the argument is always a member of the effective population, never a declaration reached by
  resolution. All three modules say so in a comment beside the call. (Out of scope but visible in the same
  sweep: `chrome-registry-completeness.ts:74`, `config-group-completeness.ts:134`,
  `section-registry-completeness.ts:110`, `modal-registry-completeness.ts:162`, `own-tables-only.ts:305/314`
  pass `definition.declaration.getSourceFile()` — the latent #1972 class, not mine to judge.)
- **#1979 silent not-ready return: not applicable.** All twelve declare `resources: []` and `facts: []`
  (read off the loaded descriptors, printed in this session), so no `ResourceLoad` narrowing exists to get
  wrong.
- **No forbidden traversal.** No `forEachDescendant` / `getDescendant*` / `new Project` /
  `getSourceFiles()` / filesystem read in any of the twelve.
- **`under:` spellings are correct** — every `under`/`notUnder` in the family ends in `/**`
  (`packages/client/src/features/**`, `**/features/*/surfaces/**`); none is the `"x/"` that matches nothing.
- **61 of 61 `mustFlag` rows carry `count`** — the first family to score perfect here.
- **12 of 12 identity arms exist and DISCRIMINATE.** Moving each module's `@orb-waive <id>(<position>)`
  marker to a dead position (`zzzdead`) alarms in all twelve; re-pointing `fetch-fn-in-features`'s marker at
  a foreign policy id alarms too.

### D8 — roster rows: one is stale AND inverted, two are content-free (MEDIUM)

`docs/architecture/core/Core-Enforcement-Active-Gates.md`:

- `:289` `no-use-context` — *"Three doors, all keyed by name: a bare `useContext(…)` call, the
  `React.useContext(…)` member call, and the `useContext` ImportSpecifier."* The conversion's entire thesis
  is that identity is keyed by **resolved origin, never by name** (the module header: *"the legacy gate
  compared `expr.getText()` … an import alias and a namespace member were silent greens"*), and the policy
  has **two** visitor arms, not three. The roster teaches the mechanism the conversion deleted.
- `:262` `no-static-staletime` — *"static staleTime in query configurations"*; `:271`
  `zustand-selector-stability` — *"zustand selector stability"*. Neither names a mechanism; the second
  restates its own id.

The other nine rows are accurate. `zustand-selector-derived` at `:118` is correctly still listed as the
legacy Layer-3 sibling, matching `zustand-selector-stability`'s header.

### D9 — the conversion left `gate-spelling-twins` DEAD for 54 ledger rows, 7 of them this family's (HIGH, program-wide)

`tests/tooling/gate-spelling-twins.int.test.ts:117` iterates `await loadGates(ROOT)` — which returns
`corpus.legacy` ALONE (`lib/loader.ts:190`) — and asserts `toEqual(ledger.blind)` against
`tests/tooling/gate-spelling-twins.baseline.json`, a ledger the file's own header calls
**"TWO-SIDED AND SHRINK-ONLY … a ledger row whose gate is no longer blind is RED"**. Measured in this
session without running the 470-pass suite:

```
legacy corpus size: 104 | ledger rows: 79
ledger rows whose gate is NOT in loadGates()  =>  54
… no-chat-trpc-in-surface, no-forward-ref, no-inline-optimistic-in-surface, no-manual-autosave-flush,
  no-manual-token-estimate, no-multiplexed-mutation-error, no-use-context …
```

Two consequences. (a) The suite is RED by construction — `toEqual` cannot match an object missing 54 keys —
and it is `tests/tooling/**`, so `--full`-only and unobserved. (b) More importantly, the #1506 spelling
control **no longer covers any converted policy at all**, and the 7 rows claiming these modules are blind to
`bracket`/`namespace` respellings are now doubly false: each converted module carries explicit
computed-literal and namespace `mustFlag` rows and is demonstrably NOT blind. This is the
`.claude/rules/gates-and-tooling.md` #1983 class — the fourth instance — and it is bigger than one family's
share. **I did not run the suite** (CPU-heavy, siblings live); the receipt above is the decisive part and
needs no 470 passes.

### D10 — §5b.3/4/5 bookkeeping (MEDIUM)

- **`fix` names the exact waiver spelling: 1 of 12** — only `zustand-selector-stability:112`. `render.ts`
  prints `message` then `fix` as the group header on a failing run, so `fix` IS the remedy the author reads;
  and this family's anchors are deliberately counter-intuitive (the waiver names `length`, not the division;
  `error`, not the `??`; `pushFieldValue`, not the `handleSubmit` that is half the offense — each module's
  own `why` says so at length in a proof row the author will never see).
- **Family decision recorded: 2 of 12** (`no-chat-trpc-in-surface`, `zustand-selector-stability`). Four
  modules are singletons (`family === id`) with no stated reason: `fetch-fn-in-features`,
  `no-context-returntype`, `no-manual-autosave-flush`, `no-manual-token-estimate`. Six belong to real shared
  families (`react-origin` ×3, `tanstack-query-origin` ×3) and only `no-use-context` names the shared reader
  and function (`reactExportVisitors`). The loader law the trpc header cites is real and I checked it:
  `lib/policy-module.ts:78-79` throws `singleton family <f> must equal its sole policy id <id>`.
- **Population port recorded: 1 of 12** (`zustand-selector-stability:31-32`, which also states which
  narrowings have rows — a claim I verified true by cutting each).

## The §4.1 cut ledger — naive 29, classified 25

59 cuts across the twelve modules and the one shared reader they stand on; **29 came back clean (49%)**;
classified per §4.1:

| Classification | Count | Members |
| - | -: | - |
| **UNENFORCED** (falsifier built and run in both arms) | **25** | A3, A4 · B3, B4 · C2 · E1, E4, E5 · F1, F3 · G2, G4, G5 · H1, H3, H7, H8, H9 · I4, I5, I6 · J4, J5 · K1, K2 |
| **MUTUALLY REDUNDANT** | 1 | D1 — `no-context-returntype`'s `globalName === UTILITY` is individually uncuttable because the `node.getText() !== UTILITY` spelling fence catches the same subject. The CLUSTER cut of both, with a `Parameters<typeof makeCtx>` row in a `context.ts`, goes **RED**. The answer is not deletion: each is doing real work for a different reader |
| **UNFALSIFIABLE** (documented, never faked) | 3 | A1 — `fetch`'s `memberPath.length === 0`: a reachability probe (`throw` when `globalName === FETCH && memberPath.length > 0`) never fires, including under a `const g = globalThis; g.fetch("/x")` probe I wrote specifically to reach it (that shape flags today either way). D2 — the identical clause in `no-context-returntype`, same probe, never fires. J3 — `zustand`'s `chain.kind === "unresolved" → "other"`: flipping it to `"unreadable"` changes nothing, so no declared row reaches the branch at all |
| **WRONG-DIRECTION** | 0 | none found |

Per-module naive/classified: fetch 3/2 · trpc 2/2 · provider 1/1 · returntype 2/0 · forward-ref+use-context
2/2 (shared) · optimistic 2/2 · autosave 3/3 · tokens 5/5 · multiplex 3/3 · staletime 3/3 · zustand 3/2.

**Methodology note for comparability:** my 59 includes population fences and shared-reader prefilters, which
earlier waves may not have cut (wave 4 reported 31 cuts across 9 modules, ~3.4/module; this is ~4.9/module).
The UNENFORCED rate is therefore an upper bound relative to wave 4's 32%, not a strict regression. Removing
the 7 population-fence cuts (all unenforced: A7 is enforced, but E4, G5, H9, I6 are not; J7 is) still leaves
**21 of 52 (40%)**.

## Expectation rows (§4.2 asymmetry)

`ops/policy-conformance.ts:184-216`: `count` compares `findings.length` EXACTLY; `line`/`token`/
`messageIncludes` run through `findings.some(...)`, so any one match satisfies.

| Module | mustFlag | no `count` | `token` | `messageIncludes` |
| - | -: | -: | -: | -: |
| `fetch-fn-in-features` | 4 | 0 | 1 | 1 |
| `no-chat-trpc-in-surface` | 4 | 0 | 1 | 0 |
| `no-context-provider` | 4 | 0 | 1 | 0 |
| `no-context-returntype` | 2 | 0 | 1 | 0 |
| `no-forward-ref` | 7 | 0 | 1 | 1 |
| `no-inline-optimistic-in-surface` | 4 | 0 | 2 | 0 |
| `no-manual-autosave-flush` | 4 | 0 | 1 | 0 |
| `no-manual-token-estimate` | 7 | 0 | 2 | 0 |
| `no-multiplexed-mutation-error` | 5 | 0 | 0 | 1 |
| `no-static-staletime` | 5 | 0 | 1 | 1 |
| `no-use-context` | 8 | 0 | 1 | 1 |
| `zustand-selector-stability` | 7 | 0 | 1 | 1 |
| **total** | **61** | **0** | **13** | **6** |

No tautological `messageIncludes` as authored (D6 records the one-way asymmetry). The weak spot is the seven
`count: 2` rows carrying no `token` (`no-context-provider[3]`, `no-forward-ref[3]/[6]`,
`no-use-context[0]/[4]`, `no-inline-optimistic[1]`, `no-manual-token-estimate[6]`): their `why` names WHICH
two nodes fire, which §4.1 says should carry `token` — and `no-multiplexed-mutation-error` has **zero**
`token` rows across five, despite a deliberately non-obvious anchor its own identity arm spends a paragraph
explaining.

## Repairs, cheapest first

1. **Nine `mustFlag` rows** (one per module in D1's NO column), each `expect: { count: N, messageIncludes:
   "CANNOT be established" }` — closes D1, and for `no-chat-trpc-in-surface` the SAME row closes D2.
2. **Eleven `fix` strings** gain the exact `@orb-waive <id>(<position>)` spelling, read off the
   `report.node` call (§5b.3). Copy `zustand-selector-stability:112`.
3. **Two `mustPass` rows in `lib/react-origin.ts`'s consumers** (D3) — the opaque-member call and the
   unresolvable import door. They protect three policies at once.
4. **One `runPolicyPass` pin** for `no-manual-token-estimate` in `origin-client-family.test.ts`, copied from
   the two beside it; the exact refusal message is in D5.
5. **Twenty-two `mustPass` rows** for the remaining unenforced cuts; every one is written out above or in
   the cut ledger with its fixture.
6. **Roster**: rewrite `no-use-context`, `no-static-staletime`, `zustand-selector-stability` (D8).
7. **`gate-spelling-twins`** (D9) — program scope, not this family's: the 54 orphan rows and the control's
   loss of every converted policy need a ruling, not a row deletion.

## What I did NOT cover

- **`pnpm check:structure` ran and is COVERED — but read its ARTIFACT, not its log.** I launched it once;
  its stdout never reached my redirect (three concurrent `structure` runs were on the box — two are sibling
  lanes'; `ps` pids 3559603 / 3562175 / 3568256), so the log holds only the pnpm banner. The run itself
  finished cleanly and published its slot,
  `reports/runs/structure/agent-acaa01f5b2f103c1c-3568256-2026-09-12T00-16-53-571Z/check-structure.json`:
  `"complete": true`, `ran 271/271` (104 legacy + **167 final**), and the two numbers the correction asked
  for are **`0 tool error(s)` and `0 withheld`** (`policy.toolErrors` length 0, `policy.factErrors` 0,
  `policy.waiverCarrierRefusals` 0, `run.final.withheld` 0). **All twelve subjects ran on non-empty
  real-tree populations** — effective source paths: `no-context-returntype` 32 · `no-chat-trpc-in-surface`
  and `no-inline-optimistic-in-surface` 66 · `fetch-fn-in-features` and `no-manual-autosave-flush` 1003 ·
  `no-multiplexed-mutation-error` 1319 · `no-manual-token-estimate` 3239 · `no-static-staletime` and
  `zustand-selector-stability` 5318 · the three `@authored` React policies 7412. So the #1972/#1973 class
  (green on virtual projects, fully WITHHELD on the real tree) is RULED OUT for these twelve.
  **Bonus real-tree finding, and the policy working as designed:** `fetch-fn-in-features` is the only one of
  the twelve reporting a live violation — `packages/client/src/features/app-shell/lib/bug-report-capture.ts:223`,
  `const response = await fetch(BUG_REPORT_ROUTE, …)` inside `submitBugReport`. That is an R5 offense or an
  egress owing a `data/` fn plus a waiver; either way it belongs to the client lane, not to this audit.
- **The one thing the artifact cannot tell me is the DELTA**, since I hold no before/after pair: this is a
  single real-tree reading at `178ee3a4c`, not a comparison against a pre-conversion run.
- I did not run `gate-conformance.repo.int.test.ts` or `gate-ignore-grammar.repo.int.test.ts` (the brief
  reserves them), nor `gate-spelling-twins.int.test.ts` (D9 is proven statically instead).
- I did not run `pnpm gate:contract` — no module here is legacy, and I made no code change to land.
- I did not audit the §4.6 conversion differential against the pre-conversion SHAs; that is landing-commit
  evidence, not standing law (§4.6).
- The falsifier rows I built are PROBES, not commits: nothing in `tooling/` or `tests/` was modified by this
  lane (`git status --short` EMPTY).
