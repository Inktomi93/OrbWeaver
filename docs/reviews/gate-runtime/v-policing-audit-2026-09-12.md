---
kind: review
status: active
updated: 2026-09-12
---

# Adversarial verification of the policing-surface merge `a1c848001` (#2111, #2096, #2097, #2025, #1584)

Lane `cb-v-policing-audit`, fresh-context Opus verifier, worktree `agent-a222dd1c3e944d295` at
`da1fc0126` (five commits past `a1c848001`; `3ed1a7d7a` closed three ARM B importers in between, which is
why `policy-legacy-imports` reads 9 here and 12 on the forge's final base). **Every number below is from a
run in this session; the forge's counts were read only to be compared against, never quoted as evidence.**

## VERDICT

**CONFIRMED — 8 of 8 built items.** Every enforcer this merge added bites in both directions, the two
cuts prove the registration predicate is load-bearing, and no arm was caught accusing correct code.
**5 defect rows follow** — four are undeclared limits / header-vs-code drift in the new modules (none of
which weakens a live verdict today), one is a live blocking alarm owned by a different commit.

| # | built item | verdict | the receipt I produced |
| -: | - | - | - |
| 1 | `pnpm check:policy-conformance` whole | **CONFIRMED** | exit 0; `248 final · 2942 proof rows · 7 refusal rows · 0 failure(s) · 206 grant rows (whole table) · 0 invalid · corpus 302 (54 legacy)`. Re-derived INDEPENDENTLY through `loadMixedGateCorpus` (the stage writes no artifact — stdout is its only output, `ops/policy-conformance-stage.ts`): `{files:302, final:248, legacy:54, mustFlag:1431, mustPass:1511, proofRows:2942, mustRefuse:7}`, the 7 refusal rows across 6 carriers (`bus-producer-coverage` ×2, `policy-binding-resolution`, `policy-legacy-imports`, `policy-soundness`, `user-bus-deferred-member`, `warning-code-coverage`) |
| 2 | ARM B (#2096) — target judged by REGISTRATION | **CONFIRMED** | 6 planted cases of my own + 2 planted cuts (below). (a) final sibling → 1 finding, "a final gate module"; (b) legacy sibling (`export const gate = {…}`) → 1, "a legacy gate module"; (c) `./_proof/<x>.ts` → 0 and `../lib/<x>.ts` → 0; (d) non-registering top-level sibling → 0; (e) unresolvable relative specifier → 1, "resolves to NOTHING"; plus `export * from` a registering sibling → 1 |
| 3 | ARM A — nine forbidden homes by IMPORT ORIGIN | **CONFIRMED** | all NINE homes planted independently, each with its same-basename twin under `gates/`: **9 real-home hits, 9 same-basename-elsewhere acquittals, 18 controls, 0 mismatches.** ALIAS ROUTE: the same `contract/gate.ts` reached as `"../../verify/contract/gate.ts"` also reds (identity, not spelling) |
| 4 | `policy-binding-resolution` (#2097) — ten members by receiver identity | **CONFIRMED** | **25 controls, 0 mismatches**: each of the ten members reds on a ts-morph receiver; each of the ten is CLEAN on a local object carrying a method of the same name; `VariableStatement#getDeclarations` clean by owner; the `any`-receiver DECLARED LIMIT run and clean; `getSymbol()` alone clean; alias + `.call()` reds; two sites = two findings. The family's own six modules are absent from the arm's 23 real-tree findings (structure leg) |
| 5 | #2025 `hard` + `warning` refused at load, four flips | **CONFIRMED** | validator: `hard`+`warning` REFUSED naming `#2025`; `hard`+`error`, `ordinary`+`warning`, `reviewed-grant`+`warning` admitted. THROUGH THE REAL LOADER: a planted `gates/cbvpa-loader-probe.ts` made `loadMixedGateCorpus` throw `gate module …: Invalid gate policy: descriptor.severity "warning" contradicts authority "hard" (#2025)` (module removed in `finally`). The four carriers read `hard`/`error` on the tree; the only `severity: "warning"` policy left is `over-art-plate-arm` (`ordinary`, `workItem: 2024`). SHARED-VALUE SWEEP: 1670 `.ts`/`.tsx` under `tests/tooling/**` + `tooling/src/**` scanned for `severity:"warning"` within ±14 lines of `authority:"hard"` — **7 proximity hits, all benign** (5 are `policy-loader.test.ts`'s own #2025 pin asserting the throw; 2 are adjacent-but-separate `hard-policy`/`ordinary-policy` rows in a `knownPolicies` list). Planted positive control on the regex pair confirms the sweep can match |
| 6 | the refusal envelope + the fourth `mustRefuse` rule | **CONFIRMED** | 7 generic needles (`ERROR`, `OWNER`, `resolved zero members`, `[evaluate]`, `PASS TOOL ERROR`, `policy receipt refused`, `population has not resolved`) all REFUSED naming the containing member; 2 authored needles admitted; `mustRefuse: []`, and `count`/`line`/`token` inside a `mustRefuse` row, and a missing/blank `messageIncludes` — all 6 REFUSED. **DERIVED, proven by cut:** scratch copies of `contract/policy-pass.ts` (one value changed) + `lib/policy-refusal-envelope.ts` (import repointed), both anchors asserted exactly once, both `rm`'d in `finally` → envelope 147 members on both sides, `"resolved zero members"` GONE and `"cbvpa-DERIVED-MARKER members"` PRESENT |
| 7 | E7 (non-literal `defineGate`) and `entire-population ⇒ evaluate` | **CONFIRMED** | E7: `defineGate({…})` literal → 0 findings; `const DESCRIPTOR = {…}; defineGate(DESCRIPTOR)` → 1, `the defineGate argument must be an object literal [descriptor-wrapper]`. Entire-population: `create` returning only `visitors` → 1 tool error at phase `create` naming `declares execution entire-population but exposes no evaluate hook`; the same policy with an `evaluate` hook → 0 tool errors |
| 8 | roster coupled sites, parity, manifest | **CONFIRMED** | `Core-Enforcement-Active-Gates.md` carries ONE `policy-soundness` row (line 336, single writer) plus new rows for `policy-legacy-imports` (337) and `policy-binding-resolution` (338); the declared count line reads 302 (line 380) and the loader discovers 302. `tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts` **12/12 green** (34.7 s on the whole-roster arm). `docs/test-baseline/manifest.json` `testFiles` 2659 → 2660 across the merge and contains the new spec. `pnpm check:ledgers-fresh` exit 0, all seven derivations FRESH |

Two suites re-run whole, not sampled: `policy-soundness-family.suite.repo.int.test.ts` **10/10** (108 s, the
real-corpus arm included), and a nine-file scoped batch (`enforcement-registry-parity.int`,
`policy-loader`, `policy-refusal-envelope`, `policy-pass`, `policy-plan`, `policy-descriptor-read`,
`ops/policy-conformance`, `bus-pair`, `bus-fact-health`) **179/179, exit 0**.

### The two §4.1 cuts — the registration predicate IS load-bearing

One scratch module per cut, serial in the name, written beside the real module so its relative imports
resolve, `rm`'d in `finally`. The anchor
`const contract = siblingCandidate ? gateRegistrationOf(target) : undefined;` was asserted to occur
**exactly once** in `policy-legacy-imports.ts` before either cut ran (the §4.1 comment-patch false-clean).

- **cut1 — `gateRegistrationOf` BLINDED** (`const contract = undefined`): exactly the two registering-sibling
  cases DIED (final sibling 1→0, legacy sibling 1→0); the `_proof/` surface, the `lib/` reader, the
  non-registering sibling, the fail-closed UNREADABLE case and **all six ARM A cases were UNCHANGED**. The
  arm's bite is the reader, and the cut reaches no other arm.
- **cut2 — the predicate keyed on the DIRECTORY** (`path.includes("/tooling/src/verify/gates/")`): the two
  correct findings survive and **FOUR correct modules are newly ACCUSED** — the `gates/_proof/` shared
  surface, the non-registering top-level sibling, a `./local/gate.ts` helper and a `gates/ordinary-waiver.ts`
  lookalike. The wrong shape reds correct code; the registration test is what acquits them.

## WHAT I RAN

| # | command / probe | result |
| -: | - | - |
| 1 | `pnpm check:policy-conformance` | exit 0, 248 · 2942 · 7 · 0, corpus 302 (`conf1.log`) |
| 2 | independent corpus census through `loadMixedGateCorpus` | 302/248/54, 1431+1511=2942, 7 refusal rows |
| 3 | `pnpm check:structure` (the ONE serialized leg, on "go") | exit 1, run COMPLETE — see STRUCTURE LEG |
| 4 | `pnpm check:structure-delta` | **exit 2, an honest refusal** — see STRUCTURE LEG |
| 5 | ARM A/B planted-case harness (12 cases) | all 12 as specified |
| 6 | ARM A nine-home sweep (18 controls) | 0 mismatches |
| 7 | §4.1 cut harness (2 cuts × 12 cases) | as above; both scratch modules removed |
| 8 | `policy-binding-resolution` member harness (25 controls) | 0 mismatches |
| 9 | validator harness — #2025, envelope, `mustRefuse` shape (19 controls) | 0 mismatches |
| 10 | loader-level #2025 plant (`gates/cbvpa-loader-probe.ts`, `rm` in `finally`) | loader THREW naming #2025 |
| 11 | envelope-derivation cut (2 scratch copies, both anchors unique) | envelope followed the contract value |
| 12 | E7 + `entire-population` harness (4 controls) | 0 mismatches |
| 13 | gap hunt (9 shapes the arms may not cover) | 3 real gaps, 1 covered-elsewhere — rows below |
| 14 | reader-level localisation of the element-access gap | `isTsMorphMember(member,"Symbol")` false only for an optional-chained element access |
| 15 | `pnpm test:scoped` ×9 files | 179/179, exit 0 |
| 16 | `pnpm test:scoped policy-soundness-family.suite.repo.int.test.ts` | 10/10, exit 0, 108 s |
| 17 | `pnpm check:ledgers-fresh` | exit 0, 7 derivations FRESH (manifest 2660, caught-failure 598) |
| 18 | `#2025` literal sweep over 1670 files with a planted positive control | 7 benign proximity hits |

`git status --short` was EMPTY before this report was written and after every probe; every scratch module
planted under `tooling/src/verify/**` was removed in a `finally` and the tree checked after each run. No
tracked file was edited. Harness sources live in the session scratchpad under `cbvpa-*`.

## STRUCTURE LEG

**Slot `reports/runs/structure/agent-a222dd1c3e944d295-494925-2026-09-12T18-25-57-647Z`**, in this
worktree, announced and run on the orchestrator's "go".
`startedAt 18:25:57.648Z → finishedAt 18:30:26.438Z`, `verdict: "verdict"`, `nonVerdictReason: null`,
`complete`, **run COMPLETE 302/302 (54/54 legacy · 248/248 final)**. No kill, OOM or timeout signature.
NOT overlapped: main's next slot (`main-527616-…T18-31-08-101Z`) starts after mine finished.

Exit 1 (violations — the mid-migration baseline plus the arms red by design). Footer:

> `final policies: 248 ran · raw 1685 = waived 1199 + granted 206 + effective 280 (276 error, 4 warning)
> · 1 alarm(s) · 0 tool error(s) · 0 withheld`

**`0 tool error(s)` · `0 withheld`** — and `factErrors 0`, `waiverCarrierRefusals 0`, `populationAlarms 0`,
`scanAlarms 0`.

Per-policy for the nine touched policies (`raw = effective` for every one — no waiver door consumed:
`ordinaryConsumption` and `reviewedGrantConsumption` name none of them):

| policy | raw | waived | granted | effective | vs the forge's slot |
| - | -: | -: | -: | -: | - |
| `policy-binding-resolution` | 23 | 0 | 0 | 23 (14 modules) | **same (23)** |
| `policy-legacy-imports` | 9 | 0 | 0 | 9 (ARM A 6 · ARM B 3) | 19 there, 12 on its final base — **9 here because `3ed1a7d7a` moved the tenancy registry to `lib/`, closing `owner-scoped-reads/upserts/writes`**; the remaining ARM B three are `ct-poll-schedule-and-paint-health`, `injected-op-caller-param-health`, `serde-core-seal-health`, exactly the `p-family-readers` set |
| `policy-proof-expectations` | 23 | 0 | 0 | 23 (11 modules, BLOCKING) | **same (23)** |
| `policy-soundness` | 0 | 0 | 0 | 0 | same |
| `policy-waiver-identity` | 0 | 0 | 0 | 0 (248 final modules receipted) | same |
| `policy-waiver-spelling` | 0 | 0 | 0 | 0 | same |
| `user-bus-deferred-member` | 0 | 0 | 0 | 0 (`final hard/error`) | same |
| `warning-code-coverage` | 0 | 0 | 0 | 0 | same |
| `bus-producer-coverage` | 0 | 0 | 0 | 0 | same |

The whole-run delta against the forge's slot (`raw 1688 → 1685`, `effective 283 → 280`, all three on the
error side) is accounted for by the three closed `policy-legacy-imports` findings. **The one number that is
NOT accounted for by this merge is `1 alarm(s)` where the forge had `0`** — row L5 below.

`pnpm check:structure-delta` **exits 2 and REFUSES, correctly**:
`structure-delta: NOT A COMPARISON — no usable PRIOR slot for checkout "agent-a222dd1c3e944d295" older
than agent-a222dd1c3e944d295-494925-… — "there is nothing to compare against" is not "nothing changed".
Name one with --before.` It keys prior slots by CHECKOUT and a fresh worktree has exactly one; the door is
honest rather than printing a false "no change". By hand against the forge's artifact the delta is the
three `policy-legacy-imports` findings plus the one new alarm, as stated above. **The forge's slot is not
under main's `reports/runs/structure/`** — it survives only inside the still-existing worktree
`agent-ac85f8a43f8d70bf3`, which is where I read it; a teardown of that worktree destroys the comparand.

## LEDGER ROWS (5 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `policy-legacy-imports` | cb-v-policing-audit · `tooling/src/verify/gates/policy-legacy-imports.ts:122-143` (`judgeDoor`) | BOTH arms are defeated by a ONE-HOP `lib/` RE-EXPORT SHIM. `judgeDoor` resolves only the DIRECT specifier's target, so a final module importing `ExemptionTable` from `lib/<shim>.ts` that does `export type { ExemptionTable } from "../contract/gate.ts"` is clean (ARM A), and one importing a sibling gate's export through `lib/<shim>.ts` that does `export { HELPER } from "../gates/<sib>.ts"` is clean (ARM B). This is not an abstract hole: #2096's migration instruction is literally *"shared predicates move to `lib/<family>.ts`"*, so a lane can close its ARM B finding by re-exporting the twin from `lib/` and land the exact two-homes shape the ruling bans, with both arms green. The header's own §2.3 rationale (*"a re-export shim or a same-named sibling defeats a spelling; … this judges by import origin"*) implies identity closes both; identity closes only the second | blind arm / undeclared limit | OPEN | my probe: `import type { ExemptionTable } from "../lib/cbvpa-shim.ts"` (shim re-exporting `contract/gate.ts`) → **0 findings**; the same target imported DIRECTLY → 1 finding. Same result for the ARM B shim. Zero live carriers today |
| `policy-binding-resolution` · `lib/gate-contract-origin.ts` | cb-v-policing-audit · `tooling/src/verify/lib/gate-contract-origin.ts:105-127` (`callableDeclarations`/`isTsMorphMember`) | The five SYMBOL-OWNER members escape through an OPTIONAL-CHAINED ELEMENT ACCESS — `node.getSymbol()?.["getDeclarations"]()` is CLEAN while `node.getSymbol()?.getDeclarations()` reds. One keystroke from the arm's founding live shape. Localised: for an element access the `nameNode` is a `StringLiteral` with no symbol, and the surviving path `member.receiver.getType().getProperty(name)` misses because the optional-chained receiver's type is `Symbol \| undefined` (a union). Non-optional element access (`sym["getDeclarations"]()`) and node-side element access (`node["getDefinitionNodes"]()`) are both COVERED, so the escape is exactly `?.[ ]` + owner-keyed. The module header declares ONE limit (an `any` receiver) and does not declare this one. The defect is in the SHARED reader, so `policy-soundness` E2's owner-keyed codes inherit it | blind arm / undeclared limit (shared reader) | OPEN | reader-level probe: `isTsMorphMember(member,"Symbol")` = `true` for `n.getSymbol()?.getDeclarations()`, `true` for `sym["getDeclarations"]()`, **`false` for `n.getSymbol()?.["getDeclarations"]()`**; policy-level probe: 1 finding vs **0 findings** on the same two spellings |
| `policy-legacy-imports` | cb-v-policing-audit · `tooling/src/verify/gates/policy-legacy-imports.ts:36-38` (header) | The header MISSTATES the module's own candidate set: *"A specifier in neither set is never resolved at all, which is what keeps `react`, `ts-morph` and every `../lib/` reader out of the accusation."* A `../lib/` specifier IS a relative candidate, IS resolved, and is kept out by REGISTRATION, not by never being resolved — so a MISTYPED `../lib/` import path reds under the fail-closed UNREADABLE text, which the sentence tells a reader cannot happen. The module's own ARM B FAIL-CLOSED `mustFlag` row proves the opposite of the sentence | header-vs-code drift (headers are law, `AGENTS.md`) | OPEN | `import { readIt } from "../lib/cbvpa-real.ts"` (resolves) → 0 findings; `"../lib/cbvpa-typo.ts"` (resolves nowhere) → **1 finding, `resolves to NOTHING`** |
| `policing-surface-audit-2026-09-12.md` | cb-v-policing-audit · `docs/reviews/gate-runtime/policing-surface-audit-2026-09-12.md` §8 delta 6 | The LAW DELTA the orchestrator is asked to land into guide §5/§5b states *"`policy-soundness` (E1–E7 …)"*. The module and its roster row carry **E1, E2, E3, E4, E6, E7** — the letter **E5 belongs to `policy-legacy-imports`** (the audit's own §2.2/§2.3 assign it there and REJECT it inside `policy-soundness`). Landed verbatim, the guide would assert a mechanism `policy-soundness` does not have, in the doc a conversion lane reads first | doc claim the code does not carry | OPEN — fix the delta text before landing | `grep -c E5 Core-Enforcement-Active-Gates.md` = 0; `grep -n E5 tooling/src/verify/gates/policy-soundness.ts` = no match; the roster row (line 336) enumerates E1/E2/E3/E4/E6/E7 |
| `biome-rule-liveness` (NOT #2111) | cb-v-policing-audit · `tooling/src/verify/lib/biome-rule-liveness.ts:303:3` | A live BLOCKING authority alarm on the current tree: `ordinary waiver at tooling/src/verify/lib/biome-rule-liveness.ts:303:3 cannot bind through comment trivia to the matching caught-failure-ownership occurrence`. The `@orb-waive caught-failure-ownership(error)` comment sits above the `try`; the occurrence is the `catch (error)` two lines further in, and comment trivia does not carry the binding across. **Owned by `205224e9a` (#2171/#2172/#2168), not by this merge** — the only commit touching that file between the forge's leg base `61cae0710` and `da1fc0126` (`git log -S parseConfigOrRefuse`) | unbindable waiver → authority alarm (error class) | OPEN — route to the #2171 lane | my structure leg: `1 alarm(s)` where the forge's slot on `61cae0710` has `alarms: []`; the alarm object read from both artifacts |

## WHAT I DID NOT COVER

- **`policy-soundness` E1–E4 and E6** were exercised only through `check:policy-conformance` (their own rows,
  248 policies green) and the family suite. My independent plants covered **E7 and E3's dynamic-import door**
  only. E6's sixteen retired openers, E4's resource-guard identity and E2's code set were NOT independently
  re-planted; if the orchestrator wants those closed, they are a second lane.
- **`policy-proof-expectations`, `policy-waiver-identity`, `policy-waiver-spelling`** — I verified only that
  they are `hard`/`error` on the tree and that their real-corpus counts match the forge's (23 / 0 / 0). Their
  arms were not independently planted.
- **The 23 `policy-binding-resolution` and 9 `policy-legacy-imports` real-tree findings were not audited one
  by one for false accusation.** The family test holds each against a text second opinion and I re-ran it
  green (10/10); I read the two finding LISTS off my own structure log and they are all plausibly the
  \#2097/#2096/#2147 migration sets, but I did not open all 32 sites.
- **`policy-conformance`'s virtual-project trap (read-first §3):** every one of my plants is a virtual
  project with no `node_modules`, so a package specifier resolves to nothing. My probes deliberately used
  only relative specifiers and a planted `ts-morph` ambient stub, but the same caveat the guide records for
  conformance applies to my harness.
- **`pnpm check` as a whole, `pnpm verify --push`, biome/eslint, typecheck** — out of a verifier's fence and
  not run. The structure leg is the only whole-tree instrument I invoked.
- **`pnpm check:structure-delta`'s diff output** — the door refused (exit 2, no prior slot for this
  checkout), so the delta in this report is HAND-computed from the two artifacts. I did not exercise the
  delta door's actual comparison path; nobody has, from a fresh worktree.
- **`RECOMMENDED ADDITIONS`** — read, not adjudicated. Item 1 (`policy-refusal-coverage`) and item 4 (the
  dispatcher-literal pin) both look right to me on the evidence above; item 4 in particular would have caught
  nothing here but is one test.
- **Dynamic `import()`** is NOT a `policy-legacy-imports` finding (its visitor is `ImportDeclaration` /
  `ExportDeclaration` only) — I confirmed the class is nonetheless held, by `policy-soundness` E3, which
  reports ANY `import()` in a final module regardless of specifier. Enforcement-ladder placement, not a gap;
  recorded so the next reader does not re-derive it.
