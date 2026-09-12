---
kind: review
status: active
updated: 2026-09-12
---

# v-audit-wave7 — the home-client family (14 policies) against §5b PRISTINE (#1584)

Read-only adversarial audit of the fourteen sanctioned-home CLIENT policies imported by
[`tests/tooling/verify/gates/home-client-family.test.ts`](../../../tests/tooling/verify/gates/home-client-family.test.ts),
held to [`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b's seven
criteria and §4's proof rules. Method, verdict shape and the four-way clean-cut classification are copied
from [`v-audit-wave6-2026-09-12.md`](v-audit-wave6-2026-09-12.md) and
[`v-audit-wave5-2026-09-12.md`](v-audit-wave5-2026-09-12.md) so the waves are comparable. Every number
below came out of a run produced in this session, in an isolated worktree at `e4250ae50`.

## Headline

**All fourteen are FINAL, all fourteen pass conformance, and thirteen are REFUTED.** This is the
**best-proved family yet measured** on two axes and it contains **the program's first genuine copy
candidate whose header survived an independent re-derivation of its own claims** — barely.

1. **71 of 71 `mustFlag` rows carry `count`** — the first family with a perfect §4.1-expectation record
   at this size (wave 4 was missing 10 of 36).
2. **The §4.1 narrowing gap is the LOWEST measured: 17 genuinely UNENFORCED of 85 cuts (20%)** against a
   naive 29 of 85 (34%). The naive sweep over-reports by **71%** — the widest naive/classified gap yet,
   because this family is full of declared PERFORMANCE prefilters whose clean cut is correct by design.
3. **The #944 THIRD ANSWER is reached in 1 of the 11 modules that implement it.** `no-raw-matchmedia` —
   the module wave 1 REFUTED SEVERE and a fix lane repaired — is the only one, and it is the only one
   that wrote `messageIncludes`. Wave 6's correlation reproduces EXACTLY, in a family with no author
   overlap. Three further modules pass `unreadableMessage: MESSAGE` — the substring trap in its
   terminal form, two strings that are the same string.
4. **`no-raw-matchmedia`'s repair HELD** and is now the family's best module — but its header and its
   roster row both undercount its own grant table (**"All four" against FIVE live rows**) and its
   stated reason for one of those permissions is contradicted by a sibling row in the same table (D8).

| Property | Wave 2 (7) | Wave 4 (9) | Wave 5 (15) | Wave 6 (12) | **Wave 7 (14)** |
| - | -: | -: | -: | -: | -: |
| §4.1 narrowings genuinely UNENFORCED | 5 of 30 (17%) | 10 of 31 (32%) | (35%) | 25 of 59 (42%) | **17 of 85 (20%)** |
| naive clean cuts before classification | — | — | naive +41% | — | 29 of 85 (34%), **naive +71%** |
| falsifiers BUILT and verified in both arms | — | — | — | 24 of 26 | **8 of 8 built; 9 of 17 gaps named but unbuilt** |
| §4.2 identity arm present (ordinary policies only) | 7 of 7 | 6 of 9 | — | 12 of 12 | **1 of 1** |
| §4.2 arm DISCRIMINATES (dead-position + foreign-id) | — | 4 run | — | 12 of 12 | **1 of 1, both controls** |
| `mustFlag` rows with no `count` | 0 of 45 | 10 of 36 | — | 0 of 61 | **0 of 71** |
| rows carrying `messageIncludes` | — | — | — | 3 | **3, all in one module** |
| `messageIncludes` discriminators surviving a transplant | 6 of 6 | 21 of 22 | — | 4 of 6 | **2 of 2** |
| the #944 unreadable arm reached by any declared row | — | — | — | 3 of 12 | **1 of 11 implemented (3 do not implement it)** |
| `fix` names the exact waiver spelling (§5b.3, ordinary only) | 7 of 7 | 4 of 8 | — | 1 of 12 | **0 of 1** |
| header records a FAMILY decision (§5b.4) | — | — | — | 2 of 12 | **1 of 14 fully; 4 name a real family string** |
| header records a POPULATION PORT (§5b.5) | 6 of 7 | 1 of 9 | — | 1 of 12 | **12 of 14** |
| §4.5 refusal / receipt pins where owed | 5 of 7 | 1 of 9 | — | 2 of 3 | **7 of 7 owed, all in the family test** |
| `ctx.relativePath` #1972 exposure | 5 reproduced | 0 | — | 0 | **0 — 20 sites, all on a VISITED file or `ctx.files`** |
| real-tree `check:structure` — tool errors · withheld | — | 0 · 0 | — | 0 · 0 | **0 · 0, all fourteen on non-empty populations** |

| # | Module | Verdict |
| -: | - | - |
| 1 | `no-raw-matchmedia` | **CONFIRMED with two named repairs** (D8) — 11 of 12 cuts RED; the one clean cut is the one its header DECLARES unfalsifiable, with the reasoning; the only reached third answer; the only §5b.4-complete header. **The copy candidate.** RE-AUDIT: the wave-1 repair held |
| 2 | `client-cache-surgery-only-in-data` | **REFUTED (minor — 6)** — the family's only PERFECT §4.1 record (0 of 5 cuts clean), but the third answer is dead and no §4.5 pin is owed or present |
| 3 | `no-inline-invalidate-outside-seam` | **REFUTED (6)** — 1 unenforced (computed-literal-only fence); third answer dead. Best family note in the corpus (`:6-10` says why it exists beside its sibling) |
| 4 | `no-raw-intl-time` | **REFUTED (5, 6)** — 2 unenforced, one of which is the SAME unfalsifiable clause `no-raw-matchmedia` documents at length, one module over, undocumented here (D3); third answer dead on both arms |
| 5 | `bound-field-via-hook` | **REFUTED (5, 6)** — 1 mutually-redundant, 1 unenforced (computed spelling, falsifier built); third answer dead |
| 6 | `chat-stream-writes-in-bus-only` | **REFUTED (5, 6)** — 1 unenforced (computed spelling, falsifier built); third answer dead |
| 7 | `selection-store-via-factory` | **REFUTED (5, 6)** — 1 redundant prefilter + 1 unenforced (computed spelling, falsifier built); third answer dead |
| 8 | `render-error-via-battery` | **REFUTED (5, 6)** — the return-CONTAINMENT test is unenforced and a foreign return licenses a custom arm (D5, falsifier built); third answer dead; **no population port recorded** |
| 9 | `no-direct-useform` | **REFUTED (5, 6)** — 2 unenforced, one of which is an explicit CODE COMMENT claiming canonical-operation keying that no row proves (D4); the computed spelling its two siblings both pin is absent (falsifier built) |
| 10 | `theme-override-only-via-scope` | **REFUTED (5)** — 2 unenforced spelling fences; no third answer implemented, but the declared limit IS documented with its own row (the honest form) |
| 11 | `no-untrusted-html-in-main-dom` | **REFUTED (5)** — the attribute-NAME fence is unenforced and its cut makes the policy flag EVERY JSX attribute (D2, falsifier built); no third answer, declared limit documented |
| 12 | `no-raw-zustand-persist` | **REFUTED (5, 6)** — **4 unenforced**, incl. arm B's zustand-identity fence and a second explicit comment claiming a property no row proves (D6/D7); third answer dead; its `fix` is the one reviewed-grant `fix` that names no grant door |
| 13 | `registry-context-via-mint` | **REFUTED (3, 6)** — the only ORDINARY policy: its §4.2 arm exists and discriminates in BOTH directions, but its `fix` names no `@orb-waive` spelling (D9) in a module whose report position is deliberately NOT what a reader would call the offense; third answer dead |
| 14 | `no-effect-on-shared-selection` | **REFUTED (2, 5, 6) — the ANTI-pattern.** It FAILS OPEN on the shared reader's third answer (`=== "home"` at `:186` discards `unreadable`), 4 clean cuts, and a header that claims resolved identity without saying what happens when resolution fails (D1) |

**Copy candidate: `no-raw-matchmedia`, with D8 repaired first.** **Do NOT point a lane at
`no-effect-on-shared-selection`** — it is the one module in the family that converts the shared readers'
three answers back into two, in the direction that produces silence.

## Premise checks

1. **The 14 subjects the brief named are exactly the 14 the family test imports.** Re-derived from
   `home-client-family.test.ts:7-20` (imports) and `:25-39` (the `FAMILY` array). **No difference.**
2. **FRESH vs RE-AUDIT: 13 fresh, 1 re-audit.** Receipt: a per-id `grep -c` over the six prior audit
   documents. `no-raw-matchmedia` = 24 hits in `v-exemplar-audit-2026-09-12.md` (the wave-1 REFUTED
   SEVERE audit) + 4/1/1 incidental citations in waves 2/3/5. Every other id returns **zero hits across
   all six documents**. The one near-miss is `no-raw-intl-time`, which appears ONCE, at
   `v-audit-wave4-2026-09-12.md:290` — in a table of the three CARRIERS of
   `gate-ignore-grammar.repo.int.test.ts`, an unrelated finding about that suite's lost carriers. It was
   **not audited**; I count it FRESH. Positive control that the grep pattern works: `no-forward-ref`
   returns 10 hits in `v-audit-wave6`. **No double-count.**
3. **All 14 are FINAL `defineGate` policies** — loaded and branded by the conformance driver in this
   session (`verifyPolicyProofs` accepted each as a `GatePolicy`), and the real-tree `check:structure`
   ran all fourteen in its `171 final` pass.
4. **13 are `reviewed-grant`, 1 is `ordinary`** (`registry-context-via-mint`). This is the structural
   difference from every prior wave and it changes what is OWED: §4.2's identity arm is owed ONCE, and
   §5b.3's "`fix` names the exact waiver spelling" applies to ONE module. The reviewed-grant analogue —
   the `fix` naming the reviewed-grant door — is met by 12 of 13.

## What I ran

| Instrument | Result |
| - | - |
| `verifyPolicyProofs([policy])` per module (the exact function `ops/policy-conformance-stage.ts` and `home-client-family.test.ts:42-44` call) | baseline **0 failures** for all 14 |
| **instrument controls, run FIRST** | `TOKEN_PREFIX "--color-"`→`"--nope-"` on `theme-override-only-via-scope` → **RED 4**; `count: 1`→`count: 99` → **RED 1**; a comment-only no-op → **CLEAN**. The harness discriminates in both directions |
| 85 §4.1 narrowing cuts + 4 CLUSTER cuts | 56 RED / 29 clean, every cut `cp`-backed and restored in a `finally` |
| 8 falsifier rows, each run in BOTH arms (row alone → row + its cut) | **8 of 8 PASS unmodified and RED under their cut** |
| 11 third-answer reachability probes (a `throw` planted in the `unreadable` branch) | **10 branches proven UNREACHED** by their module's own rows; 1 reached |
| 2 `messageIncludes` transplants + 1 substring-trap control | both transplants RED; the trap control (`UNREADABLE` rebuilt as `` `${MESSAGE} …` ``) **passes CLEAN** — the disjointness is real but unpinned |
| §4.2 dead-position control + foreign-policy-id control on `registry-context-via-mint` | **both RED** |
| planted fail-open in `no-raw-matchmedia` (`classifyOriginRefusal` → `return "other"`), family test run | **2 of 14 family tests FAIL**, incl. the DOM-less arm — the family pin discriminates |
| `pnpm test:scoped tests/tooling/verify/gates/home-client-family.test.ts` (clean tree) | **14 passed, exit 0**, 11.36s |
| `ast-grep --lang ts` over `tooling/src/verify/gates/` | `getDescendantsOfKind` 155 matches in the corpus, **0 in my 14**; `forEachDescendant` 61 / 0; `getSourceFiles()` 45 / 0; `new Project` 2 (`enforcement-registry-parity.ts:280`, `dangling-refs.ts:186`), **neither mine** |
| `pnpm check:structure` (ONCE) | **`0 tool error(s)` · `0 withheld`**; `complete: true`, `ran 275` (104 legacy + 171 final), `0 alarm(s)`, `raw 1452 = waived 1150 + granted 105 + effective 197`. Read from the run's own artifact, slot `reports/runs/structure/agent-a4f55c05277e8bc3d-3655892-2026-09-12T00-32-35-971Z/`. Exit **1** (violations), not exit 2 — a verdict, not a tool error |

`git status --short` was EMPTY after every batch and at the end.

### The two mandated `check:structure` numbers, and all fourteen real-tree populations

`0 tool error(s)` · `0 withheld`. Every module ran on a non-empty population with its home receipts
resolving, and **34 of the table's 105 grant rows are consumed by this family with 0 alarms** — no stale
and no over-broad row:

| Module | real-tree population | receipts | grants consumed |
| - | -: | - | -: |
| `bound-field-via-hook` | 15 | `forms/editor/contexts.ts`: 1 | 1 |
| `chat-stream-writes-in-bus-only` | 5296 | `state/chat-stream.ts`: 1 | 2 |
| `client-cache-surgery-only-in-data` | 1319 | — | 9 |
| `no-direct-useform` | 7421 | — | 2 |
| `no-effect-on-shared-selection` | 1004 | shared-selection pointers: 7 | 0 |
| `no-inline-invalidate-outside-seam` | 1319 | — | 1 |
| `no-raw-intl-time` | 7421 | — | 1 |
| `no-raw-matchmedia` | 1685 | — | **5** |
| `no-raw-zustand-persist` | 1319 | `registerDurableLocalStore`: 1 | 4 |
| `no-untrusted-html-in-main-dom` | 1685 | — | 0 |
| `registry-context-via-mint` | 1319 | `lib/registry.ts`: 2 | 0 |
| `render-error-via-battery` | 1319 | boundary: 1 · battery: 1 | 3 |
| `selection-store-via-factory` | 14 | `state/create-gated-store.ts`: 1 | 3 |
| `theme-override-only-via-scope` | 1685 | — | 0 |

**Caveat, stated rather than hidden.** The structure run spanned `00:32:35.972Z → 00:38:00.221Z`; my
first gate-file write was at `00:33:31` (mtime of `wave7-control.json`), 56s in. The loader imports each
gate module ONCE, dynamically, at corpus load (`lib/loader.ts:159`), which precedes the 104-module legacy
pass that occupies the run's first \~3 minutes — so the imports were complete well before the write. The
only module in the write window is `theme-override-only-via-scope`, and both of its cut variants produce
the SAME real-tree output (zero findings, which is also what its header claims the tree holds), so the
verdict is unaffected either way. I did not re-run; a second whole-tree pass with four sibling lanes live
buys nothing this reasoning does not.

## §4.1 — the four-way classification, per module

**Naive 29 of 85 clean. Classified: 17 UNENFORCED, 8 MUTUALLY REDUNDANT, 4 UNFALSIFIABLE.**

| Module | cuts | RED | UNENFORCED | MUT-REDUNDANT | UNFALSIFIABLE |
| - | -: | -: | -: | -: | -: |
| `no-raw-matchmedia` | 11 | 10 | 0 | 0 | 1 (`memberPath.length === 0`, DECLARED) |
| `client-cache-surgery-only-in-data` | 5 | 5 | 0 | 0 | 0 |
| `no-inline-invalidate-outside-seam` | 5 | 4 | 1 | 0 | 0 |
| `chat-stream-writes-in-bus-only` | 4 | 3 | 1 | 0 | 0 |
| `no-untrusted-html-in-main-dom` | 2 | 0 | 1 | 1 | 0 |
| `bound-field-via-hook` | 5 | 3 | 1 | 1 | 0 |
| `selection-store-via-factory` | 6 | 4 | 1 | 1 | 0 |
| `no-raw-intl-time` | 8 | 6 | 1 | 0 | 1 (`memberPath.length === 1`, UNdeclared) |
| `render-error-via-battery` | 6 | 4 | 1 | 0 | 1 (home-missing return) |
| `registry-context-via-mint` | 6 | 4 | 1 | 0 | 1 (home-missing return) |
| `no-direct-useform` | 6 | 3 | 2 | 1 | 0 |
| `theme-override-only-via-scope` | 5 | 2 | 2 | 1 | 0 |
| `no-effect-on-shared-selection` | 7 | 3 | 2 | 2 | 0 |
| `no-raw-zustand-persist` | 9 | 5 | 3 | 1 | 0 |
| **TOTAL** | **85** | **56** | **17** | **8** | **4** |

### Why the naive figure over-reports by 71% here, and it is NOT the wave-5 reason

Wave 5's inflation was mutual redundancy. **This family's inflation is a DECLARED PERFORMANCE PREFILTER
whose clean cut is CORRECT and is the module telling the truth.** Three modules (`no-direct-useform:292-297`,
`selection-store-via-factory:80-92`, `no-raw-zustand-persist:157-160`) carry a callee-NAME prefilter in
front of the identity reader, with a comment saying exactly why ("resolving a canonical origin for every
call in the nine authored roots does not finish"). Cutting the whole prefilter is CLEAN — the identity
fence behind it rejects everything the prefilter would have — while cutting only its ALIAS half REDs:

```
no-direct-useform | D1 mint-name prefilter (whole)      | CLEAN
no-direct-useform | D2 alias-index half only            | RED 1
```

A sweep that counts D1 as a gap is counting the module's own honesty as a defect. **This is a fifth
classification in practice and the design doc should name it: a WIDENING cut that comes back clean on a
declared performance prefilter is not a gap.** The correct probe is to cut the prefilter's discriminating
HALF, which is what D2/G1/K9 do, and all three RED.

### The MUTUALLY REDUNDANT eight, each proved by a cluster cut

Per §4.1 ("when two cuts in one function both come back clean, cut them TOGETHER"), every redundancy
claim here is a cluster measurement, not an inference:

| Cluster | individually | together |
| - | - | - |
| `bound-field-via-hook` import-door + identifier-callee | `E1 RED 1`, `E2 CLEAN` | **`E1+E2 RED 4`** |
| `no-raw-zustand-persist` registry-file + `declaredByFile` | `K3 RED 1`, `K4 CLEAN` | **`K3+K4 RED 1`** |
| `no-effect-on-shared-selection` dep-present + dep-is-array | `L1 CLEAN`, `L2 CLEAN` | **`L1+L2 RED 1`** |
| `no-raw-intl-time` `globalName===INTL` + `memberPath===1` | both CLEAN | `I3+I4 CLEAN` — **but removing the whole resolved-global branch is `I10 RED 2`** |

The last row is the interesting one and it is the worked case §4.1 asks for. The two clauses INSIDE
`intlVerdict`'s resolved branch are jointly uncuttable-as-a-discriminator, yet the branch itself is
load-bearing: `readsAmbientGlobalPath` (the cast axis) does NOT carry the two founding rows. So the
branch stays and its DISCRIMINATION is unpinned — which is an UNENFORCED clause plus an UNFALSIFIABLE
one, not "the branch is dead".

### The 17 UNENFORCED, with the falsifier each one needs

**8 falsifiers BUILT and verified in both arms** (the row passes the unmodified module and REDS under its
cut). These are ready to paste:

| # | Module `path:line` | the unpinned fence | falsifier | both arms |
| -: | - | - | - | - |
| 1 | `no-untrusted-html-in-main-dom.ts:55` | the attribute-NAME fence — cut it and the policy flags EVERY JSX attribute | `mustPass` `<div className='x' />` | CLEAN → **RED 1** |
| 2 | `no-direct-useform.ts:45-49` | the computed-literal callee arm | `mustFlag` `form["useForm"]()` | CLEAN → **RED 1** |
| 3 | `chat-stream-writes-in-bus-only.ts:52-56` | the computed-literal member arm | `mustFlag` `state["chatStream"].push()` | CLEAN → **RED 1** |
| 4 | `selection-store-via-factory.ts:47-51` | the computed-literal callee arm | `mustFlag` `store["createGatedStore"](…)` | CLEAN → **RED 1** |
| 5 | `bound-field-via-hook.ts:48-52` | the computed-literal callee arm | `mustFlag` `forms["useFieldContext"]<string>()` | CLEAN → **RED 1** |
| 6 | `no-raw-zustand-persist.ts:109` | ARM B's `getInitialState` fence | `mustPass` `store.setState(store.getState(), true)` | CLEAN → **RED 1** |
| 7 | `no-effect-on-shared-selection.ts:261` | the React effect-ORIGIN fence | `mustPass` a file-local `function useEffect` + a real pointer | CLEAN → **RED 1** |
| 8 | `render-error-via-battery.ts:109` | the return-CONTAINMENT test | `mustFlag` a block-bodied custom arm in a file with an unrelated `return <QueryErrorState/>` | CLEAN → **RED 1** |

**9 named but NOT built** (shape given; I ran out of budget before constructing them, and say so rather
than implying coverage): `theme-override-only-via-scope:46` (a string-valued `style="…"` attribute) and
`:80` (a non-`style` attribute carrying a `--color-*` object); `no-inline-invalidate-outside-seam:52` (a
NON-literal computed member access); `no-direct-useform:115` (the canonical-operation keying, D4 — this
one needs a family-test grant pin, not a row, because `runPass` pins `reviewedGrants: []`);
`no-raw-intl-time:82` (a formatter-named member on a DIFFERENT resolved global);
`no-raw-zustand-persist:318` (a BARREL re-exporting `registerDurableLocalStore`, D6) and `:149` (a
non-zustand store's destructive replace, D7); `no-effect-on-shared-selection:181` (an unplaceable pointer
receiver, D1); `registry-context-via-mint:127` (a `createContext(null)` with no type argument).

## The #944 THIRD ANSWER — reached in 1 of 11

I replaced the `unreadable` branch with `throw new Error("WAVE7-UNREADABLE-REACHED")` in each module that
implements it and ran that module's own declared rows. **0 failures means UNREACHED.**

| Module | implements the arm? | messages disjoint? | reached by a declared row? |
| - | - | - | - |
| `no-raw-matchmedia` | yes | yes | **YES** — `mustFlag[8]`, `messageIncludes: "CANNOT be established"` |
| `no-inline-invalidate-outside-seam` | yes | yes | **NO** |
| `client-cache-surgery-only-in-data` | yes | yes | **NO** |
| `no-direct-useform` | yes | yes | **NO** |
| `bound-field-via-hook` | yes | yes | **NO** |
| `chat-stream-writes-in-bus-only` | yes | yes | **NO** |
| `selection-store-via-factory` | yes | yes | **NO** |
| `render-error-via-battery` | yes | yes | **NO** |
| `no-raw-intl-time` | yes (BOTH arms) | yes | **NO** on both |
| `no-raw-zustand-persist` | yes | yes | **NO** |
| `registry-context-via-mint` | yes | yes | **NO** |
| `theme-override-only-via-scope` | **no** — `unreadableMessage: MESSAGE`, `unreadable` never set | identical | n/a — declared limit documented (`mustPass[2]`) |
| `no-untrusted-html-in-main-dom` | **no** — same | identical | n/a — declared limit documented (`mustPass[2]`) |
| `no-effect-on-shared-selection` | **no** — same, AND it discards the reader's verdict | identical | n/a — **undocumented, see D1** |

The single module that proves its arm is again the single module that wrote `messageIncludes`. That is
the second family in a row, with no author overlap, so treat it as the program's reliable predictor:
**grep a family for `messageIncludes`; the modules without it have a dead third answer.**

Two of the three non-implementers are HONEST — they say in the header that an unreadable subject is out
of subject and carry a `mustPass` row for it, which §4.1 names as the correct outcome. Passing
`unreadableMessage: MESSAGE` in all three is a §5b.1 over-declaration (a parameter the code cannot reach)
and it is the substring trap in its terminal form: two names bound to ONE string can never discriminate
in either direction.

## Expectation rows (#1968)

**71 `mustFlag` rows across 14 modules. 0 missing `count`. 18 carry `token`. 0 carry `line`. 3 carry
`messageIncludes`, all three in `no-raw-matchmedia`.**

| Module | mustFlag | mustPass | rows with `token` | rows with `messageIncludes` |
| - | -: | -: | - | - |
| `bound-field-via-hook` | 5 | 4 | \[0] | — |
| `chat-stream-writes-in-bus-only` | 4 | 4 | \[0] | — |
| `client-cache-surgery-only-in-data` | 6 | 4 | \[0,2,5] | — |
| `no-direct-useform` | 5 | 4 | \[0] | — |
| `no-effect-on-shared-selection` | 5 | 4 | — | — |
| `no-inline-invalidate-outside-seam` | 4 | 4 | \[0] | — |
| `no-raw-intl-time` | 8 | 5 | \[1,5] | — |
| `no-raw-matchmedia` | 9 | 8 | \[0] | **\[5,6,8]** |
| `no-raw-zustand-persist` | 6 | 5 | \[0,2,4,5] | — |
| `no-untrusted-html-in-main-dom` | 3 | 4 | \[0] | — |
| `registry-context-via-mint` | 4 | 6 | — | — |
| `render-error-via-battery` | 4 | 6 | \[0] | — |
| `selection-store-via-factory` | 4 | 3 | \[0] | — |
| `theme-override-only-via-scope` | 4 | 4 | \[0] | — |

**No tautological `messageIncludes` in the family.** The three that exist discriminate, proven by
TRANSPLANT (I swapped each arm's substring for its sibling arm's and both went red):

```
T1 mustFlag[5] takes the UNREADABLE substring ("CANNOT be established")  | RED 1
T2 mustFlag[8] takes the PRECISE substring ("outside the named …")       | RED 1
T3 UNREADABLE rebuilt as `${MESSAGE} …` (the substring trap)             | CLEAN  ← unpinned hazard
```

T3 is a finding of its own: the disjointness that makes the ONE working third-answer pin work is itself
held by nothing. A future edit that folds `MESSAGE` into `UNREADABLE` keeps all three rows green and
silently destroys the family's only proven fail-closed arm. There is no row that can catch it, because
both substrings still match; it needs an equality assertion in the family test.

## §4.2 — the one ordinary policy, verified in both directions

`registry-context-via-mint` carries its arm as `mustPass[5]` (the in-module shape §4.2 sanctions, the
`schema-branding.ts:137` form), on a fixture that is `mustFlag[0]` plus the marker line — so it produces
exactly ONE finding, which is §4.2's cardinality requirement. I ran the two controls §4.2 asks for:

```
M7 flip the position (Registry)→(Bar)                  | RED 1
M8 flip the policy id → no-raw-matchmedia(Registry)    | RED 1
```

**It discriminates.** `proofFailure` runs `toolFailure` first and fails on any `authorityAlarms`, so the
three assertions §4.2 demands are all live inside the row. No negative arm is present and none is owed.
The other 13 are reviewed-grant and owe no waiver arm at all; their grant identity is proved beside the
family (§4.3) by four `runPolicyPass` pins in `home-client-family.test.ts:259-305` — exact consumption,
dedupe to exactly one, staleness, and wrong-operation — which I ran and which pass.

## §4.5 — refusal and receipt pins: 7 of 7 owed, all present

Seven modules make their verdict depend on locating a home or a derived population. **All seven have a
`runPolicyPass` refusal pin in the family test** — `bound-field-via-hook` (`:115`),
`chat-stream-writes-in-bus-only` (`:126`), `selection-store-via-factory` (`:135`),
`render-error-via-battery` (`:144`), `registry-context-via-mint` (`:155`), `no-raw-zustand-persist`
(`:163` — the §4.6 blindness arm), `no-effect-on-shared-selection` (`:172`, which additionally asserts
the receipt's `members: 1, unresolved: 6` rather than only the tool error). This is the best §4.5 record
in the program and it is why the two clean cuts on the home-missing early returns
(`render-error-via-battery` H7, `registry-context-via-mint` M9) are UNFALSIFIABLE rather than gaps: the
receipt refuses at `policyReceiptFailures` before the return can matter, and a withheld owner emits
nothing at all.

The family test also carries a **fixture-specifier resolution control** (`:93-107`, `checked > 20`) and
the **DOM-less `lib` pin** (`:220-238`) that no proof row can express. I proved the latter
DISCRIMINATES by planting the exact regression it names — `classifyOriginRefusal` → `return "other"` in
`no-raw-matchmedia` — and running the suite: **2 of 14 tests failed, including the DOM-less arm**, with
`mustFlag[8]` reporting `expected at least one effective finding but got 0`.

## DEFECTS

### D1 — `no-effect-on-shared-selection` FAILS OPEN on the shared reader's third answer (HIGH) — the ANTI-pattern

`classifyProjectDirectoryOrigin` (`lib/project-home-origin.ts:212-223`) is a THREE-way verdict: it routes
an unresolved origin through `classifyOriginRefusal`, which returns `"unreadable"` for case (b). The
policy discards that:

```ts
// no-effect-on-shared-selection.ts:186
.filter((callee) => classifyProjectDirectoryOrigin(callee, STATE_DIR, POINTERS) === "home")
```

`=== "home"` means an `unreadable` pointer receiver is treated **identically to a proven non-pointer** —
the reference is dropped, the taint never seeds, and the effect passes silently. Every one of the eleven
siblings that consumes a three-way verdict writes `!== "other"` and reports. Measured both ways: flipping
the predicate to `!== "other"` changes NOTHING in the declared rows (`L7 CLEAN`), so the behaviour is
pinned in neither direction and a future reader change moves the policy between fail-open and fail-closed
with every row staying green.

It compounds: the effect half of the same file DOES fence `!== "other"` (`:261`) but the candidate never
carries `unreadable`, so an effect door the readers could not place is reported with the PRECISE message
claiming certainty (§5b.2). And the header (`:18-25`) sells the conversion as "IDENTITY, NOT SPELLING …
RESOLVED to a declaration under `packages/client/src/state/`" without ever saying what the policy does
when resolution fails. **This is the module a lane must not copy**, because the shape it teaches is
exactly the one #944 exists to forbid.

### D2 — `no-untrusted-html-in-main-dom`: the attribute-NAME fence is the whole policy and nothing pins it (HIGH)

`no-untrusted-html-in-main-dom.ts:55` is the only narrowing the module has, and cutting it is CLEAN:

```
A1 attribute-NAME fence   | CLEAN      ← the policy now flags className, key, onClick, everything
A2 isJsxAttribute guard   | CLEAN      ← mutually redundant with the visitor's `kinds`
```

The reason is visible in the fixtures: not one of the four `mustPass` rows contains an ordinary JSX
attribute. `mustPass[0]`/`[3]` are `<div>{'x'}</div>`, `mustPass[1]` is a plain object property (which
the visitor's `kinds` already excludes, so its `why`'s mechanism is right but its fence is not the one it
credits), and `mustPass[2]` is a `JsxSpreadAttribute`, a different node kind. For a **D44 SECURITY**
policy on `@client` + `@ui` (1685 real-tree files), the entire subject reduces to one string comparison
with no counterexample. Falsifier built: `mustPass` `<div className='x' />` → CLEAN unmodified, **RED 1**
under the cut. One row closes it.

### D3 — `no-raw-intl-time` carries `no-raw-matchmedia`'s UNFALSIFIABLE clause without the paragraph that makes it honest (MEDIUM)

`no-raw-matchmedia.ts:41-47` spends seven lines explaining why `memberPath.length === 0` cannot be
falsified (reviewed-grant dedupe collapses the only counterexample onto an already-flagging node) and
concludes "it is enforced by no fixture, and saying so is cheaper than a row that pretends". §4.1 cites
that exact case as the worked UNFALSIFIABLE example.

`no-raw-intl-time.ts:82` is the same clause one index over — `memberPath.length === 1` in `intlVerdict` —
measured CLEAN (`I3`), with the same dedupe reason, and **its header says nothing at all**. The sibling
clause `globalName === INTL` in the same expression is also CLEAN (`I4`) but is genuinely UNENFORCED: a
formatter-named member read off a different resolved global falsifies it. So one expression carries one
honest-but-undeclared limit and one real gap, and the header distinguishes neither. The fix is one
paragraph plus one row, and the paragraph already exists, in the module next door.

### D4 — `no-direct-useform`: a code comment claims canonical-operation keying that no row proves (MEDIUM)

`no-direct-useform.ts:113-115`:

```ts
// Keyed on the CANONICAL export, never the local spelling: an aliased import must consume the
// same grant row as the plain one. An unreadable candidate keys on what it was spelled.
operation: `${OPERATION_PREFIX}:${exportedName ?? name}`,
```

Replacing `exportedName ?? name` with `name` is **CLEAN** (`D4`). `mustFlag[2]` (the alias row) asserts
only `count: 1`; the operation STRING it produces is asserted by nothing, so the claim "an aliased import
must consume the same grant row" is a header promise with no enforcer. §4.7 names this shape exactly: "a
header that says 'this row proves X' for a row never shown to catch X is a defect." It is genuinely not
closable by a proof row — `runPass` pins `reviewedGrants: []` (§4.2's "where the protection stops") — so
it belongs in the family test beside the four grant pins that are already there.

### D5 — `render-error-via-battery`: a foreign `return` licenses a custom arm (MEDIUM)

`isBatteryArm` (`:104-110`) asks whether ANY indexed return that lies inside the arm's block body roots in the
battery. Dropping the `contains(range, candidate.range)` half is **CLEAN** (`H5`) — no fixture has two
return sites in one file with different verdicts. Falsifier built: a file with a block-bodied CUSTOM arm
AND an unrelated `export function Other() { return <QueryErrorState label="y" />; }`. Under the cut the
foreign return licenses the custom arm and `count: 1` drops to 0 → **RED 1**. Since the return index is
exactly what replaced the legacy `getDescendantsOfKind(ReturnStatement)` walk, its containment test IS the
conversion's correctness claim, and it is the claim nothing checks.

### D6/D7 — `no-raw-zustand-persist`: two more comment-claims and an unfenced arm (MEDIUM, two rows)

Three of this module's four clean cuts each carry an explicit claim:

- **D6, `:310-312`:** *"DECLARES, not merely re-exports: the state barrel forwards
  `registerDurableLocalStore` too, and a barrel is not the registry."* Cutting the `declarations.every(… === sourceFile)` half is **CLEAN** (`K6`) — no fixture contains a barrel. The falsifier is one file.
- **D7, `:147`:** ARM B's zustand-identity fence. Cutting it is **CLEAN** (`K8`) — `mustPass[2]`
  (`store-lookalike`) exercises ARM A's `persist` and never `setState`, so a non-zustand store's
  `x.setState(x.getInitialState(), true)` reports and nothing notices. The module's own header says arm B
  "ALSO ASKS THE UNCAST RECEIVER"; the receiver's PACKAGE is the half with no row.
- `:109` (the `getInitialState` fence) is the fourth, **falsifier built** (table above).

Separately, its `fix` is the only one of the thirteen reviewed-grant `fix` strings that does not name the
reviewed-grant door, so an author firing at the licensed factory home is given no route to the table.

### D8 — `no-raw-matchmedia`'s header and roster row both UNDERCOUNT its own grant table, and one stated reason is now false (MEDIUM — and it gates the copy recommendation)

`no-raw-matchmedia.ts:6-13` and `Core-Enforcement-Active-Gates.md:286` both enumerate the permissions and
both say **"All four"**. The table holds **FIVE** rows for this policy and the real-tree run consumed
**all five** with 0 alarms (`granted 5`). The fifth is
`no-raw-matchmedia:coarse-pointer-now` (`lib/reviewed-grants.ts:401-409`,
`packages/ui/src/lib/coarse-pointer-now.ts`, the #1182 one-home).

The undercount is not cosmetic. The header's stated REASON for the media-grid permission is
*"no coarse-pointer home exists"* — described as "a standing state of the tree". A coarse-pointer home
DOES exist, holds its own grant row, and is named by this policy's own `message` at `:62`
(`coarsePointerNow()`). The media-grid grant itself is still correct (its `endsWhen` is two conditions —
the home lands AND the call reads it — and only the first is met), but the header's justification for it
is a tree fact that stopped being true. **Roster rows name MECHANISMS, and this one names a mechanism
that has moved.** Repair both before any lane is pointed here.

### D9 — the family's one ordinary policy gives its author no waiver spelling (§5b.3, MEDIUM)

`registry-context-via-mint`'s `fix` (`:256`) is *"replace the hand `createContext<XRegistry | null>(null)`
and its Provider with a `createRegistryContext<XRegistry>(name)` mint call from #lib."* — a correct
remediation and **no `@orb-waive` spelling**. §5b.3 exists because "the position is routinely not what a
reader would call the offense", and this module is the textbook case: its own `mustPass[5]` `why` explains
at length that the report anchors on the TYPE ARGUMENT and the derived position is `Registry`, *"not the
`createContext` callee"*. An author who fires on it will guess `createContext` and get a dead-position
`AUTHORITY ALARM`. §5b.3: **0 of 1.**

### D10 — the substring trap is unpinned in the one module that avoids it (LOW, family test)

See T3 above. `no-raw-matchmedia`'s `MESSAGE`/`UNREADABLE` disjointness is what makes its three
`messageIncludes` rows work, and nothing asserts it. A one-line equality/`includes` assertion in the
family test converts a convention into a check.

## §5b header honesty — what the headers claim against what the tree says

- **§5b.5 population port: 12 of 14 record it.** The two that do not are
  `no-inline-invalidate-outside-seam` (`population: "@client"`, bare) and `render-error-via-battery`
  (same) — both are @client-wide with no legacy delta to explain, so the omission is thin rather than
  false, but it is the one criterion the rest of the family meets and these two silently skip.
- **§5b.4 family: 1 of 14 fully.** Four carry a REAL shared family string (`tanstack-query-origin` ×2,
  `react-origin` ×2) and two of those name the shared reader MODULE
  (`no-inline-invalidate-outside-seam:21`, `client-cache-surgery-only-in-data:19-20` — both
  `lib/project-home-origin.ts`). Ten are singletons whose `family` equals their `id`, and **only
  `no-raw-matchmedia:20-25` declares the singleton WITH its reason and names all four borrowed readers as
  module + function.** That paragraph is the shape §5b.4 is asking for and it exists exactly once.
- **Header claims I checked and found TRUE:** `no-raw-matchmedia`'s entire narrowing census (`:34-40`)
  names eight fences and the row that dies without each — I cut all eight and **all eight RED**, and its
  declared-unfalsifiable ninth is the family's only clean cut there. `theme-override-only-via-scope` and
  `no-untrusted-html-in-main-dom` both claim "no grant rows today"; the real-tree run confirms `granted 0`
  for both. `no-effect-on-shared-selection` claims the shell "chases NOTHING on this tree"; confirmed,
  `granted 0` on a 1004-file population.
- **Header claims I found FALSE:** D8 (matchmedia's "All four" and its coarse-pointer reason), D4, D6
  (claims whose rows do not exist).

## §5b.7 / §12.3 — nothing forbidden survives behind the contract

Across the fourteen: **0** `getDescendantsOfKind`, **0** `forEachDescendant`, **0**
`Project#getSourceFiles`, **0** `new Project`, **0** `node:fs` / `node:path` / `readFileSync`, **0** reads
of a provider's own `.receipts`. Each negative carries a non-zero corpus control from the SAME invocation
(155 / 61 / 45 / 2 matches respectively elsewhere in `gates/`), and the literal grep control fires
(`reviewed-grant` = 9 hits in `no-raw-matchmedia.ts`). The two `new Project` sites are
`enforcement-registry-parity.ts:280` and `dangling-refs.ts:186`, neither mine.

**#1972 (`ctx.relativePath` is PARTIAL): 0 exposure, 20 call sites checked.** Every site passes either a
`sourceFile` handed to a visitor by the dispatcher (a VISITED node's file, always in the population) or
`ctx.relativePath` itself as a callback to `locateProjectHome(ctx.files, …)`, which only ever maps over
resolved population members. Where a RESOLVED declaration's home is needed, the family uses the total
house idiom — `canonical.sourceFile.getFilePath().replaceAll("\\","/")` inside
`lib/project-home-origin.ts:221` — not `ctx.relativePath`. This family is clean on the axis that killed
`freeze-provenance-write-pairing`.

## The copyable module, and the anti-pattern

**COPY `no-raw-matchmedia` — after D8.** It is the only module in 26 audited across waves 6 and 7 whose
third answer is REACHED, and it got there the only way that works: a `mustFlag` row whose `expect` names
the unreadable message. It is also the only one that writes a NARROWING CENSUS naming the row that dies
without each fence (I cut all eight; all eight red), the only one that DECLARES its unfalsifiable clause
with the measurement instead of inventing a row, the only §5b.4-complete header, and the only one whose
`lib`-dependent claim was measured, found false, WITHDRAWN in both the module and the roster, and replaced
with a pin in the one place a proof row cannot reach (the family test's DOM-less program). Its repair
held, and I proved the pin discriminates by planting the regression it names.

Its two repairs are the header/roster grant count and the stale coarse-pointer reason — paperwork against
a live table, not mechanism.

**Runner-up on §4.1 alone: `client-cache-surgery-only-in-data`** — 5 of 5 cuts RED, the only perfect
narrowing record in the family, six `mustFlag` rows including both halves of grant granularity. It is not
the copy candidate because its third answer is dead and its header records no family reason.

**The ANTI-pattern is `no-effect-on-shared-selection` (D1):** a converted policy that consumes a
three-answer shared reader and writes `=== "home"`, turning the third answer back into silence, with four
clean cuts and a header that never mentions the failure mode. Copying it propagates the exact regression
\#944 was minted to stop.

## What I did NOT cover

- **9 of the 17 UNENFORCED cuts have a named falsifier shape but no BUILT row.** I verified 8 in both
  arms; the other 9 are asserted from the cut result plus a reading of the fixture set, which is weaker.
- **No §4.6 conversion differential.** I did not load any legacy descriptor from a pre-conversion SHA or
  replay original examples. Every verdict here is against the FINAL module as it stands.
- **`tests/tooling/verify/lib/reviewed-grants.ts`'s 105 rows were not audited for `why`/`endsWhen`
  quality** beyond the five `no-raw-matchmedia` rows that D8 turns on. The structure run's `0 alarm(s)`
  proves liveness (nothing stale, nothing over-broad) and nothing more.
- **I did not run `gate-ignore-grammar.repo.int.test.ts` or `gate-conformance.repo.int.test.ts`** —
  reserved to the orchestrator, as briefed.
- **`pnpm check:structure` ran ONCE**, with a stated 56-second overlap between its start and my first
  probe write; see the caveat above for why the verdict stands. I did not re-run it.
- **The real-tree TRUTH of each policy's findings was not re-derived.** I take the structure run's
  per-policy lines as evidence of population and receipt health, not as evidence that each policy finds
  what it should on the live tree.
- **`no-raw-zustand-persist`'s ARM C blindfold semantics** were measured only through the cut (`K5 RED
  10`); I did not verify against the live `durable-local.ts` that the arm's model of the registry matches
  the real file.
- Wave-7 scratch lived under `/tmp/.../scratchpad/wave7-*`; every gate-file probe was `cp`-backed in this
  worktree and restored in a `finally`, and `git status --short` was empty at the end.
