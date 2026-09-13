---
kind: review
status: active
updated: 2026-09-13
---

# Adjudication reconcile — fourteen CLOSED board rows against their refutation-ledger cells (`cb-adj-reconcile`)

## 1. Base and method

**Tree:** worktree `.claude/worktrees/agent-aa7665723bfc6d9a3`, HEAD `1ea2c2a0e`
(`docs(catalog): attest resource contract and selection evidence`), `git status --short` EMPTY at start.
**Read-only lane.** No tracked file was edited. Two probe files were planted and removed inside this
worktree only (`tooling/cb-adj-reconcile-probe.ts`, then `tests/tooling/cb-adj-reconcile-probe.ts`); the
tracked ledger is byte-identical to HEAD.

**Subjects:** #1947 #1968 #1969 #2019 #2148 #2068 #2093 #2139 #2166 #2167 #2199 #2233 #2232 #2302.
All fourteen are CLOSED on the board (`gh issue view`, states and `closedAt` captured per issue).

**Per issue:** (1) read the closure comment verbatim; (2) grep the ledger for `#<n>` AND for the row's
subject text, so a row that never names the number is still found; (3) for each matching row, read the
CITED code/doc on today's tree and, where cheap, drive the pin the closure receipt names; (4) propose a
cell.

**Runs I produced in this session** (nothing quoted from a report):

| run | result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/gates/gate-modernization.test.ts` | **exit 0**, 3 passed |
| `pnpm check:structure --check dangling-refs` | **exit 0**, clean, 7582/7582 files · 200/200 docs |
| `pnpm test:scoped tests/tooling/doc-catalog` with a parse error planted in `tests/tooling/` | **exit 0**, 8+1 files, 67+3 tests, `Type Errors no errors` |
| the rollup re-derivation (`rollup.py`, the ledger's own counting method) | today **508 rows**; validated against `73b37ba77` where it reproduces the committed `457 / 273 / 163 / 5 / 2 / 1 / 13` exactly |

**Instrument honesty.** The rollup script was validated BEFORE use: run over the ledger as it stood at
`73b37ba77` — the commit that wrote the committed `457` table — it reproduces that table's TOTAL row cell
for cell, with `UNBINNED 0`. Its CLASS axis does **not** reproduce the committed per-class rows (it finds
no `§5b.3` and no `§12.3` rows where the committed table has 9 and 3), so **only the STATE axis of my
deltas is claimed as measured**; the class split below is indicative and the applier should re-derive the
class table rather than apply my class numbers.

Every sha cited below was confirmed an ancestor of `1ea2c2a0e` (14/14 present in `git rev-list HEAD`).

## 2. Per-issue reconciliation

### #1947 — native-config unrunnable at repository scope

**Closure receipt:** *"STALE per cb-v-world-gates … all three native-config consumers … carry a committed
real-root arm and all three ran green in a clean worktree with the tracked symlink this row names still
present … The exit-2 the row asserts does not reproduce."*

**Matching rows:** `:396` (`#1947`, cb-v-world-gates) and `:492` (`tsconfig-entry-liveness-health`,
cb-v-config-liveness L1). **Both already read CLOSED.** `:394` (three FINAL world-program modules carrying
gate-owned `ExemptionTable`s) matches the subject area and is OPEN, but its cell states it is subsumed by
**#1922**, not by #1947 — out of my fence, left untouched.

**PROPOSED: no change.** #1947's ledger footprint is fully reconciled.

### #1968 — 64 expectation rows with no `count`

**Closure receipt:** *"8aa9867c3 (merged). policy-proof-expectations findings 78 to 11 … The 11 remaining
are a MEASURED and EXPLAINED exemption … Tracked as #2001."* (#2001 is itself now CLOSED.)

**Matching rows:** `:216` `:243` `:244` `:354` `:369` `:370` already CLOSED; `:371` OPEN.

`:371` `tooling-ops-direct-invocation` — *"one `mustFlag` row with a whole-message `messageIncludes`"*,
left open because the judgement *"belongs with #1968"*. **Tree:** `grep -n messageIncludes
tooling/src/verify/gates/tooling-ops-direct-invocation.ts` → **0 hits** (exit 1). Positive control: 213
modules under `tooling/src/verify/gates/` still carry the spelling, so the search works. The judgement was
made: `874b34b58` (*"the 23 blocking policy-proof-expectations ARM-M findings … (#2025, #1968, #1584)"*)
names this module in its own DELETED-AS-CEREMONY list, with the reason — *"the row's own SIBLINGS already
carried no `messageIncludes`"*.

