---
kind: review
status: active
updated: 2026-09-12
---

# cb-v-ledger-reconcile — every OPEN refutation-ledger row re-derived against the tree (#1584, #2012)

Lane `cb-v-ledger-reconcile`, fresh-context Opus verifier, isolated worktree
`.claude/worktrees/agent-a69c021af5bd3d349` at **`61cae0710`**
(`fix(doc-catalog): a scoped write door, and the whole form refuses a dirty tree (#2165)`).

Subject: the 76 rows of `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` whose `state` cell
bins to `OPEN` (75) or `UNADJUDICATED` (1). Every verdict below is against THIS tree; where a verdict
rests on a run, the run is named and I produced it in this session.

## COUNT

Re-derived with my own escape-aware split (`\|` inside a code span is a cell escape, never a column
break), per the method under `## CLASS ROLLUP`: fence `## THE LEDGER` (line 179) → `## CLASS ROLLUP`
(line 555); the first `| ` line after each `### ` is that table's header and its `state` column index is
read off it; a state cell bins by its first bolded word.

**My numbers agree with the orchestrator's exactly.** 27 tables · 235 rows · CLOSED 141 · OPEN 75 ·
FIXED 13 · SUPERSEDED 4 · UNADJUDICATED 1 · DISSOLVED 1 · **UNBINNED 0**.

| rows | table |
| -: | - |
| 12 | Wave 1 — the ten cited exemplars — CLOSED 10 · OPEN 1 · SUPERSEDED 1 |
| 6 | Wave 2 — registry / completeness — CLOSED 6 |
| 8 | Wave 3 — the Drizzle-schema fact family — CLOSED 7 · OPEN 1 |
| 9 | Wave 4 — raw-CSS / token surface — CLOSED 7 · OPEN 1 · SUPERSEDED 1 |
| 9 | Wave 5 — `ordinary-visitors` ×15 — CLOSED 8 · UNADJUDICATED 1 |
| 10 | Wave 6 — `origin-client` ×12 — CLOSED 7 · OPEN 2 · SUPERSEDED 1 |
| 10 | Wave 7 — `home-client` ×14 — CLOSED 10 |
| 10 | Wave 8 — the SERVER plane — CLOSED 8 · OPEN 1 · SUPERSEDED 1 |
| 10 | Wave 9 — `origin-server` ×14 — CLOSED 9 · DISSOLVED 1 |
| 9 | Wave 10 — the BUS plane + `id-brand-flow` — CLOSED 9 |
| 8 | the gate-batch verifier — CLOSED 6 · OPEN 2 |
| 3 | cb-v-hooks-wave — CLOSED 3 |
| 9 | cb-v-ledger-fixes — OPEN 6 · CLOSED 3 |
| 10 | cb-v-mixed-hooks-1-3 — CLOSED 8 · OPEN 2 |
| 9 | cb-v-instruments — CLOSED 4 · OPEN 5 |
| 10 | cb-v-world-gates — OPEN 7 · CLOSED 3 |
| 4 | cb-v-night-conversions — OPEN 2 · CLOSED 2 |
| 12 | p-suite-honesty — FIXED 11 · CLOSED 1 |
| 4 | cb-v-ledger-wave — OPEN 3 · CLOSED 1 |
| 3 | cb-v-suite-honesty — OPEN 3 |
| 17 | cb-v-unaudited-finals — CLOSED 9 · FIXED 1 · OPEN 7 |
| 10 | cb-v-authority-census — OPEN 10 |
| 6 | cb-v-config-liveness — CLOSED 6 |
| 11 | cb-v-parity-instruments — CLOSED 9 · OPEN 2 |
| 6 | cb-v-fix-wave-1 — CLOSED 5 · FIXED 1 |
| 5 | cb-v-fix-wave-2 — OPEN 5 |
| 15 | cb-v-mirror-suppressions — OPEN 15 |

**Runs I produced in this session (the receipts the verdicts below lean on):**

- `pnpm -s check:policy-conformance` → **exit 0**, `246 final policies · 2863 proof rows · 1 refusal rows
  · 0 failure(s) · 206 grant rows · 0 invalid · 39548ms (corpus: 300 module(s), 54 legacy)`.
- `pnpm test:scoped tests/tooling/verify/ops/structure-mixed.suite.int.test.ts` → **exit 0**, 9/9 passed.
- `pnpm test:scoped tests/tooling/verify/gates/dangling-refs.repo.int.test.ts` → **exit 1**, 3 failed /
  3 passed, **20 phantom cites** all inside `docs/reviews/gate-runtime/**` (list in `## LEDGER ROWS`).
- A §5b.5 header census over all 248 `defineGate`-carrying modules, with a positive AND a negative
  control printed in the same invocation (the SHA field is the lookahead-terminated form that survives
  the `(<sha>^)` rev-spec — control positive matched `dd862e988^`, `1234abc~2`, `250c9eb60`; control
  negative matched none of `#2046`, `1234567890123`, `abc`, `rounded`, `shadow`, `defaced`, `accessed`,
  `0d83d9`, a 44-char hex). Result: **FAMILY 178/248 · POPULATION PORT 157/248 · legacy SHA 167/248.**
- An `ExemptionTable` DECLARATION census over `gates/` partitioned by `defineGate` presence (the earlier
  `^\s*const` form missed `export const` — corrected in the same session and stated here because the
  first answer was wrong by three).

## RECONCILIATION (76 rows)

Rungs, weakest→strongest: `path` · `name` · `decl` · `export` · `import` · `live-call` · `test`.