**PROPOSED `:371`:** CLOSED — `874b34b58` (board #1968), the clause naming the ceremony deletion.

### #1969 — `compared > 1000` floor on the shrinking legacy corpus

**Closure receipt:** *"suite-honesty landed 91d9a2ab7 … all eleven rows fixed with receipts."*

**Matching rows:** `:335` CLOSED, `:381` CLOSED, `:429` FIXED, **`:382` OPEN**.

`:382` `conformance.int.test.ts` — the comment claims both denominators are *"derived independently of the
sweeps' own traversals"* while the FINAL half calls the same `virtualProofsOf` the sweep iterates.
**Tree at `1ea2c2a0e`: THE DEFECT REPRODUCES.** `tests/tooling/verify/ops/conformance.int.test.ts:422-423`
still reads *"Both halves are derived here independently of the sweeps' own traversals"*; `:425` is
`corpus.final.reduce((n, p) => n + virtualProofsOf(p).length, 0)`; `policySweep` (defined `:257`) iterates
`for (const proof of virtualProofsOf(policy))` at `:263`. Same function, both sides.

**PROPOSED `:382`: OPEN KEPT, unchanged.** #1969's closure was correct about the eleven rows it
named; this row is a NEIGHBOUR the closure never claimed, not a wrong closure.

### #2019 — no `policy-soundness` arm reads `ctx.resources`

**Closure receipt:** *"CONFIRMED by cb-v-wave-8b … #2019 E4 at zero over 7547 files, planted control reds,
both negatives silent."*

**Matching row:** `:561` OPEN (shared with #2148) — the ACTIVE roster row documents E1–E3 only and asserts
*"All three were at ZERO at mint"*, with E4 absent.

**Tree:** the row has MOVED from `Core-Enforcement-Active-Gates.md:336` to `:339` and now reads
*"E4 a resource-host read that does not sit directly inside `readyResourceValue(…)` resolved BY IMPORT
ORIGIN to `lib/resource-declaration.ts` (#2019 …)"*, *"the numbering here runs E1–E4 then E6–E7"* and
*"All arms were at ZERO at mint and are pinned there"*. Landed by `99db67542`
(`git log -S'E4 a resource-host read that does not sit directly inside'`).

**PROPOSED `:561`:** CLOSED — `99db67542` (board #2019 / #2148), the clause naming the E1–E4 roster row.

### #2148 — `readTsconfigRoster` E4 alias escape

**Closure receipt:** *"b254138ab: the resource-host seam inverted — readTsconfigRoster takes ready values,
both callers narrow, E4's hand-off carve retired as a mustFlag on the same fixture."*

**Matching rows:** `:561` (above) and `:562` OPEN — *"a TRACKED, unapplied handover patch
(`.claude/handover/pps-2109-items-1-2.patch:10`) adds the roster's E4 clause in its PRE-#2148 wording …
Applying it as-is writes the retired exception back into the law index."*

**Tree:** `git ls-files .claude/handover` returns **NOTHING** — the directory holds no tracked file. The
deleting commit is `ee165b3a7` (`docs(verify): reconcile gate proof and tier authority (#2109 #2170 #2287)`). Corroborating: the roster's live E4 clause carries **0** hits for `ONE HAND-OFF IS ADMITTED`, and
`readTsconfigRoster` now appears only in `policy-soundness.ts`'s deliberate "as it then was" record and
four dated docs (the ledger itself among them).

**PROPOSED `:562`:** DISSOLVED — `ee165b3a7` (board #2148) — the row's subject (a tracked,
appliable patch) no longer exists on the tree; nobody "fixed" the wording, the carrier was deleted.

### #2068 — `dangling-refs` still RED

**Closure receipt:** *"CONFIRMED on re-derivation by claude-b at 9ad17fb5a on main checkout: pnpm
check:structure --check dangling-refs → EXIT 0, zero findings … The rider narrowing
(`\bdead\b(?![-\s]ends?\b)`) is CONFIRMED both directions."*

**Matching rows:** `:780` OPEN, `:781` OPEN, `:878` DISSOLVED (already), `:998` CLOSED (already, the #2312
`:146` regression).

- `:780` (35 findings at `50e31c534`). **Re-run by me at `1ea2c2a0e`:** `pnpm check:structure --check
  dangling-refs` → **EXIT 0**, `✓ dangling-refs · scanned 7582/7582 files · 200/200 docs (gate-declared) ·
  citation-corpus:design 41 · law 57 · law-outside-docs 2`. Non-zero scan, so this is a measurement and not
  an empty probe. Closed by `8d1654afc` (`dangling-refs goes GREEN — 30 → 0`) plus the `:146` regression
  repair `037356d74` (#2312), which `:998` already records.
- `:781` (the `\bdead\b` escape never decided). **Tree:** `dangling-refs.ts:399` carries the negative
  lookahead; the decision is written out at `:392-399`; the CAUGHT side has its own `mustFlag` fixture at
  `:1081-1088` (`__probe_dead_end.md`). Landed by `8d1654afc`.

**PROPOSED:** both CLOSED.

### #2093 — `serde-core-seal` instrument false positive (split family)

**Closure receipt:** *"a5abe00d7: … gate-modernization ARM B no longer accuses a split family's ordinary
half; pending cb-v-fix-wave-3."*

**Matching rows:** `:471` CLOSED (already), `:560` OPEN, `:673` OPEN, plus `:564` OPEN — a violation
LANDED by the #2093 commit `a5abe00d7`, so it matches by subject even though it names `test-layout`.

- `:560` — the #2093 door excuses a collection whenever ANY importing sibling carries ANY stale-arm string.
  **Tree:** the door is GONE. `gate-modernization.ts:412-433` is a block header titled *"THE #2093
  SPLIT-FAMILY EXCUSE IS RETIRED — AS AN ASSERTION, NEVER AN ABSENCE (#2219, owner ruling)"*: the excused
  arrangement is now a `mustFlag` accusation and the sanctioned `lib/` shape a `mustPass`. Landed by
  `3f08879f4`. The row's premise (an over-wide EXCUSE) cannot be pinned because there is no excuse.
  **PROPOSED: SUPERSEDED** — the ruling moved under the cell, which is what SUPERSEDED means here.
- `:673` — `gate-modernization.test.ts:138` RED on main, `covered.length` 0, dead door held alive by
  fixtures. **Re-run by me:** `pnpm test:scoped tests/tooling/verify/gates/gate-modernization.test.ts` →
  **exit 0, 3 passed**, including *"no accusation on the real corpus is of the RETIRED split-family shape
  (#2219)"*. **PROPOSED: CLOSED — `3f08879f4`.**
- `:564` — `tests/tooling/verify/gates/gate-modernization-arm-b.test.ts` reds `test-layout` (mirror miss).
  **Tree:** the file does not exist; `ls tests/tooling/verify/gates/ | grep gate-modernization` returns
  only `gate-modernization.test.ts`; renamed by `5e2b8af98` (#2174). **PROPOSED: CLOSED.**

`:563` and `:565` (the two `biome-rule-liveness` neighbours from the same wave) already read CLOSED.

### #2139 — `exception-authority-census.md` describes deleted artifacts

**Closure receipt:** *"a7aad5369: the LANDED annotations on the five deleted-artifact rows; verifier
REFUTED one number (45→46 at d23150315), carried as #2210 for the same lane."*

**Matching rows:** `:552` CLOSED (already), `:654` OPEN, `:786` OPEN. Both open rows are the SAME
off-by-one, filed twice by two waves.

**Tree:** `exception-authority-census.md:179` reads *"the former ratified SOURCE table held **46** source
rows"*; `:171-176` carries the LANDED note and, crucially, the METHOD and the reason the first sweep
returned 45 (*"a BARE identifier key hides from it entirely"*, `format:` at `:145`); `:172` names #2210.
`:182` reads *"the true story is 46 → 46 source and 7 → 19 tests"*. Landed by `1bf959a3e` (`docs(core):
… correct the RATIFIED census by one (#2067, #2143, #2169, #2210, #2068, #1584)`).

**PROPOSED:** `:654` and `:786` both CLOSED — `1bf959a3e` (board #2210).
See §4 — **#2210 is still OPEN on the board** although its whole subject has landed.

### #2166 — ledger section appended below the rollup

**Closure receipt:** *"ae7a40e0b: the ledger fence reports what it excludes … #2224 filed for the four
sibling fence shapes it misses."*

**Matching row:** `:672` OPEN — the stray scanner opens a buffer only on `### `, and `isLedgerRowTable`
compares lowercase literals, so a bare `##`, a headingless table, a `####` and a capitalised `| State |`
are all silently uncounted.

**Tree:** `gate-program-docs.ts:148-166` names all four shapes explicitly *"AND IT NOW READS EVERY
CONTAINER A ROW CAN LAND IN (#2224)"*; `:170` `CONTAINER_HEADING = /^(#{2,4}) (.*)$/`; `:210-219` a `##`
opens a candidate ENCLOSING ITSELF (which is the headingless shape); `:116` `columns.map((c) =>
c.toLowerCase())` case-folds the schema. Landed by `c810fee07`.

**PROPOSED `:672`:** CLOSED — `c810fee07` (board #2224).

### #2167 — a VOIDED `check:structure` slot carries no tombstone

**Closure receipt:** *"e0dcf56d8: slot verdict/nonVerdictReason stamping … defects filed: #2221 (.inflight
never unlinked for non-verdict runs), #2222 (reason/banner placement), #2223 …"* — i.e. the closure
receipt itself names the two rows below as SUCCESSORS, and #2221/#2222 are now CLOSED too.

**Matching rows:** `:666` OPEN (the `.inflight` marker), `:667` OPEN (the debt refusal drops the reason).

- `:666` **Tree:** `tooling/src/_shared/artifacts.ts:242` — *"FINISH a run that completed and deliberately
  published NOTHING (#2221). … `publishRunSlot` was its only unlinker"* — `closeRunSlot` now unlinks at
  FINISH, with two callers by design (a NON-VERDICT run and a GATE-SCOPED run) and an explicit
  no-prune clause (#2262). Landed by `6cd7b488c`.
- `:667` **Tree:** `tooling/src/verify/ops/debt.ts:163` returns
  `` `run ${run.runId} is a NON-VERDICT (#2167) — ${run.nonVerdictReason ?? "no reason recorded"}` ``, and
  `:148-166` is the ordered refusal reader that carries the reason out of `liveAdmitted`. Landed by
  `6cd7b488c` (which names #2222).

**PROPOSED:** both CLOSED — `6cd7b488c`, each naming its own board id.

### #2199 — `gate-spelling-twins` blindness ledger + stale planted control

**Closure receipt:** *"a7d88287b: four blind twins closed in the shared readers (sanctioned shrink with
receipts) … verified CONFIRMED by cb-v-additions-wave."*

**Matching rows:** `:652` CLOSED (already), `:680` OPEN — the shrink receipt claims the ACQUITTAL is
*"Pinned by that gate's own new namespace `mustFlag` row"*; a `mustFlag` cannot pin an acquittal and *"none
exists"*.

**Tree — both halves answered:** (a) the sentence now reads *"Pinned by that gate's own `mustPass` row at
`tooling/src/verify/gates/owner-scoped-writes.ts:320-329`"* with a dated **CORRECTED 2026-09-13 (#2233,
cb-v-wave-5)** note quoting the false original and the wrong sha credit
(`tests/tooling/gate-spelling-twins.int.test.ts:39-46`); (b) that `mustPass` row EXISTS — the `mustPass:`
array opens at `owner-scoped-writes.ts:309` and `:320-329` is *"THE ACQUITTAL'S OWN ROW (#2214) … this
write is CORRECTLY SCOPED and namespace-spelled, so the gate must stay SILENT on it"*. Landed by
`59297ef74`.

**PROPOSED `:680`:** CLOSED — `59297ef74` (board #2233).

### #2233 — the `gate-spelling-twins` comment still false after `eb51d4313`

**Closure receipt:** *"Landed 59297ef74 + 68334c74c (codex-primary ff of cb-x-verify-lib-fixes
f0390de77) … Bounded fixes closed; not full gate-program acceptance."*

**Matching rows:** `:715`, `:828`, `:835` — all OPEN.

- `:715` the false `mustFlag` sentence. **Tree:** corrected in place at `:39-46` (quoted above).
- `:828` the paragraph claiming the suite *"calls `loadGates()`, which returns `corpus.legacy` ALONE"*.
  **Tree:** DELETED, and the deletion is recorded at `:47-50` (*"a comment-honesty fix that ships a new
  false comment is the disease"*). `grep -n 'loadGates\|loadMixedGateCorpus'` → the real import is `:69`
  and the real call `:99`; the surviving `loadGates` mentions at `:11`/`:21`/`:47` are historical prose.
  The orphaned `owner-scoped-upserts` bullet is contiguous again at `:51-53`.
- `:835` three wrong receipts. **Tree:** `x-verify-lib-fixes-2026-09-13.md:293-306` is a dated
  **"Receipt corrections (cb-v-verify-lib-4, 2026-09-13)"** section fixing all three, including the one
  the row said was a deviation the report claimed to have avoided: *"THE FORMATTER CHURN DID SHIP … three
  landed in `509d1d56a`"*. Independent corroboration of item (2): my own run of
  `gate-modernization.test.ts` reports **3 tests**, not 4.

**PROPOSED:** all three CLOSED — `59297ef74`.

### #2232 — `test:scoped` runs both typecheck projects on every node run

**Closure receipt:** *"Landed 59297ef74 + 68334c74c … final #2232 control at dd00ebb78: a malformed export
planted in tests/tooling/ left registry.test.ts 9/9 exit 0."*

**Matching rows:** `:830`, `:831`, `:832` — all OPEN.

- `:830` the MIXED arm emits NEITHER flag; the #2229 founding case unfixed. **Tree:**
  `ops/scoped-test.ts:224-232` — the fourth arm returns ``collectedProjects.map((n) => `--project=${n}`)``,
  i.e. the UNION the row itself prescribed, and `:213-217` names the first draft's MIXED bug as the thing
  it fixes. The FOUNDING CASE is closed one lever over: `vitest.config.ts:74` sets
  `IGNORE_SOURCE_ERRORS = true`, and `59297ef74`'s own body says it does so *"in this commit"*.
  **RE-DRIVEN BY ME at `1ea2c2a0e`:** planted `tests/tooling/cb-adj-reconcile-probe.ts` containing
  `export const cbAdjReconcileProbe: = 1;` — a path matched by `tsconfig.json`'s `tests/**/*.ts` include
  and NOT excluded — then `pnpm test:scoped tests/tooling/doc-catalog` → **EXIT 0**, `Test Files 8 passed
  (8)` + `1 passed (1)`, `Tests 67 + 3`, `Type Errors no errors`. The row's own receipt (exit 1 with all
  tests green) does not reproduce. Probe removed; `git status --short` empty.
- `:831` the false RED-FIRST paragraph in the committed pin's header. **Tree:**
  `tests/tooling/verify/ops/scoped-test.test.ts:1-3` is three factual lines with no receipt claim, and the
  MIXED arm has real pins at `:23-35` (*"THE ARM THE FIRST DRAFT GOT WRONG"*) and `:37`.
- `:832` the false measured sentence in `UNIFIED-VERIFICATION-DESIGN.md`. **Tree:** `grep -c "every scoped
  node run carried"` → **0**; `grep -c "reddened by a planted parse error"` → **0**. Replaced at
  `:364-382` by the four-arm door plus a measured WHAT-THIS-DOES-NOT-FIX paragraph. **That replacement has
  its own defect — filed as a new row below.**

**PROPOSED:** all three CLOSED — `59297ef74`.

### #2302 — the positional re-pointing hazard has no scoped pin

**Closure receipt:** *"landed 335629e2e (two mustFlag rows: index-0 insert count 15 token
config\[0].ignores\[1]; append-at-end count 1; green twin = existing mustPass) + 61fb1b8ef (prose) …
Specific positional-proof acceptance, not program closure."*

**Matching rows:** `:915` CLOSED (already), `:916` OPEN, `:738` CLOSED (already, the #2213 coupled site).

`:916` **Tree:** `eslint-grant-liveness.ts:193-241` carries THE #2302 POSITIONAL RE-POINTING ARM with the
two rows the receipt names — `expect: { count: 15, token: "config[0].ignores[1]", messageIncludes: "no
longer names the same zero-member selector" }` and `expect: { count: 1, token: "config[0].ignores[8]" }` —
and the arithmetic is spelled out at `:212-218`. **But the row's literal ask is still unmet:**
`tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts:54-68` asserts owner success, population

> 1000, a resource receipt and empty `waiverCarrierRefusals`, and `:66-67` says outright *"The real-tree
> VERDICT (zero effective findings) is no longer asserted here: the mixed front door runs this policy on the
> real corpus on every `pnpm check:structure` and owns that verdict"*. So there is still **no scoped
> assertion of RATIFIED value-at-index against the real `eslint.config.js`** — the property is held one tier
> up, disclosed, and now detectable by the gate itself.

**PROPOSED `:916`: CLOSED, with the residual NAMED IN THE CELL** (the hazard is pinned and the
property has a tier that holds it; the row's wording is narrowed, not silently satisfied). Also in §4.

## 3. Proposed ledger patch

- **Patched copy (untracked, in this worktree):**
  `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-aa7665723bfc6d9a3/docs/reviews/gate-runtime/refutation-ledger-2026-09-12.PROPOSED-cb-adj-reconcile.md`
- **Unified diff:**
  `/tmp/claude-1000/-home-inktomi-inktomi-stack-development-orbweaver/b854b7b8-801a-4bcf-a9d5-219b85ce2f5e/scratchpad/adjrec/ledger-proposed.diff`
  — **21 changed lines, 21 `-` and 21 `+`, all inside a single table cell each.** No context line moves, no
  reformat, no heading touched. The generator (`…/scratchpad/adjrec/patch.py`) locates the `state` column
  by NAME off each table's own header and asserts that all 21 targets matched; every one was `OPEN` before.
- **Rollup re-derivation:** `…/scratchpad/adjrec/rollup.py`.

**Row-by-row (all 21 were `OPEN`):**

| line | section | issue | → |
| -: | - | - | - |
| 371 | cb-v-mixed-hooks-1-3 | #1968 | CLOSED `874b34b58` |
| 560 | cb-v-fix-wave-3 | #2093 | SUPERSEDED `3f08879f4` |
| 561 | cb-v-fix-wave-3 | #2019 / #2148 | CLOSED `99db67542` |
| 562 | cb-v-fix-wave-3 | #2148 | DISSOLVED `ee165b3a7` |
| 564 | cb-v-fix-wave-3 | #2093 (neighbour) | CLOSED `5e2b8af98` |
| 654 | cb-v-additions-wave | #2139 / #2210 | CLOSED `1bf959a3e` |
| 666 | cb-v-instruments-2 | #2167 / #2221 | CLOSED `6cd7b488c` |
| 667 | cb-v-instruments-2 | #2167 / #2222 | CLOSED `6cd7b488c` |
| 672 | cb-v-instruments-2 | #2166 / #2224 | CLOSED `c810fee07` |
| 673 | cb-v-instruments-2 | #2093 / #2219 | CLOSED `3f08879f4` |
| 680 | cb-v-migrations-wave | #2199 / #2233 | CLOSED `59297ef74` |
| 715 | cb-v-wave-5 | #2233 | CLOSED `59297ef74` |
| 780 | cb-v-wave-8c | #2068 | CLOSED `8d1654afc` + `037356d74` |
| 781 | cb-v-wave-8c | #2068 | CLOSED `8d1654afc` |
| 786 | cb-v-wave-8c | #2139 / #2210 | CLOSED `1bf959a3e` |
| 828 | cb-v-verify-lib-4 | #2233 | CLOSED `59297ef74` |
| 830 | cb-v-verify-lib-4 | #2232 | CLOSED `59297ef74` |
| 831 | cb-v-verify-lib-4 | #2232 | CLOSED `59297ef74` |
| 832 | cb-v-verify-lib-4 | #2232 | CLOSED `59297ef74` |
| 835 | cb-v-verify-lib-4 | #2233 | CLOSED `59297ef74` |
| 916 | cb-v-wave-12a | #2302 | CLOSED `335629e2e` + `61fb1b8ef` (residual named in cell) |

### Rollup deltas the applier must land

**These are STATE-axis numbers, re-derived by the ledger's own counting method and measured before AND
after on the two files, not computed by hand.** The committed rollup already disagrees with the body — see
§4 and the new row — so the applier should REBUILD the rollup rather than arithmetic the committed cells.

| | rows | CLOSED | OPEN | SUPERSEDED | DISSOLVED | UNADJUDICATED | N/A | FIXED | UNBINNED |
| - | -: | -: | -: | -: | -: | -: | -: | -: | -: |
| committed table (`:1063`) | 457 | 273 | 163 | 5 | 2 | 1 | 0 | 13 | — |
| body TODAY (`1ea2c2a0e`, measured) | 508 | 316 | 158 | 5 | 2 | 1 | 0 | 23 | 3 |
| body AFTER my 21 flips (measured) | 508 | **335** | **137** | **6** | **3** | 1 | 0 | 23 | 3 |
| my delta | 0 | **+19** | **−21** | **+1** | **+1** | 0 | 0 | 0 | 0 |
| + my 2 new rows appended (OPEN) | **510** | 335 | **139** | 6 | 3 | 1 | 0 | 23 | 3 |

Per-table (class axis, **indicative only** — my binner does not reproduce the committed `§5b.3`/`§12.3`
rows, so re-derive rather than apply): §4.1 CLOSED +2 / OPEN −3 / SUPERSEDED +1 · §5b.2 CLOSED +1 / OPEN
−1 · roster CLOSED +2 / OPEN −2 · other CLOSED +14 / DISSOLVED +1 / OPEN −15.

`pnpm -s check:ledgers-fresh` was **NOT run**: its ledger arm reads the TRACKED path
(`docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md`) and takes no file argument, so pointing it at
my patched copy is not possible without editing the tracked file, which this lane does not do. The applier
runs it after applying.

## 4. Disagreements

1. **`:382` (#1969) stays OPEN and I am refusing to flip it.** The comment at
   `tests/tooling/verify/ops/conformance.int.test.ts:422-423` still claims both denominators are derived
   independently of the sweeps' traversals; `:425` and `:263` call the same `virtualProofsOf`. #1969's
   closure never claimed this row — it is a neighbour the wave filed as *"new, minor"* — so this is a
   ledger row without a board row, not a wrong closure. **It needs a board row before it can be worked.**
2. **#2210 is OPEN on the board while its entire subject has landed.** Both its ledger rows (`:654`,
   `:786`) are fixed on the tree by `1bf959a3e`, which names #2210 in its own subject line. This is the
   opposite of the usual disagreement: the board is behind the tree. **Proposed board action: close #2210
   with `1bf959a3e` as evidence** (orchestrator's call — this lane does not touch `work:item`).
3. **#2302's closure is narrower than its row.** The hazard is now detectable and pinned by two `mustFlag`
   fixture rows, but the row asked for a REAL-config value-at-index assertion in the scoped floor and there
   still is none; `eslint-grant-liveness.int.test.ts:66-67` deliberately defers the real-tree verdict to
   `check:structure`. That is a legitimate enforcement-ladder answer and it is disclosed in the test's own
   header, so I propose CLOSED with the residual written into the cell rather than a reopen — but the
   applier should know the row's literal text was not satisfied.
4. **The CLASS ROLLUP is stale by 51 rows and self-contradictory.** Filed as a row below rather than left
   as a remark, per the standing ruling that every verifier-found defect is a ledger row.
5. **Not a disagreement, recorded so it is not mistaken for one:** `:394` (three FINAL world-program
   modules carrying gate-owned `ExemptionTable`s) is OPEN and touches #1947's subject, but its own cell
   assigns it to **#1922**. Out of fence; untouched.

## LEDGER ROWS (2 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| UNIFIED-VERIFICATION-DESIGN | cb-adj-reconcile · `docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md:373-382` | the WHAT-THIS-DOES-NOT-FIX paragraph closes *"Its real lever is `typecheck.ignoreSourceErrors` … and that is an open decision, not something this door does"* — but the SAME commit `59297ef74` SET that flag (`vitest.config.ts:74` `IGNORE_SOURCE_ERRORS = true`; the commit body: *"fence widened by the orchestrator for exactly this, and set `true` on both typecheck projects"*). A law-tier doc records as an OPEN DECISION the thing its own commit closed. Its measured clause is stale with it: *"driven on `tests/tooling/doc-catalog`, a plant in `tsconfig.json` is exit 1 both before and after"* is false AFTER | false measured claim in law (a decision recorded open by the commit that closed it) | **OPEN** | re-driven at `1ea2c2a0e`: `export const cbAdjReconcileProbe: = 1;` planted at `tests/tooling/cb-adj-reconcile-probe.ts` — inside `tsconfig.json`'s program by its `tests/**/*.ts` include, and not matched by any `exclude` — then `pnpm test:scoped tests/tooling/doc-catalog` → **EXIT 0**, `Test Files 8 passed (8)` + `1 passed (1)`, `Tests 67` + `3`, `Type Errors no errors` (so a typecheck project DID run and reported nothing). Probe removed; `git status --short` empty. FIX: delete the "open decision" clause and the before/after parenthetical; state the flag, its condition (*"the same planted error still reds `pnpm typecheck --config tsconfig.json`"*, already in `vitest.config.ts:70-73`) and the tier that now owns source errors |
| `refutation-ledger-2026-09-12` | cb-adj-reconcile · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:1063,1065` | the CLASS ROLLUP is stale by **51 rows** and its DATED HAND CENSUS banner contradicts the table directly above it. `:1063` TOTAL reads **457**; the body holds **508**. `:1065` says the `other` bin *"is **255** rows on 2026-09-13 (derived, the CLASS ROLLUP row above)"* while that row reads **272** and the body reads **328** — a cell citing a source that does not say what it says. Separately the state vocabulary now has **3 UNBINNED** cells it did not have (`**PARTIAL — …**` ×2 at `:964-965`, and `:995` whose state cell begins ``0` ``), the exact silent-drop the counting paragraph was repaired to stop. This is #2207's family, in the file that documents #2207 | ledger staleness | **OPEN** | INSTRUMENT VALIDATED FIRST: `rollup.py` (the counting paragraph's own method — unescaped-pipe split, `state` index off the header by name, first-bolded-word-else-first-word) run over the ledger at `73b37ba77`, the commit that WROTE the 457 table, reproduces it exactly — `457 rows · UNBINNED 0 · CLOSED 273 · OPEN 163 · SUPERSEDED 5 · DISSOLVED 2 · UNADJUDICATED 1 · N/A 0 · FIXED 13`. The same script at `1ea2c2a0e`: `508 rows · UNBINNED 3 · CLOSED 316 · OPEN 158 · SUPERSEDED 5 · DISSOLVED 2 · UNADJUDICATED 1 · FIXED 23`. LIMIT: the CLASS axis does NOT reproduce (my binner finds 0 rows for `§5b.3` and `§12.3` against the committed 9 and 3), so only the STATE axis is claimed. FIX: rebuild at the next quiet barrier, add `PARTIAL` to the vocabulary or rule it, and delete the `255` sentence rather than re-hand-editing it |

ledger rows OWED: 2

## WHAT I DID NOT COVER

- **I ran no whole-tree check.** No `pnpm check`, no bare `check:structure`, no
  `check:policy-conformance`, no CT, no lint or typecheck — the load fence this lane was given. Every
  verdict above is either a tree READ or one of the four bounded runs listed in §1.
- **`pnpm -s check:ledgers-fresh` was not run** (§3 says why). The section-vs-report reconciler's verdict
  on my two new rows is therefore unmeasured; the applier owes it after appending.
- **I did not verify the closure receipts' own upstream claims.** Where a receipt cites a verifier report
  (`v-wave-8b`, `v-wave-7`, `v-instruments-2`, …) I checked the TREE, not the report. Two closures rest on
  suite counts I did not reproduce: #1968's `78 → 11` artifact reading and #1969's eleven-row
  suite-honesty landing. Their ledger rows read CLOSED already and I did not re-open the question.
- **`:394`, `:563`, `:565`, `:915`, `:998`, `:878`** were read and left alone (already CLOSED/DISSOLVED, or
  assigned to an issue outside my fourteen).
- **No board mutation, no reopen, no re-close.** Everything in §4 is a proposal.
- **The three UNBINNED cells at `:964`, `:965`, `:995`** were counted, not adjudicated — they belong to
  `cb-v-css-family` and `cb-v-hit-geometry`, outside my fence.

## Integration adjudication

Root and an independent Codex reviewer accepted 20 of the 21 proposed state changes: 18 CLOSED, one
SUPERSEDED and one DISSOLVED. The #2302 proposal is rejected: the requested real-config scoped proof
remains absent, so its ledger cell stays OPEN. The original proposal above is preserved as evidence,
not silently adopted. #2210's bounded repair was already independently reconciled; #2322 tracks the
conformance denominator claim, and #2323's law paragraph is corrected by `cc3fe1648`. The latter is a
source/documentation repair, with whole-document catalog reattestation still separate.

Only the identified state cells change; historical defects and receipts remain intact. No claim is made
that the old rollup is fresh, that the two newly recorded defects are both repaired, or that the program's
composed verification has passed. The rollup and malformed-row repair remain explicit barrier work.

The copied report's nested template expression in §2232 uses a longer Markdown delimiter so its inner
backticks remain code content; no TypeScript expression or historical measurement changed.