| ledger line | module | proposed state | board # (cited / Done? / none → proposed title) | receipt (sha · path:line · rung) | note |
| -: | - | - | - | - | - |
| 192 | `no-raw-spacing-in-features` · `no-raw-typography-in-features` | **STILL OPEN** | #1922 (Running) | AST+regex census: `no-raw-spacing-in-features.ts:39` and `no-raw-typography-in-features.ts:39` both `export const SANCTIONED_HOMES: ExemptionTable` — `decl`+`export` | lines moved 29/35 → 33 (import) / 39 (decl); nothing else changed |
| 213 | all nine Drizzle-schema modules | **STILL OPEN (systemic only)** | none → *"§5b.5: 70 final modules carry no FAMILY line, 91 no POPULATION PORT, 81 no legacy SHA (re-census of #2005)"* | census with controls: FAMILY 178/248 · PORT 157/248 · SHA 167/248 — `decl` | the NAMED nine are closed (`p-ledger-schema-registry`); only the systemic claim survives. The rollup's "48+" is an UNDERCOUNT |
| 232 | `grant-liveness-family.suite.test.ts` · `drizzle-registry-conversion.suite.test.ts` | **CLOSED** | #1985 Done | `cf38b544d` · `drizzle-registry-conversion.suite.test.ts:39` `scaledBudget(120_000)`, `grant-liveness-family.suite.test.ts:66` `scaledBudget(180_000)` — `live-call` | both suites now carry a contention-scaled budget |
| 247 | `no-inline-types` (real tree) | **STILL OPEN** (count CANNOT-DECIDE) | none → *"no-inline-types: decide whether tooling/src/verify/lib/\*\* is a type home or the verdict types move to verify/contract/"* | `no-inline-types.ts:117-129` — `notUnder` lists seven roots and **no `tooling/src/verify/lib/**`** — `decl` | the DECISION is unmade, so the row is substantively open. The 19-count needs `pnpm check:structure`, which this lane is fenced from — that half stays CANNOT-DECIDE |
| 261 | `gate-spelling-twins` | **CLOSED** | #1506 Done · #1983 Running | `91d9a2ab7` (#2031) · `tests/tooling/gate-spelling-twins.int.test.ts:10-31` header + `:44-46` imports `loadMixedGateCorpus` and `verifyPolicyProofs` — `import` | re-minted over the MIXED corpus (47 blind of 245, 13 final newly visible). I did NOT run the suite — it is one of the four fenced planting suites |
| 262 | the twelve `origin-client` modules | **STILL OPEN** | #1978 (Done) | census over the 12 named by `origin-client-family.suite.test.ts`: **10 of 12 lack a FAMILY line, 12 of 12 lack a POPULATION PORT** — `decl` | worse on the PORT axis than wave 6's "1 of 12" under my field; the §5b.3 half (#1978) is mechanized by `policy-waiver-spelling` |
| 292 | all 25 server-plane modules | **CLOSED** | #2045 Done · #2046 Done (#2000/#2005/#1980 cited) | census: none of the 11 `home-server` nor the 14 `origin-server` modules appears in any of my three MISSING lists — `decl` | the SYSTEMIC gap lives on at L213; this row's own 25 are done |
| 331 | `lib/caught-failure.ts` | **CLOSED** | none → *"caught-failure: the finally-owner clause is pinned by a mustPass its cut kills"* | `cdec4e3da` · `caught-failure-ownership.ts:899-905` — the `finally-owned.ts` `mustPass` whose `why` records the cut measurement — `test` (conformance 0 failures, my run) | the clause at `lib/caught-failure.ts:945-946` is unchanged; what changed is that a row now dies without it |
| 334 | `contract/population.ts` | **CLOSED** | #1980 (Running) | `03dd7329e` (#1980) · `contract/population.ts:31-60` `AUTHORED_MEMBERSHIP` derives `@authored` with a per-root `why`; `member-card-clamped.ts:52-66` corrected — `decl`+`live-call` | `@showcase` is now an explicit `authored: false` with its reason, not a silent omission |
| 349 | `structure-mixed.suite.int` | **CLOSED** | #1983 (Running) | `91d9a2ab7` (#2052) · suite RUN in this session: **exit 0, 9/9 passed**; header `:9-16` records the shim→authored-carrier repair — `test` | it now plants its own legacy carrier `probe-legacy-module-state`, so the premise cannot decay again |
| 350 | `over-art-plate-arm` int pin | **CLOSED** | none → *"over-art-plate-arm.int: the workItem 626 assertion is gone"* | `91d9a2ab7` · `over-art-plate-arm.int.test.ts` no longer names 626; `:142` explains the type requirement — `decl` | the loss-of-witness consequence is the separate row L447 |
| 351 | `dangling-refs` (roster docs) | **CLOSED** | none → *"dangling-refs: the nine front-door-split phantom symbol cites are gone"* | run in this session: 20 findings, **none** naming `ROOT_CONFIG_IMPORTS` / `PROJECT_SITES` / `FULL_PRIORITY_CALLERS` / `CLOCK_SITES` / `ARGV_ENTRIES` / `YOU_MODAL_IDS` — `test` | the suite is still RED, on a DIFFERENT and newer population — filed as a new row below |
| 352 | `gate-runtime-standardization` | **CLOSED** | none → *"guide §4.1: the illustrative index.ts fixture path no longer trips dangling-refs"* | `91d9a2ab7` · guide now writes `<a directory literally named index.ts>` with the escape stated — `decl` | corroborated by the run: no such finding |
| 353 | `vector-scope-derived` | **CLOSED** | none → *"vector-scope-derived: the WRITE arm fails closed through sealedOriginReports"* | `b36f782a8` (#2057) · `vector-scope-derived.ts:121-125` routes through `sealedOriginReports`; the refusal-scoping `mustPass` at `:396` — `test` | the FOURTH polarity the row minted is now the module's own pinned shape |
| 357 | `#2000` | **STILL OPEN (PARTIAL)** | #2000 (Running) | `c97de9d2f` landed `tests/tooling/verify/gates/schema-fact-parity.test.ts` — Tier 2b **and** 2c, 86 examples, all three §4.6 comparisons, legacy side nonzero (42 findings on 41 of 86) — `test` | Tier 2a + 2b + 2c now exist; the **Tier 3 ruling and `turn-identity` / `plugin-dump-guard` are still unaddressed**, so the row narrows rather than closes |
| 371 | `tooling-ops-direct-invocation` | **STILL OPEN** | #1968 (Done) | `tooling-ops-direct-invocation.ts:119` `messageIncludes: "exit 0"`; the fragment occurs in BOTH module messages (`MESSAGE:57` "would exit 0 without doing anything" and `missing():70` "execute nothing and exit 0") — `decl` | it is no longer a WHOLE-message assertion, but it still discriminates nothing. The judgement the row defers is unmade |
| 372 | `sub-floor-disclosure` | **STILL OPEN (advisory)** | none → *"roster row 284 says @sub-floor-ok RETIRED without naming the live DOM token"* | `Core-Enforcement-Active-Gates.md:284` unchanged; the live token survives at `turn-tool-calls-disclosure.tsx:93` `data-target-floor="sub-floor-ok"` and `ui-audit/lib/checks-a11y.ts:26` — `live-call` | |
| 381 | `policy-conformance-stage.int` | **CLOSED** | #1969 Done | `91d9a2ab7` · `:138` now asserts `proofRows(baseuiRenderProp) + BROKEN_PROOF_ROWS` — a derived count, not the bumped literal — `test` | the coupled literal and its false comment are gone |
| 382 | `conformance.int` | **STILL OPEN (minor)** | #1969 Done | `conformance.int.test.ts:419-420` still claims both denominators are "derived here independently of the sweeps' own traversals" while `:422` calls the same `virtualProofsOf` that `policySweep` iterates — `decl` | unchanged |
| 384 | `no-array-literal-querykey` | **CLOSED** | #1994 (Running) · #1993 Done | `1a5c348eb` (#1994) · `singleton-ordinary-policies.suite.test.ts:268-270` is the §4.2 positive identity arm at position `queryKey` — `test` | the "only one of nine with no family test" claim is refuted |
| 385 | guide §12.5 | **CLOSED** | #2025 Done | `8c7ca5e9f` · guide §12.5 now reads "**FOUR** of them are `authority: "hard"`" with the four-row table beneath; the "11 violations" sentence is gone, replaced by the artifact verdict `errors: 66, warnings: 12` — `decl` | both halves of the row |
| 386 | `tests/server/entry/compose/chat.int.test.ts` | **STILL OPEN** | none → *"chat.int D53 ReDoS watchdog test needs scaledBudget, not a flat 10s"* | `chat.int.test.ts:119` still `{ timeout: 10_000 }`; no `scaledBudget` import in the file — `decl` | |
| 392 | `biome-grant-liveness` | **CLOSED** | #1158 Done | `a5abe00d7` (#2074) · the gate carries **no** `writeFileSync` and **no** `runNicedSync`; arm six is now the `config:biome-rule-liveness` STATIC stage (`ops/biome-rule-liveness.ts`, wired at `cli.ts:105,161` and `index.ts:150`) — `live-call` | the write+subprocess left the gate contract entirely |
| 394 | `eslint-grant-liveness` · `depcruise-grant-liveness` · `runner-config-path-liveness` | **STILL OPEN** | #1922 (Running) | census: `eslint-grant-liveness.ts:21`, `depcruise-grant-liveness.ts:52,74`, `runner-config-path-liveness.ts:106` all still declare an `ExemptionTable` in a `defineGate` module — `decl` | byte-identical at the cited lines |
| 395 | `refutation-ledger-2026-09-12.md` | **STILL OPEN (refreshed)** | #1922 (Running) | ledger `:656` still reads "~~nine~~ TEN FINAL modules"; my census says **SEVEN** — `contract-derives-not-respells`' `ALLOWLIST` moved to `lib/contract-derives-not-respells.ts:32` at `d9d1e3524` — `decl` | the row's own correction ("the number is EIGHT") is now stale too. Live set: depcruise (×2), eslint, injected-op-caller-param, lifecycle-portability, no-raw-spacing-in-features, no-raw-typography-in-features, runner-config-path-liveness |
| 396 | `#1947` | **CLOSED** | #1947 **Done** (lane `p-native-config-fix`) | board status from the orchestrator's `open-idstatus.tsv`; the row's whole defect was "an OPEN board row whose defect is closed" — `name` | the recommendation ("land") was executed |
| 397 | `gate-runtime-read-first.md` | **STILL OPEN (narrowed)** | #2013 Done | half (a) is FIXED in read-first (§0 ruling 3 now says `runner-config-path-liveness` "has since converted and is FINAL"), but the SAME false sentence survives in guide §3 ("it shipped, and the gate is still legacy"); half (b) read-first `:137` says "298 modules (238 final / 60 legacy)" against my measured **300 / 246 / 54** — `live-call` (the loader) | one of the two named sites repaired; the count is stale again, by a different delta |
| 400 | `scripts/ts7.cjs` | **STILL OPEN (low)** | none → *"ts7: the warm/changed/restored freshness half has no committed regression pin"* | `tests/tooling/_shared/concurrency-profile.test.ts` carries only the flag-stripping controls (`:306`, `:350`); no warm/changed/restored test exists in the file — `decl` | |
| 401 | `#2021` disposition comment | **SUPERSEDED** | #2021 (Running) | `tsconfig-entry-liveness.ts` is FINAL (`defineGate` count 1) and declares `resources: [{ kind: "tracked-files" }, { kind: "authored-text" }]` at `:155`; `contract/resource-json.ts:35-46` still lists exactly five ids and never needed a sixth — `decl` | the conversion the comment mis-routed has landed, so no lane can follow it any more |
| 407 | `no-hardcoded-model-prose` | **CLOSED** | #2043 Done (cited on the sibling row) | `91d9a2ab7` · **15** `@orb-waive no-hardcoded-model-prose(<token>)` markers now sit at exactly the five product files the row named (arm-executors 5 · analysis-arm 1 · actor-rekey 2 · actor-ops 1 · compose/rpg 6) — `decl` | the 16th is `packages/contracts/src/rpg/views.ts:242`, documented as prose that never needed the opener. **Effective suppression is unverified by me** — that needs `check:structure` |
| 408 | `integer-line-boxes` | **CLOSED** | #2043 Done | `91d9a2ab7` · the four sites now carry `@orb-waive integer-line-boxes(...)`: `charts/meter/variants.ts:307,309,311` and `markdown/markdown.tsx:257`; zero `@orb-gate-ignore integer-line-boxes` survive — `decl` | same caveat: binding is unverified without `check:structure` |
| 438 | `no-raw-zustand-persist` | **CLOSED** | #2057 Done · #2050 Done | `da79208b3` (#2050) · `no-raw-zustand-persist.ts:229-237` — ARM C now takes `classifyOriginRefusal` and returns `unreadable: true`; the pinning `mustFlag` at `:459` — `test` | the header at `:230-236` records the exact fail-open the row measured |
| 440 | `bus-belt-total` · `bus-producer-coverage` | **CLOSED** | #2045/#2046/#2048 Done | `8bf81b7e2` (#2047) · `bus-belt-total.ts:19` FAMILY + `:26` POPULATION PORT (with `:12-17` recording the refutation); `bus-producer-coverage.ts:29` FAMILY + `:39` PORT — `decl` | |
| 441 | `no-untyped-soft-ref` | **CLOSED** | #944 Done | `4096bc3a9` · `no-untyped-soft-ref.ts:42` is now `const UNREADABLE = MESSAGE;` — the module no longer advertises a distinct third answer — `decl` | the row's own out-of-scope sibling `zod-error-issues-home` is STILL defective → new row below. `no-raw-interactive-intrinsics:41` is clean (`= MESSAGE`) |
| 447 | `over-art-plate-arm` | **STILL OPEN** | #2024 Done · #2053 Done · #2070 (Running) | `over-art-plate-arm.ts:160` `workItem: 2024` against a CLOSED issue; `lib/policy-validation.ts:421-425` validates own-enumerable + positive-safe-integer and nothing else — `decl` | the witness is still absent, exactly as the row states |
| 448 | the widened docs formatter | **STILL OPEN (narrowed)** | #2059 (Running) | `007c8b837` (#2068) landed the inert-escape predicate at `format.ts:196-205` — but ONLY for `_` (mid-word) and `~`; `#`, `[`, `*` still escape. The row's own counterexample still reproduces: `docs/reviews/board-rederive/scout-D2-oidc-infra.md` holds **3 plain and 3 `id\_token\_hint`** spellings, so a literal search still misses half — `test` (literal grep, both spellings) | the header DOES now state the predicate (`:166-188`), which is the row's second fix arm; the corpus repair is the unlanded half |
| 449 | both doc doors | **CLOSED** | #2059 (Running) | `91d9a2ab7` · `format.ts:35-36` states the narrowing verbatim — *"The corpus is TRACKED files … an untracked draft is not a document, and a glob would sweep one in"* — beside the tracked-corpus rationale, which is the row's stated fix arm 1 — `decl` | `formatTargets:361-374` still resolves through `git ls-files`, by declared design |
| 465 | `windowed-infinite-query` | **CLOSED** | none → *"windowed-infinite-query: the factory-name matrix cell and mustPass\[3] corrected (#2087)"* | `d9d1e3524` · `windowed-infinite-query.ts:44-53` matrix corrected to RED ×3 with the MATRIX CORRECTION paragraph; `:330-333` gives `mustPass[3]` a `maxPages` cap — `test` (conformance 0 failures, my run) | |
| 466 | `no-form-state-in-useeffect` | **CLOSED** | none → *"no-form-state-in-useeffect: the §4.2 positive identity arm it never had (#2088)"* | `d9d1e3524` · `no-form-state-in-useeffect.ts:182-184` marker row at `form.state.values`, `why` records both directions of the dead-position control — `test` | |
| 467 | `persist-partialize-and-total-migrate` | **CLOSED** | none → *"persist-partialize: origin-resolved callee catches the alias; const-hop and spread options (#2089)"* | `d9d1e3524` · `:250-252` alias `mustFlag` (`persist as durable` → count 1, token `durable`); matrix `:66-68`; `readPackageExportOrigin` imported at `:100` — `test` | both undeclared limits the row named are now either fixed or declared |
| 468 | `contract-derives-not-respells-health` | **CLOSED** | none → *"contract-derives-not-respells-health: the table-disappeared death mode pinned (#2090)"* | `d9d1e3524` · `:110` `mustFlag[1]` — "THE TABLE-DISAPPEARED DEATH MODE (#2090) … a SECOND death mode" — `test` | |
| 469 | `contract-derives-not-respells-health` | **CLOSED** | none → *"contract-derives-not-respells: the family reader moves to lib/, no gate-to-gate import (#2091/#2096)"* | `d9d1e3524` · `:29` imports all five symbols from `../lib/contract-derives-not-respells.ts`; header `:10-17` names the reader and the ruling — `import` | the owner call the row asked for was made (#2096: a gate module never imports another gate module) |
| 470 | `ct-poll-schedule-and-paint` | **CLOSED** | none → *"ct-poll-schedule-and-paint: `ordinary` as English removed; the trigger vocabulary pinned (#2092)"* | `d9d1e3524` · header `:17-18` records the removal; `:438-440` is the `el.focus()` row pinning `UNTRUSTED_TRIGGERS` — `test` | |
| 471 | `serde-core-seal` | **CLOSED** | none → *"gate-modernization ARM B accused the ordinary half of a split family (#2093)"* | `a5abe00d7` (#2093) · `gate-modernization.ts:308-330` the split-family door keyed on the IMPORT; two-sided rows at `:747` (negative) and `:831` (positive); the commit message names `serde-core-seal` as one of the three held — `test` | |
| 477 | the `58 X / 2 O` split | **CLOSED** | none → *"playbook + read-first: replace the residual authority split with the measured partition"* | `d23150315` · playbook `:400` and read-first `:151` both now read `3 O · 8 H · 4 MI · 6 B · the rest X` with the re-derivation command — `decl` | |
| 478 | the authority notation | **CLOSED** | none → *"add the H letter to both authority-notation homes"* | `3525c6f28` (#2098) · `uncovered-gate-conversion-census.md:72` defines `H`; guide `:1103` uses it and points at §7's notation — `decl` | |
| 479 | `no-blanket-suppression` · `tsconfig-entry-liveness` | **CLOSED** | #1930 Done · #2013 Done | `d23150315` · guide `:1103` states the denominator as CONVERTIBLE + REFUSED, names `no-blanket-suppression` as the one standing refusal, and says "re-derive with `pnpm check:policy-conformance`, never quote this" — `decl` | the published "58" is now 54 by my run, which is exactly why the sentence forbids quoting it |
| 480 | `no-test-fabrication` | **CLOSED** | none → *"add FABRICATION-OK as the twelfth grammar in guide §7's disposition table"* | `d23150315` · guide `:1174` row 3 now reads TWELVE grammars and names `FABRICATION-OK` with its ~424 markers; `:1210` routes its translation to chunk C8 with positions derived from the reported `token` — `decl` | |
| 481 | `finding-overload-provenance` | **CLOSED** | #828 Done | `3525c6f28` (#2100) · `exception-authority-census.md:65` now reads "**STALE (cb-v-authority-census L5, #2100)** … Delete WITH ITS GATE, whenever that gate retires; the ban is live and the 6 live markers stay parked" — `decl` | the row's fix spec, verbatim |
| 482 | guide §7 parked-grammar table | **CLOSED** | none → *"guide §7: re-derive the parked-grammar live column; re-file @swallowed-ok under kind 9"* | `8c7ca5e9f` · guide `:1200-1202` records `@sub-floor-ok` CENTRALIZED (2=2), `@swallowed-ok` CENTRALIZED (5 bind) and `@surface-focus-elsewhere` translated with its gate; `:1180` files `@swallowed-ok`'s lens half under kind 9 as its own migrate-or-retire decision — `decl` | |
| 483 | `css-length-tokens` | **STILL OPEN (narrowed)** | none → *"css-length-tokens: STRUCTURAL_CLASS_FILES is still a per-file count ratchet"* | `b5490a02a` (#2101) converted arms 1+2 (the two shell.css tables) to occurrence keys; `css-length-tokens.ts:159-174` `STRUCTURAL_CLASS_FILES` still carries per-file `count: 3/2/1/9` — `decl` | the commit's own message says "partial — arms 1+2 of 3"; `css-family-ownership`, `css-var-defined`, `duplicate-action-doors` are unruled |
| 484 | `ops/new-gate.ts` | **CLOSED** | none → *"gate:new scaffold emitted the banned ExemptionTable shape (#2102)"* | `a5abe00d7` (#2102) · `ops/new-gate.ts:46` emits `defineGate(`; the header `:6-10` records the retired shape — `decl` | |
| 485 | the marker-census predicate | **CLOSED** | none → *"guide §7: every marker count cites the anchored predicate with both controls"* | `d23150315` · guide `:1183` — "positive AND a negative control in the same invocation … a loose `grep -F "// @opener"` reports 86 where the anchored predicate reports 10" — `decl` | |
| 486 | `test-presence-client` | **CLOSED** | #2103 (Running) | `b5490a02a` (#2103) · the `data/trpc.ts` row is DELETED, not granted; `test-presence-client.ts:75-88` records that its stated reason was false; `:568-571` is the successor `mustPass` that proves the file is JUDGED — `test` | `tests/client/data/trpc.test.ts` (103 lines) landed with it |
| 511 | `tier3-close-by-rule` | **CLOSED** | none → *"tier3-close-by-rule clause 6 compared labels, not fixture bytes (#2118)"* | `ef044b12e` (#2118) · `tier3-close-by-rule.suite.test.ts:161-186` `carriageRefusals` now compares the `files`/`at` payload literals as well as the `why`, and refuses loudly when the payload sweep reads zero — `decl` | |
| 512 | `tests/support/legacy-differential.ts` | **CLOSED** | none → *"legacy-differential: the in-memory-only obligation is enforced, not just documented (#2119)"* | `ef044b12e` (#2119) · `legacy-differential.ts:205-222` `FILESYSTEM_REACH` + `filesystemReach()`, and `frozenLegacyGate:227-233` THROWS naming the spellings — stronger than the row's fix spec — `decl` | |
| 530 | `no-tailwind-dark-variant` | **STILL OPEN** | #2107 (Running) | `no-tailwind-dark-variant.ts:39-41` `fix` still reads "A candidate containing a paren … has NO waiver spelling … raise it on #1584 instead of writing a marker that cannot parse" — while `:31` imports `waivableCoordinate`, the mechanism that refutes it — `decl` | the sibling `no-raw-color-in-css:113` was rewritten; this one was not |
| 531 | `lib/ordinary-waiver` + `lib/policy-pass-context` | **STILL OPEN** | none → *"waivableCoordinate / assertWaivablePosition / isWaivablePosition ship with no committed pin"* | literal sweep over `tests/` for all three symbols: **zero**. POSITIVE CONTROL in the same invocation: `createOrdinaryWaiverEngine` → `tests/tooling/verify/lib/ordinary-waiver.test.ts:6`, so the sweep sees test-side imports and the zero is a real zero — `decl` | `tooling/src/verify/lib/waivable-coordinate.ts` exists and has three gate consumers |
| 532 | `no-raw-color-in-css` · `no-tailwind-dark-variant` | **STILL OPEN** | #2107 (Running) | the only identity arms are at the PAREN-FREE coordinates — `no-raw-color-in-css.ts:167` `(#ff0000)`, `no-tailwind-dark-variant.ts:409` `(dark:bg-card)`; no marker at a paren-carrying position in either module — `decl` | |
| 533 | `docs/architecture/core/AGENTS.md` | **STILL OPEN** | #2076 (Running) | three unwarned routes to the REFUTED `exemplars-2026-09-11.md` survive: `AGENTS.md:68` (§0.3 gate row), `AGENTS.md:322` (§7 authoring row), `GATE-AUTHORING.md:14` — none carries a banner; the doc's own opener says "REFUTED 2026-09-12 — NINE OF THESE TEN ARE NOT COPYABLE" — `decl` | AGENTS.md is ALWAYS loaded, so this is wider reach than the path-scoped file #2076 fixed |
| 534 | `no-raw-color-in-css` · `no-tailwind-dark-variant` · `rest-transform-grid` | **STILL OPEN** | #1990 Done | all three throws present and unchanged: `no-tailwind-dark-variant.ts:175`, `rest-transform-grid.ts:305`, `no-raw-color-in-css.ts:85`; a literal sweep for `no anchorable coordinate` over `tests/` returns **zero** — `decl` | |
| 540 | `suppressions` | **STILL OPEN** | none → *"suppressions: the conversion added 2 diagnostic-legibility findings, neither fixed nor waived"* | `suppressions.ts:142-147` `MESSAGE` ends "…reviewed grants, one per rule per scope." with no doc pointer; zero `@orb-waive diagnostic-legibility` markers in the module — `decl` | the FINDING COUNT itself needs `check:structure` and is unverified by me; the shape the row describes is unchanged |
| 541 | `suppressions` | **STILL OPEN** | none → *"manifest.json still lists the deleted suppressions.residual.test.ts with no deletions entry"* | `docs/test-baseline/manifest.json:2258` lists it in `files`; the file does not exist on disk; `suppressions.residual` appears nowhere in the `deletions` block at `:2662` — `decl` | |
| 542 | mirror family | **STILL OPEN** | #2000 (Running) | `mirror-index-family.suite.test.ts` carries no `BASE`, no frozen-legacy import and no differential; last commit to it is the conversion `aecbc6c6c` — `decl` | |
| 543 | mirror family | **STILL OPEN** | none → *"mirror-index-family: pin unresolved, package-test empty, and an authored-text refusal"* | `mirror-index-family.suite.test.ts` has **0** `symlinkSync`; the `refusalShape` pins at `:97,104,111,144,171` are all `missing`, plus one `empty` for `tooling-test` at `:118` — no `unresolved`, no `package-test` `empty`, no `authored-text` refusal — `decl` | |
| 544 | `test-presence` | **STILL OPEN** | none → \*"test-presence: four narrowings no row holds (isFeatureRoot depth, !ENV_CALL, extends *Error, exported-class arm)"* | `test-presence.ts` is unchanged since the conversion `aecbc6c6c`, which PRECEDES the audit that measured it — so the measurement stands verbatim — `decl` | |
| 545 | `test-presence` | **STILL OPEN** | none → *"test-presence mustPass\[4]/\[5] why strings claim a fence the pass-through clause now acquits"* | same file, unchanged; `:744` still asserts "THE `isFeatureRoot` NARROWING: nesting the same file one level deeper reds it" with no measured joint-cut result — `decl` | |
| 546 | `test-presence-client` | **STILL OPEN** | #619 Done | `b5490a02a` touched the module only for #2103; no `data/index.ts` fixture and no `bump<number>` fixture exist; `notNamed: ["index.ts"]` at `:330` and `TYPE_ARGS` at `:219-222` are unpinned — `decl` | |
| 547 | `test-layout` | **STILL OPEN** | none → *"test-layout MIRROR_MIN_SEGS is mutually redundant and mustPass\[10]'s why names it as the holder"* | `test-layout.ts` unchanged since `aecbc6c6c` — `decl` | |
| 548 | `suppressions` | **STILL OPEN** | none → *"reviewed-grant-findings: fileSiteList sorts rendered strings, and the file door has zero test arms"* | `lib/reviewed-grant-findings.ts:111-114` still `[...new Set(rendered)].toSorted((l, r) => l.localeCompare(r))`; `reportReviewedGrantFileCandidates` occurs **0** times in `tests/tooling/verify/lib/reviewed-grant-findings.test.ts` — `decl` | |
| 549 | mirror family | **STILL OPEN** | none → *"the three mirror headers cite 90bbeb04f as 'the parent of this conversion'; the parent is 6b1d01be0"* | `test-layout.ts:21`, `test-presence.ts:54`, `test-presence-client.ts:25` all still carry the false parenthetical — `decl` | |
| 550 | `suppressions` | **STILL OPEN** | none → *"suppressions header carries no legacy SHA"* | a whole-header read plus a literal sweep for `LEGACY SHA`, `d23150315` and `02382639e` in `suppressions.ts`: none — `decl` | corroborated by my §5b.5 census, which lists `suppressions` under MISSING SHA |
| 551 | `test-presence` | **STILL OPEN** | #767 Done · #773 Done · #2062 (Running) | `Spine-Testing.md:106-107` still says the residual "rides a shrink-only DEBT ratchet (`test-presence.baseline.json`, enumerable with `pnpm debt`); it is another lane's named burn-down" — and both `test-presence.baseline.json` and `suppressions.baseline.json` are **absent from disk** — `decl` | |
| 552 | both | #772 Done | **STILL OPEN** | `exception-authority-census.md:36,37,135,139,157` all unchanged and all describe deleted artifacts; `:157` still says "6 test rule classifications" — `decl` | this is a `status: active`, read-in-full tier-4 doc |
| 553 | `suppressions` | **STILL OPEN** | none → *"962-blanket-suppression-control-plane §6 Coupled sites names four deleted artifacts"* | `962-blanket-suppression-control-plane.md:212` still lists `ops/gen/suppressions.ts` · `suppressions.residual.test.ts` · the baseline · `debt.ts`'s `why` prose — all four gone — `decl` | |
| 554 | `test-presence-client` | **CLOSED** | #2103 (Running) | `b5490a02a` · `CLIENT_EXCLUDE_FILES = ["data/trpc.ts"]` is **deleted**; header `:75-88` records that the stated reason was false; the successor `mustPass` at `:568-571` proves the file is judged rather than subtracted — `test` | the row asked for a grant OR a liveness arm; the lane chose the third answer (delete and test the file), which is stronger |

*(Row 552's columns read `module | board | state | …` above because its board number is cited; the
proposed state is **STILL OPEN**.)*

## FLIP SUMMARY

| proposed state | rows |
| - | -: |
| **CLOSED** | 40 |
| **SUPERSEDED** | 1 |
| **STILL OPEN** | 35 (of which 5 narrow materially: 213, 397, 448, 483, 357) |
| CANNOT-DECIDE | 0 rows outright; ONE half-row (247's real-tree count, fenced behind `check:structure`) |

Rows with **no board number cited: 39** — every one carries a proposed one-line title in the table above.

### Flip to CLOSED — paste the state cell

| line | replacement state cell |
| -: | - |
| 232 | `**CLOSED** — cf38b544d, drizzle-registry-conversion.suite.test.ts:39 and grant-liveness-family.suite.test.ts:66 both take scaledBudget (120s / 180s); board #1985 Done` |
| 261 | `**CLOSED** — 91d9a2ab7 (#2031), the suite drives BOTH engines (loadMixedGateCorpus + verifyPolicyProofs, :44-46) and the ledger was re-minted over the mixed corpus; suite not run (fenced planting suite)` |
| 292 | `**CLOSED** — #2045 + #2046; census over the 11 home-server and 14 origin-server modules: all 25 carry FAMILY + POPULATION PORT + legacy SHA. The SYSTEMIC gap survives at the wave-3 row` |
| 331 | `**CLOSED** — cdec4e3da, caught-failure-ownership.ts:899-905 is the finally-owner mustPass whose why records the cut; conformance 0 failures` |
| 334 | `**CLOSED** — 03dd7329e (#1980), contract/population.ts:31-60 derives @authored from AUTHORED_MEMBERSHIP with a per-root why; member-card-clamped.ts:52-66 corrected` |
| 349 | `**CLOSED** — 91d9a2ab7 (#2052); the suite plants its own authored legacy carrier and RAN 9/9 green at 61cae0710` |
| 350 | `**CLOSED** — 91d9a2ab7; over-art-plate-arm.int.test.ts no longer asserts workItem 626 (:142 states the type requirement instead)` |
| 351 | `**CLOSED** — dangling-refs.repo.int run at 61cae0710 reports 20 phantoms and NONE of the nine symbols; the suite is red on a new population (see the cb-v-ledger-reconcile rows)` |
| 352 | `**CLOSED** — 91d9a2ab7; guide §4.1 writes the fixture path as <a directory literally named index.ts> and states the escape` |
| 353 | `**CLOSED** — b36f782a8 (#2057), vector-scope-derived.ts:121-125 goes through sealedOriginReports; the refusal-scoping mustPass at :396` |
| 381 | `**CLOSED** — 91d9a2ab7 (#1969), policy-conformance-stage.int.test.ts:138 derives the count as proofRows(baseuiRenderProp) + BROKEN_PROOF_ROWS` |
| 384 | `**CLOSED** — 1a5c348eb (#1994), singleton-ordinary-policies.suite.test.ts:268-270 is the §4.2 arm for no-array-literal-querykey` |
| 385 | `**CLOSED** — 8c7ca5e9f; guide §12.5 reads FOUR hard warning policies with its table, and the "11 violations" sentence is replaced by the artifact verdict` |
| 392 | `**CLOSED** — a5abe00d7 (#2074); arm six is now the config:biome-rule-liveness STATIC stage (ops/biome-rule-liveness.ts); the gate carries no write and no subprocess` |
| 396 | `**CLOSED** — board #1947 is Done (lane p-native-config-fix); the row's whole defect was the open board row` |
| 407 | `**CLOSED** — 91d9a2ab7; 15 @orb-waive no-hardcoded-model-prose markers at the five named files (the 16th site is documented prose). Effective suppression not re-measured (needs check:structure)` |
| 408 | `**CLOSED** — 91d9a2ab7; the four sites carry @orb-waive integer-line-boxes (variants.ts:307,309,311 · markdown.tsx:257) and zero retired-grammar markers survive` |
| 438 | `**CLOSED** — da79208b3 (#2050); ARM C fails closed at no-raw-zustand-persist.ts:229-237, pinned by mustFlag at :459` |
| 440 | `**CLOSED** — 8bf81b7e2 (#2047); bus-belt-total.ts:19/:26 and bus-producer-coverage.ts:29/:39 carry FAMILY + POPULATION PORT` |
| 441 | `**CLOSED** — 4096bc3a9; no-untyped-soft-ref.ts:42 is now UNREADABLE = MESSAGE, so no unreachable third answer is advertised` |
| 449 | `**CLOSED** — 91d9a2ab7; format.ts:35-36 states the tracked-corpus narrowing beside its rationale, the row's own fix arm 1` |
| 465 | `**CLOSED** — d9d1e3524 (#2087); the matrix cell is corrected at windowed-infinite-query.ts:44-53 and mustPass[3] gained the maxPages cap at :330-333` |
| 466 | `**CLOSED** — d9d1e3524 (#2088); no-form-state-in-useeffect.ts:182-184 is the §4.2 positive identity arm at form.state.values` |
| 467 | `**CLOSED** — d9d1e3524 (#2089); the alias mustFlag at :250-252 (token durable, count 1) and the matrix at :66-68` |
| 468 | `**CLOSED** — d9d1e3524 (#2090); contract-derives-not-respells-health.ts:110 pins the table-disappeared death mode` |
| 469 | `**CLOSED** — d9d1e3524 (#2091/#2096); the five symbols now come from lib/contract-derives-not-respells.ts (:29), named in the header at :10-17` |
| 470 | `**CLOSED** — d9d1e3524 (#2092); ordinary-as-English removed (:17-18) and the trigger vocabulary pinned by the el.focus() row at :438-440` |
| 471 | `**CLOSED** — a5abe00d7 (#2093); gate-modernization.ts:308-330 is the import-keyed split-family door, two-sided at :747 and :831` |
| 477 | `**CLOSED** — d23150315; playbook:400 and read-first:151 both carry the measured 3 O · 8 H · 4 MI · 6 B partition and the re-derivation command` |
| 478 | `**CLOSED** — 3525c6f28 (#2098); uncovered-gate-conversion-census.md:72 defines H and guide:1103 uses it` |
| 479 | `**CLOSED** — d23150315; guide:1103 states the denominator as CONVERTIBLE + REFUSED, names the one standing refusal, and forbids quoting the number` |
| 480 | `**CLOSED** — d23150315; guide:1174 is a TWELVE-grammar table naming FABRICATION-OK, routed to chunk C8 at :1210` |
| 481 | `**CLOSED** — 3525c6f28 (#2100); exception-authority-census.md:65 carries the corrected disposition verbatim` |
| 482 | `**CLOSED** — 8c7ca5e9f; guide:1200-1202 records the three grammars CENTRALIZED/translated and :1180 re-files @swallowed-ok under kind 9` |
| 484 | `**CLOSED** — a5abe00d7 (#2102); ops/new-gate.ts:46 emits defineGate and :6-10 records the retired shape` |
| 485 | `**CLOSED** — d23150315; guide:1183 states the anchored predicate and demands a positive AND a negative control in the same invocation` |
| 486 | `**CLOSED** — b5490a02a (#2103); the data/trpc.ts row is deleted, the false reason is recorded at :75-88, and the successor mustPass at :568-571 proves the file is judged` |
| 511 | `**CLOSED** — ef044b12e (#2118); carriageRefusals compares the files/at payload as well as the why, and refuses on a zero-literal sweep (:161-186)` |
| 512 | `**CLOSED** — ef044b12e (#2119); FILESYSTEM_REACH + frozenLegacyGate's throw at legacy-differential.ts:205-233` |
| 554 | `**CLOSED** — b5490a02a (#2103); CLIENT_EXCLUDE_FILES is deleted, not granted, with tests/client/data/trpc.test.ts and the successor mustPass at :568-571` |

### Flip to SUPERSEDED

| line | replacement state cell |
| -: | - |
| 401 | `SUPERSEDED — the subject is gone: tsconfig-entry-liveness is FINAL and declares tracked-files + authored-text (:155), so the #2021 comment routes nobody. contract/resource-json.ts:35-46 still lists exactly five ids and never gained a tsconfig member` |

### Rows that stay OPEN but whose CELL should be refreshed

| line | replacement state cell |
| -: | - |
| 213 | `**OPEN — systemic; the named nine are CLOSED.** Re-censused 2026-09-12 at 61cae0710 over all 248 defineGate modules with both controls: FAMILY 178/248 · POPULATION PORT 157/248 · legacy SHA 167/248 — i.e. 70/91/81 missing, so the rollup's "48+" is an UNDERCOUNT` |
| 262 | `**OPEN** — re-censused at 61cae0710 over the twelve modules origin-client-family.suite.test.ts imports: 10 of 12 carry no FAMILY line and 12 of 12 carry no POPULATION PORT` |
| 357 | `**OPEN (PARTIAL)** — Tier 2b AND 2c landed at c97de9d2f (schema-fact-parity.test.ts: 9 modules, 86 examples, findings + populations + tool errors, legacy side nonzero at 42/41-of-86). Still owed: the Tier 3 ruling, turn-identity and plugin-dump-guard` |
| 395 | `**OPEN — the correction is itself stale: the number is SEVEN, not eight.** contract-derives-not-respells' ALLOWLIST moved to lib/contract-derives-not-respells.ts:32 at d9d1e3524. Live declaring finals: depcruise-grant-liveness:52,74 · eslint-grant-liveness:21 · injected-op-caller-param:53 · lifecycle-portability:114 · no-raw-spacing-in-features:39 · no-raw-typography-in-features:39 · runner-config-path-liveness:106. Ledger :656 still reads TEN` |
| 397 | `**OPEN — half (a) repaired in read-first, and it MOVED: the same false sentence survives in guide §3 ("it shipped, and the gate is still legacy").** Half (b) is stale again by a new delta: read-first:137 says 298 / 238 / 60; measured at 61cae0710 the loader says 300 module(s) / 246 final / 54 legacy` |
| 448 | `**OPEN — narrowed by 007c8b837 (#2068).** The inert-escape predicate (format.ts:196-205) covers `\_`mid-word and`~`only;`#`, `\[`and`\*` still escape, and the corpus is unrepaired — the row's own counterexample still reproduces (scout-D2-oidc-infra.md holds 3 plain and 3 escaped id\_token\_hint spellings). The header now DOES state the predicate (:166-188)` |
| 483 | `**OPEN — arms 1+2 of 3 landed at b5490a02a (#2101).** css-length-tokens.ts:159-174 STRUCTURAL_CLASS_FILES still carries per-file count rows (3/2/1/9); css-family-ownership, css-var-defined and duplicate-action-doors are unruled` |

## STILL OPEN, grouped for lanes

Chunked by MODULE / shared reader, so a fix lane owns one reading surface.

**Chunk A — the mirror family (`test-presence` · `test-presence-client` · `test-layout` + `mirror-index`), 7 rows: 542, 543, 544, 545, 546, 547, 549.** All three gate modules are byte-identical to their conversion `aecbc6c6c` in every arm the audit measured (only `test-presence-client` moved, for #2103). One lane, one reading of the three modules plus `mirror-index-family.suite.test.ts`: four §4.1 rows for `test-presence`, four for `test-presence-client`, the `MIRROR_MIN_SEGS` joint-cut decision for `test-layout`, the two `why` corrections, three `runPolicyPass` refusal pins, the §4.6 differential, and the `90bbeb04f` → `6b1d01be0` header fix.

**Chunk B — `suppressions` and its coupled ledgers/docs, 7 rows: 540, 541, 548, 550, 551, 552, 553.** One module (`suppressions.ts`), one shared reader (`lib/reviewed-grant-findings.ts`), and four documents that all describe the same four deleted artifacts. The doc half (551/552/553) is a single sweep; the code half is a numeric sort, a missing test arm set, a message pointer and a header SHA.

**Chunk C — the `waivable-coordinate` / ordinary-CSS family, 5 rows: 530, 531, 532, 534, 483.** One shared reader (`lib/waivable-coordinate.ts`) and its three consumers (`no-raw-color-in-css`, `no-tailwind-dark-variant`, `rest-transform-grid`), plus `css-length-tokens`' third arm. The new central behaviour needs its pin, both `fix` strings need to agree with the code, the two identity arms need their paren-carrying coordinate, and the three `no anchorable coordinate` throws need a row or a stated limit.

**Chunk D — §5b.5 headers and the surviving `ExemptionTable`s (#1922 / #2005), 5 rows: 192, 213, 262, 394, 395.** The seven declaring FINAL modules and the 70/91/81 header gap are one authority-migration reading. The ledger's own row-5 census needs its third correction in the same pass.

**Chunk E — doc/route staleness and instrument comments, 6 rows: 372, 382, 397, 400, 448, 533.** Six documents/comments, no gate logic: the roster's `@sub-floor-ok` cell, `conformance.int`'s over-claiming comment, read-first §2's corpus count plus guide §3's surviving legacy claim, the ts7 freshness pin, the escape predicate's remaining half, and the three unwarned `exemplars-2026-09-11` routes (two of them in the ALWAYS-loaded constitution).

**Chunk F — judgement calls, 5 rows: 247, 357, 371, 386, 447.** Each needs a decision rather than a mechanical fix: the `no-inline-types` type-home question (and a `check:structure` measurement), #2000's Tier 3 ruling and its two unaddressed modules, whether `tooling-ops-direct-invocation`'s row should discriminate at all, a `scaledBudget` for the D53 watchdog, and how a warning policy's `workItem` openness gets validated.

## LEDGER ROWS (3 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `dangling-refs` (review docs) | cb-v-ledger-reconcile L1 · `tests/tooling/verify/gates/dangling-refs.repo.int.test.ts:50,73,182` | the repo pin is RED on a NEW population: **20 phantom cites, 19 of them inside `docs/reviews/gate-runtime/**`** — the tree the #1584 program itself writes. None is one of the nine `e2b183b80` symbols the earlier row named, so this is fresh drift, not that row surviving. Three of the six tests fail, including the FROZEN-doc control | roster row | **OPEN — new** | run at `61cae0710`: `pnpm test:scoped tests/tooling/verify/gates/dangling-refs.repo.int.test.ts` → exit 1, 3 failed / 3 passed, 94.9 s. The set: `bus-pair-1584.md:191,216,270` · `exception-authority-census.md:91,93,149` · `home-server-family-1584.md:30` · `ordinary-visitors-family-1584.md:131` · `origin-client-family-1584.md:45` · `origin-server-family-1584.md:106,209,210` · `policy-soundness-family-1584.md:113` · `registry-family-1584-checkpoint.md:188` · `resource-layout-size-inventory.md:40` · `schema-fact-family-1584.md:229,338` · `simple-visitors-a-m.md:60` · `v-audit-wave6-2026-09-12.md:189` · `v-conversions-2026-09-13.md:165` |
| `zod-error-issues-home` | cb-v-ledger-reconcile L2 · `tooling/src/verify/gates/zod-error-issues-home.ts:44,110-116,121` | declares a DISTINCT `UNREADABLE` string and passes it as `unreadableMessage`, but the single `candidates.push` at `:110` sets no `unreadable` field, so no candidate can ever carry it — an advertised #944 third answer unreachable by construction (§5b.1: nothing declared that it does not use). This is the sibling the `no-untyped-soft-ref` row named as out of its scope; that module was repaired at `4096bc3a9` and this one was not | §5b.1 | **OPEN — new** | read of every `candidates.push` in the module (there is one, `:110-116`, with fields `node`/`subject`/`operation`/`token`/`offset` only) against `:121`'s `unreadableMessage: UNREADABLE` where `:44` is a distinct string. CONTROL, same invocation: `no-raw-interactive-intrinsics.ts:41` is `UNREADABLE = MESSAGE` — the honest form — so the check distinguishes the two shapes |
| the refutation ledger | cb-v-ledger-reconcile L3 · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` (whole file) | **`b5490a02a`'s commit message claims three ledger flips that never landed** — *"flipped ledger rows: cb-v-authority-census C1 · L7 (#2101, partial) · L10 (#2103)"* — but the commit touched no ledger file and no later commit did either, so rows `:483` (L7) and `:486` (L10) still read OPEN for work that shipped. This is the exact failure the ledger's own maintenance rule 1 (*"NO ROW OUTLIVES ITS FIX"*) exists to stop, one merge after the rule was written | other (ledger staleness) | **OPEN — new** | `git show --stat b5490a02a` lists nine files, none under `docs/reviews/`; `git log --oneline -5 -- docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` tops out at `27eacbae0`, which PRECEDES `b5490a02a` in `git log`. The two rows' subjects verified landed on the tree (`css-length-tokens.ts` occurrence keys; `CLIENT_EXCLUDE_FILES` deleted) |

## WHAT I DID NOT COVER

Treat everything here as unmeasured.

- **I ran no `pnpm check:structure`** (fenced by the brief: two structure legs were queued ahead of me).
  Everything that depends on a real-tree finding COUNT is therefore unverified by me: row 247's `19`,
  row 540's `3 diagnostic-legibility findings`, and — importantly — the EFFECTIVE SUPPRESSION of the
  markers I credited as closing rows 407 and 408. I verified the markers exist in the central grammar at
  the named positions; I did not verify they BIND. A stale-position marker would show as an authority
  alarm on a structure run and I would not have seen it.
- **I ran none of the four planting suites**, so row 261's `gate-spelling-twins` CLOSED verdict rests on
  a source read of the re-expressed derivation (both engines imported, ledger re-minted), not on a pass.
- **I ran no §4.1 cut.** Every narrowing verdict here is of the same weaker kind the 2026-09-11 sweep
  used: a CLOSED narrowing means the discriminating row now exists and I read its `why` and the
  conformance stage passes it; a STILL OPEN one means I searched the module and found no such row. For
  rows 544–547 the stronger claim available is that the modules are BYTE-IDENTICAL to the tree the
  cb-v-mirror-suppressions lane cut against, so its two-arm measurements stand unaltered.
- **The §5b.5 census is a REGEX BOUND, not the hand read guide §5b.5 demands.** It over-reports FAMILY
  and PORT (any occurrence of the phrase in the header span counts, including prose about a missing one)
  and its SHA field, though controlled in both directions, cannot tell a port citation from an incident
  cross-cite. Read it as an upper bound on compliance / lower bound on the gap.
- **I did not open the board.** Every board status here comes from the orchestrator's
  `open-idstatus.tsv`; row 396's CLOSED verdict rests entirely on that file.
- **I did not re-read the wave documents end to end** (brief fence), only the exact lines rows cite plus
  wave 6's headline table and its family module list.
- **I did not adjudicate the 141 CLOSED, 13 FIXED, 4 SUPERSEDED or 1 DISSOLVED rows.** A CLOSED row that
  has since REGRESSED would be invisible to this pass.
- **Row 247's real-tree count remains the ledger's one genuinely unreachable cell**, for the same reason
  it has been since 2026-09-11.
