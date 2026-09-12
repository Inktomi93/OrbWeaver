---
kind: review
status: active
updated: 2026-09-12
---

# cb-v-instruments-2 — the three instrument commits, verified with fresh eyes

Lane `cb-v-instruments-2`, own worktree `agent-a549e8a71071996a4` at `main` tip **`9e14a5d93`**
(`git rev-list --left-right --count main...HEAD` = `0 0`; no rebase owed). Every receipt below is a run I
made in this session. Every probe was in MY OWN worktree (never main's checkout — main's
`reports/runs/structure/` was read ONLY), and `git status --short` was EMPTY before and after.

## VERDICTS

| row | verdict | one line |
| - | - | - |
| **#2167** slot verdict honesty | **CONFIRMED, with three defects** | the axis, the stamps and the `check:show` refusal all hold; the non-publish makes `check:show` lie about WHY, `debt` drops the reason, and the console banner is not where two comments say it is |
| **#2110** `check:structure-delta` | **CONFIRMED, with three gaps** | every refusal arm exits 2 and the regression arm exits 1, all driven; a NEW authority alarm on an already-red policy, a VANISHED policy, and a transposed `--before/--after` are all silent |
| **#2166** the fence reports what it excludes | **CONFIRMED for the incident shape, with four blind spots** | the `6c983149e` shape is caught by heading/line/enclosing; four other constructible append shapes are still silently uncounted |
| **#2149** real-corpus liveness helper | **CONFIRMED** | six arms green in 24.5 s, a BLINDED copy REDS with the intended message, zero working-tree plants |
| **#2171** the empty-subject zero | **CONFIRMED** | all-vanished → `live=0 dead=[grant]`; the no-grants boundary stays `0 / []`; a real-but-clean file takes the measured path, so it is not "empty ⇒ dead" |
| **#2172** the malformed-config refusal | **CONFIRMED** | names `biome.json`, names the arm, says "NOT a verdict", V8's error on `cause` |
| **#2168** arm B's subject join | **REFUTED on today's tree** | `gate-modernization.test.ts`'s corpus arm is **RED on main**: `covered.length` = 0, the split-family door is now DEAD CODE, and the row's ledger flip never landed |

---

### #2167 — CONFIRMED, with three defects

**Holds.** Dumping every one of the 28 slots under main's `reports/runs/structure/`:

- `main-1386899` · `main-2930600` · `main-3609908` — `complete=true`, `verdict=non-verdict`, the FIXTURE-MODE
  reason verbatim. Exactly the three the commit named.
- `main-863394` — untouched: `complete=false`, `verdict` and `nonVerdictReason` **absent**. `complete` was
  not overloaded.
- The in-flight stub carries `verdict:"non-verdict"` + `"this run is IN FLIGHT …"` (two slots on disk).
- **A non-verdict never publishes**: all fifteen fixture-mode slots written AFTER `e0dcf56d8` (18:31 →
  19:40) carry `.inflight` and NO `.published`; the three pre-`#2167` ones carry `.published` and no
  `.inflight`. A clean natural before/after.

**The spelling that reaches the refusal — the brief's `check:show --slot <id>` DOES NOT EXIST:**

```
$ pnpm check:show --slot main-2930600-…   → exit 3   ARG ERROR  check:show — unknown argument "--slot"
```

`show` takes only `--errors-only|--gate|--file|--limit|--help`. The refusal is reached ONLY when the
published pointer `reports/check-structure.json` resolves to a non-verdict slot — which, since a
non-verdict never publishes, means either a pre-`#2167` artifact or `structure --void`. Driven both ways
against slot copies staged in my own worktree:

```
$ pnpm check:structure --void main-586333-… --reason "cbvi2 verifier probe: …"   → exit 0  "TOMBSTONED …"
$ pnpm check:show --errors-only                                                  → exit 2
  ✗ reports/check-structure.json is NOT a verdict about the real tree (run main-586333-…)
        ‼ cbvi2 verifier probe: tombstone reachability check
$ (pointer → main-2930600) pnpm check:show --errors-only                         → exit 2
        ‼ FIXTURE MODE (ORB_GATE_FIXTURES=1): … NOT a statement about the real tree
```

`--void` misuse arms: missing slot → **exit 3** (and mints no run slot); `--void` without `--reason` →
**exit 3**. Both correct.

**DEFECT V1 (P2, instrument lying — NEW with this commit).** A non-verdict run never calls
`publishRunSlot`, and `publishRunSlot` is the ONLY caller that unlinks `.inflight`
(`_shared/artifacts.ts:245-251`). So every fixture-mode whole-corpus run now leaves a permanent
abandoned-run marker, and `abandonedRuns()` cannot tell it from a killed run. Reproduced in my worktree
with a fixture non-verdict slot (`complete:true`) at 21:00 whose `.inflight` names a dead pid, pointer at a
real verdict from 20:02:

```
$ pnpm check:show --errors-only   → exit 2
  ✗ reports/check-structure.json is NOT a verdict for this checkout's last run (run cbvi2-H-fixture-…)
        ‼ that run never finished — it left the IN-FLIGHT stub at …/check-structure.json;
          it was killed, OOM-aborted or timed out
```

Every clause of that is FALSE: the run finished, the artifact is not the in-flight stub, and nothing was
killed. It is a false RED with a wrong cause, in the exact direction doctrine treats as an exit-2-class
event owed a quiet re-run. It bites after the barrier's planter step (`check-gates.repo.int` runs a whole
`check:structure` under `ORB_GATE_FIXTURES=1` twice) whenever anyone reads `check:show` before the next
real structure run. Fifteen such slots sit on main today. Fix shape: drop the marker at FINISH, not at
PUBLISH — or teach `abandonedRuns` that a slot holding a `complete:true` manifest is not abandoned.

**DEFECT V2 (P3).** The commit says *"check:show, debt and the delta all refuse a non-verdict loudly and
print the reason."* `debt` does neither half. Driven against a non-verdict pointer:

```
live admission: UNAVAILABLE — no consumable reports/check-structure.json
                (missing, malformed, or from a run that did not finish).
```

The reason is dropped (`ops/debt.ts:162-166` returns `null`, and `:331`'s string is fixed), and the wording
MISATTRIBUTES the cause: a non-verdict run **did** finish. `liveAdmitted`'s own doc comment at `:148`
("Null is printed as 'unavailable' WITH its reason") is now false of the code.

**DEFECT V3 (P3, §5b criterion 2).** `ops/structure.ts:496-511` writes the `‼ THIS RUN IS NOT A VERDICT`
banner AFTER `renderPass` and AFTER `renderPolicyPass` — i.e. below BOTH rosters. The comment sitting on it
says *"BEFORE the counts, not after … a reader who scrolls to the tail first must not meet the roster
before the disclaimer"*, and the commit message says *"they say so above the roster"*. Neither is true of
the code.

### #2110 — CONFIRMED, with three gaps

**Registration.** `pnpm verify --list` puts `structure:delta` in the MANUAL section only — it appears in no
`changed`/`static`/`push`/`full` tier. The "a `check` script would have been redded" half holds by
construction: `check:structure-delta` matches `verify-registry-parity`'s `VERIFY_SHAPE_RE`, is not on
`NON_STAGE_ALLOWLIST`, and the gate's arm-1 `mustFlag` pins exactly that shape
(`gates/verify-registry-parity.ts:96-104`). `pnpm check:policy-conformance` whole: **250 final policies ·
2967 proof rows · 7 refusal rows · 0 failures · 206 grant rows · 0 invalid** (47 s, exit 0), so that row
executes.

**Every arm driven** (slot copies + seven synthetic slots in my own worktree):

| arm | input | exit | observed |
| - | - | -: | - |
| regression (effective rose) | `diagnostic-legibility` 92 → 93 | **1** | `✗ 1 final polic(ies) REGRESSED` |
| ok → red via WITHHELD | `policy-fixture-substrate` `ok true→false, withheld false→true` | **1** | REGRESSED |
| gate-scoped end | `selection.kind:"check"` | **2** | "shares no denominator with a whole-corpus run" |
| DIED end | `complete:false` | **2** | "that run DIED — this is the in-flight stub (#410)" |
| non-verdict, BEFORE end | `main-2930600` | **2** | names the FIXTURE-MODE reason |
| non-verdict, AFTER end | `main-2930600` | **2** | same |
| different checkout | `checkout:"agent-deadbeef"` | **2** | "DIFFERENT CHECKOUTS (main vs agent-deadbeef)" |
| unreadable slot | `--before nope-does-not-exist` | **2** | ENOENT, names the path |
| no prior slot | `--after main-586333` with only newer/non-verdict siblings | **2** | *"'there is nothing to compare against' is not 'nothing changed'"* |
| bad flag | `--bogus` | **3** | usage |

**The named pair reproduces only PARTIALLY.** `--before main-586333 --after main-1454018`, exit 0:

```
  final policies: 248 → 250 · tool errors: 0 → 0 · withheld: 0 → 0
  diagnostic-legibility:      raw 95 → 92
  policy-fixture-substrate:   NEW → raw 0, ok true
  policy-refusal-coverage:    NEW → raw 62, ok true (severity warning)     ← as briefed
  tooling-artifact-path-home: raw 3 (g 1 · eff 2) → raw 1 (g 1 · eff 0) · ok false → true   ← as briefed
```

- **`policy-proof-expectations 23 → 0` does NOT reproduce**: it is `eff 0 / ok true` in BOTH slots. The
  `23` in that pair belongs to `caught-failure-ownership` (`eff 23 · waived 575 · ok false` in both,
  unchanged). Whatever produced "23 → 0" was a different pair.
- **"the #2196 alarm gone" is TRUE of the pair and the delta never says so**: `main-586333` carries one
  `authority.alarms` entry (`caught-failure-ownership` / `biome-rule-liveness.ts:303:3`), `main-1454018`
  carries zero — see GAP D1.

**GAP D1 (P2).** A NEW authority alarm on a policy that is ALREADY red is invisible. Planted control: take
`main-1454018` and push one alarm naming `diagnostic-legibility` (`ok:false` on findings either way):

```
$ pnpm check:structure-delta --before main-1454018 --after cbvi2-B-alarm-…   → exit 0
  final policies: 250 → 250 · tool errors: 0 → 0
  no per-policy change
```

`counts()` carries no alarm axis, and `toolErrorCount()` sums `toolErrors`/`factErrors`/`authority.toolErrors`
but **not** `authority.alarms`, so the run-level line cannot show it either. The in-code comment on
`regressed()` claims the `ok → red` test "catches … an authority alarm"; it does so only for a policy that
was previously green. A tool errors line already exists on the run-level row; an alarms count is one line.

**GAP D2 (P3).** A final policy VANISHING from the corpus exits 0. Control: delete
`diagnostic-legibility`'s row from the after slot →
`final policies: 250 → 249 … no longer present: diagnostic-legibility … no per-policy change`, exit 0.
Out of the stated contract, but a policy that stops registering is the "blinded gate reports green forever"
shape the instrument exists for.

**GAP D3 (P3).** `resolveBefore` enforces `startedAt <` only in its DEFAULT path; with both flags supplied
there is no ordering guard, so a transposed invocation silently reports the regression as an improvement:
`--before cbvi2-A-regress-… --after main-1454018` → `raw 93 → 92`, **exit 0**. Both `startedAt` values are
in hand; refusing (or flagging) is free.

### #2166 — CONFIRMED for the incident shape, with four blind spots

Driven by importing `strayLedgerSections` directly and feeding it the committed ledger plus six synthetic
variants (temp strings — the tracked ledger was never edited):

| control | strays | verdict |
| - | -: | - |
| the committed ledger (31 in-fence sections) | **0** | correct — clean baseline |
| a `###` section appended below `## CLASS ROLLUP` (the `6c983149e` shape) | **1** | **caught**: names heading, line 882, enclosing `##`, `rows=2`, cited report |
| the rollup's own three tables | **0** | correct — schemas are `[class\|rows\|CLOSED\|…]`, `[free-text class…\|rows]`, `[class\|modules affected\|state]`; `state` present, `defect` absent, exactly as claimed |
| the same rows under a bare `## cbvi2-probe-h2`, no `###` | **0** | **MISSED** |
| the same rows DIRECTLY under `## CLASS ROLLUP`, no new heading | **0** | **MISSED** |
| the same rows under a `#### ` heading | **0** | **MISSED** |
| the same `###` section with `\| Module \| Defect \| … \|` capitalised | **0** | **MISSED** |

`strayLedgerSections` only opens a `current` buffer on `line.startsWith("### ")`, and `isLedgerRowTable`
compares against the lowercase literals `"defect"`/`"state"`. So the claim "the fence REPORTS what it
excludes" is true of the shape that actually happened and false in general — four of the five other append
shapes I could construct are still silently uncounted, which is the same false-clean class the row exists
to end. The capitalisation miss is the standing spelling-shaped-blind-spot family.

Wiring is live: `pnpm check:ledgers-fresh` prints
`fresh docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md sections vs their reports (18 of 31
IN-FENCE sections reconcilable …)` — the new wording, 0 strays.

### #2149 — CONFIRMED

- `pnpm test:scoped tests/tooling/verify/gates/real-corpus-liveness-family.repo.int.test.ts` → **exit 0**,
  1 test, 24.5 s (the six arms).
- **The blinded control is mine and it REDS.** I wrote a scratch sibling
  `gates/cbvi2-blinded-windowed.ts` — `windowed-infinite-query-health` with its single
  `ctx.report.file(ANCHOR, { line: 1 })` cut — and drove `assertRealCorpusLiveness` with the family test's
  own six-overlay arm:

  ```
  AssertionError: windowed-infinite-query-health reported NOTHING for a real-corpus positive control
  (neutralise …×6) — it is silent when the tree is clean AND silent when it is broken (#2149):
  expected 0 to be greater than 0
  ```

  So the arm discriminates a live policy from a dead one; it is not green-by-silence. Both scratch files
  were `rm`'d and `git status --short` is EMPTY.
- **`neutralise` touches the overlay, never the tree.** `git status --short` was empty immediately after
  the 24.5 s six-arm run; no `__g_`/`__dc_` path was created anywhere. `captureOriginals` +
  `project.createSourceFile(..., {overwrite:true})` + `restoreOriginals` in a `finally` operate on the
  loaded ts-morph project, and `captureOriginals` THROWS when a `neutralise` path is absent from the corpus
  (which would silently turn it into an `add`) — the inversion guard is real.

### #2171 / #2172 — CONFIRMED

`judgeRuleLiveness` driven directly with four synthetic configs:

```
A malformed json           : THREW  "biome-grant-liveness rule arm: biome.json did not parse as JSON,
                                     so no grant could be read — the run is NOT a verdict."
                             cause: SyntaxError: Expected property name or '}' … position 2
B all subjects vanished    : live=0  dead=["noExplicitAny"]  filesProbed=0  filePairs=0
C no grants at all         : live=0  dead=[]                 filesProbed=0  filePairs=0
D real file, clean of `any`: live=0  dead=["noExplicitAny"]  filesProbed=1  filePairs=1
```

A names the file, the arm and "NOT a verdict" (#2172, and the position rides `cause`). B is the #2171 fix —
the old code returned `live: grants.length`. C proves the fix did not become "empty ⇒ dead"
unconditionally. D shows the MEASURED path is still separate (`filesProbed=1`), so the two zeros stay
distinct. Ordering — parse refusal before the empty-subject arm — is confirmed by A throwing rather than
returning `dead:[]`. The committed suite `tests/tooling/verify/ops/biome-rule-liveness.test.ts` passed in my
run.

### #2168 — REFUTED on today's tree

```
$ pnpm test:scoped tests/tooling/verify/gates/gate-modernization.test.ts \
    tests/tooling/verify/ops/biome-rule-liveness.test.ts \
    tests/tooling/verify/ops/ledgers-fresh.test.ts \
    tests/tooling/verify/ops/gate-scope.suite.int.test.ts        → exit 1
  Test Files  1 failed | 3 passed (4)   ·   Tests  1 failed | 65 passed (66)
  × gate-modernization.test.ts > the split-family door is ENGAGED on the real corpus, not just on fixtures
    AssertionError: no real split family exercises the door — it is fixture-only:
    expected 0 to be greater than 0   (gate-modernization.test.ts:138)
```

A scoped family test red is never baseline. Diagnosed by driving `exemptionCollections` / `coveringSibling`
over the live 304-module gate corpus:

```
corpus size 304 · covered: 0 []
no-raw-spacing-in-features    hasStaleArm=false  collections=[]   (looking for SANCTIONED_HOMES)
no-raw-typography-in-features hasStaleArm=false  collections=[]   (looking for SANCTIONED_HOMES)
serde-core-seal               hasStaleArm=false  collections=[]   (looking for SANCTIONED_DOMAINS)
```

The three real excusers the #2168 join was measured against no longer DECLARE their collections — the
`#2096` "no gate imports a gate" lanes moved them into `lib/`, and `exemptionCollections` walks the gate
module's own variable declarations:

- `3420a81e9` (12:02) — `SANCTIONED_HOMES` → `lib/raw-spacing-tier.ts` / `lib/raw-typography-tier.ts`
- `ebfe88146` (12:26) — `SANCTIONED_DOMAINS` → `lib/serde-core-seal.ts`

Ordering on `main`: `ae7a40e0b` (11:45) → `3420a81e9` (12:02) → `205224e9a` (12:06) → `e0dcf56d8` (12:10) →
`ebfe88146` (12:26). At `205224e9a`, `serde-core-seal.ts:38` still read
`export const SANCTIONED_DOMAINS = ["import", "export"] as const;` — one covered pair, arm green, so the
lane's own receipt was honest. **`ebfe88146` removed the last one and turned the arm red**, so the RED is
owned by that commit, not by `205224e9a`. The consequence for #2168 stands either way: **the split-family
door is now dead code on the corpus, kept alive only by the fixture the commit added.** The `mustFlag`
falsifier itself is fine — `gate-modernization.test.ts`'s "the gate's OWN proof rows hold, including the
split-family pair" PASSED in the same run.

Two more on this commit:

- **The ledger flip never landed.** `205224e9a` says `flipped ledger rows: cb-v-fix-wave-3 L1, L4, L5`, but
  `git show --stat 205224e9a` touches four files, none of them a ledger. All three rows still read
  `**OPEN**` on main tip today (`refutation-ledger-2026-09-12.md:560, 563, 565`). Read-first §0 ruling 5:
  "the lane that closes a row flips it in its fixing commit."
- **Its floor cites a path that did not exist at that sha.** `pnpm test:scoped
  tests/tooling/verify/gates/gate-modernization-arm-b.test.ts` — that file was renamed to
  `gate-modernization.test.ts` at `5e2b8af98`, before `205224e9a`. `git ls-tree 205224e9a` confirms only
  `gate-modernization.test.ts`. The quoted 18/18 is not reproducible as written.

### Cross-cutting: the `flipped ledger rows` line vs `git show --stat`

| commit | claim | stat | verdict |
| - | - | - | - |
| `e0dcf56d8` | flipped `caught-failure-ownership/population.json` (line 152→158, markerLine 149→155) | `population.json \| 4 +-` | **holds** |
| `ae7a40e0b` | "none … ONE clause to WHO MAINTAINS THIS, 9 lines, pure insertion, no row touched" | ledger `\| 9 +`, diff is 9 `+` lines and 0 `-` | **exact** |
| `205224e9a` | "flipped: cb-v-fix-wave-3 L1, L4, L5" | no ledger file in the diff; all three still `**OPEN**` | **FALSE** |

## WHAT I RAN

All from `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-a549e8a71071996a4`,
main tip `9e14a5d93`.

1. `pnpm exec node <scratch>` dump of all 28 slot manifests under main's `reports/runs/structure/`
   (read-only) — `complete` / `verdict` / `nonVerdictReason` / totals / slot files.
2. `pnpm check:show --errors-only` ×4 — baseline (exit 1), tombstoned slot (exit 2), fixture slot (exit 2),
   surviving-`.inflight` control (exit 2, the false "killed" claim).
3. `pnpm check:show --slot <id>` → exit 3 (`unknown argument`).
4. `pnpm check:structure --void <slot> --reason …` → exit 0; `--void` on a missing slot → exit 3;
   `--void` without `--reason` → exit 3. No run slot minted by any of them.
5. `pnpm debt` against a non-verdict pointer → exit 0, "live admission: UNAVAILABLE …".
6. `pnpm check:structure-delta` ×12 — the briefed pair plus seven synthetic slots (regression, alarm-only,
   gate-scoped, died, cross-checkout, removed policy, withheld) plus unreadable / no-prior / misuse /
   transposed.
7. `pnpm verify --list` — `structure:delta` manual-only.
8. `pnpm check:policy-conformance` whole → exit 0, 250 finals / 2967 rows / 7 refusal rows / 0 failures.
9. `pnpm check:ledgers-fresh` → exit 1 (see below), with the #2166 line `fresh … 18 of 31 IN-FENCE`.
10. `pnpm test:scoped` × the four instrument suites → 1 failed / 65 passed; the failure is the arm-B corpus
    arm.
11. `pnpm test:scoped tests/tooling/verify/gates/real-corpus-liveness-family.repo.int.test.ts` → exit 0,
    24.5 s.
12. My own blinded-policy control through `assertRealCorpusLiveness` → RED, as required.
13. Direct drives of `strayLedgerSections` (7 inputs), `judgeRuleLiveness` (4 inputs),
    `exemptionCollections`/`coveringSibling` (304-module corpus).

**A pre-existing red I did not cause and am not charging to these commits:** `pnpm check:ledgers-fresh` is
**exit 1** on main tip for two ledgers — `caught-failure-ownership/population.json` (2 moved rows in
`tooling/src/_shared/proc.ts`, from a later commit) and `gate-runtime-read-first.md`'s SIZE column
(row 2, the playbook, `77 KB → 78 KB`). The second is the playbook §4(b) rule ("any commit that changes a
PRICED document owes a SIZE regeneration immediately after it") owed by the last doc train.

## LEDGER ROWS (8 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `verify/ops/structure` + `_shared/artifacts` | cb-v-instruments-2 V1 · `tooling/src/verify/ops/structure.ts:364` + `tooling/src/_shared/artifacts.ts:245-251` | a NON-VERDICT run never calls `publishRunSlot`, and that is the ONLY caller that unlinks `.inflight` — so every fixture-mode whole-corpus run now leaves a permanent abandoned-run marker and `check:show` reports it as *"that run never finished … it was killed, OOM-aborted or timed out"*. All three clauses are false: the artifact says `complete: true`, is not the in-flight stub, and nothing was killed. NEW with `e0dcf56d8` (before it, whole-corpus fixture runs published and the publish deleted the marker); 15 such slots sit on main today | other (instrument lying — false red with a wrong cause) | **OPEN** | on-disk natural experiment: the three pre-`#2167` fixture slots carry `.published` and no `.inflight`; all fifteen post-`e0dcf56d8` fixture slots carry `.inflight` and no `.published`. Reproduced in my worktree with a `complete:true` fixture slot at 21:00 (dead pid) + pointer at a real 20:02 verdict → `pnpm check:show` exit 2 with the quoted text. Fix: unlink the marker at FINISH rather than at PUBLISH, or make `abandonedRuns` skip a slot whose manifest is `complete: true` |
| `verify/ops/debt` | cb-v-instruments-2 V2 · `tooling/src/verify/ops/debt.ts:162-166, 331` | the `#2167` refusal drops the reason and MISATTRIBUTES the cause. `e0dcf56d8` claims *"check:show, debt and the delta all refuse a non-verdict loudly and print the reason"*; `debt` prints the pre-existing fixed string *"missing, malformed, or from a run that did not finish"* — but a non-verdict run DID finish. `liveAdmitted`'s own doc at `:148` ("Null is printed as 'unavailable' WITH its reason") is now false of the code | ledger/doc staleness + unmeasured verdict | **OPEN** | `pnpm debt` against a pointer resolving to `main-2930600` prints `live admission: UNAVAILABLE — no consumable reports/check-structure.json (missing, malformed, or from a run that did not finish).` and never the FIXTURE-MODE reason. Fix: carry the reason out of `liveAdmitted` and add the non-verdict clause to the message |
| `verify/ops/structure` | cb-v-instruments-2 V3 · `tooling/src/verify/ops/structure.ts:496-505` | the `‼ THIS RUN IS NOT A VERDICT` banner is written AFTER `renderPass` and AFTER `renderPolicyPass`, i.e. BELOW both rosters — while the comment sitting on it says *"BEFORE the counts, not after … a reader who scrolls to the tail first must not meet the roster before the disclaimer"* and the commit message says *"they say so above the roster"*. §5b criterion 2: the prose is not true of the code | ledger/doc staleness | **OPEN** | read `renderConsole` at `:496-511` — the write order is roster, policy roster, banner, completeness, timing. Fix: move the write to the top of `renderConsole`, or correct both sentences |
| `verify/ops/structure-delta` | cb-v-instruments-2 D1 · `tooling/src/verify/ops/structure-delta.ts:170-198, 200-206` | a NEW authority alarm on an ALREADY-RED final policy is invisible: `counts()` carries no alarm axis, `toolErrorCount()` sums `toolErrors`/`factErrors`/`authority.toolErrors` but NOT `authority.alarms`, and `regressed()`'s `before.ok && !after.ok` cannot fire for a policy already at `ok:false`. `regressed`'s own comment claims the test "catches … an authority alarm". The briefed pair is the live case: `main-586333` carries one alarm and `main-1454018` zero, and the delta says nothing | §4.1 narrowing (unpinned) / unmeasured verdict | **OPEN** | planted control `cbvi2-B-alarm`: `main-1454018` + one `authority.alarms` entry naming `diagnostic-legibility` (`ok:false` both sides) → `pnpm check:structure-delta` prints `tool errors: 0 → 0 … no per-policy change`, **exit 0**. Fix: diff `authority.alarms.length` on the run-level line and treat a rise as a regression |
| `verify/ops/structure-delta` | cb-v-instruments-2 D2 · `tooling/src/verify/ops/structure-delta.ts:275-283` | a final policy that VANISHES between the two slots prints `no longer present: <id>` and exits 0 — never a regression. A policy that stops registering (deleted, or failing to load) is the "a blinded gate reports green forever" shape, and this instrument exists to surface exactly what the mixed-runtime exit code cannot | other (unmeasured verdict) | **OPEN** | planted control `cbvi2-F-removed` (the `diagnostic-legibility` row deleted from the after slot) → `final policies: 250 → 249 · no longer present: diagnostic-legibility · no per-policy change`, **exit 0**. Fix: exit 1 on a removal, or state in the usage why a removal is not one |
| `verify/ops/structure-delta` | cb-v-instruments-2 D3 · `tooling/src/verify/ops/structure-delta.ts:128-148` | `resolveBefore` enforces `run.startedAt < afterStart` only on the DEFAULT path; with both `--before` and `--after` supplied there is no ordering guard, so a transposed invocation reports a regression as an improvement and exits 0. Both `startedAt` values are already in hand | other (unmeasured verdict) | **OPEN** | `--before cbvi2-A-regress-… --after main-1454018` (the regressed slot as BEFORE) → `diagnostic-legibility: raw 93 → 92`, **exit 0**, no warning. Fix: refuse (or warn) when `before.startedAt >= after.startedAt` |
| `verify/lib/gate-program-docs` | cb-v-instruments-2 L1 · `tooling/src/verify/lib/gate-program-docs.ts:171-176, 216-244` | the `#2166` stray scanner catches the shape that happened and four others it does not: it opens a section buffer ONLY on `line.startsWith("### ")`, and `isLedgerRowTable` compares against the lowercase literals `"defect"`/`"state"`. So ledger rows appended under a bare `##`, appended with no heading at all, appended under a `####`, or written with capitalised column names are ALL silently uncounted — the same false-clean class the row was filed to end, and the capitalisation half is the standing spelling-shaped blind spot | §4.1 narrowing (unpinned) | **OPEN** | direct drive of `strayLedgerSections` over the committed ledger plus six variants: committed → 0 (correct); `###` below the rollup → 1 (caught, names heading/line/enclosing); bare `##` → 0; no heading → 0; `####` → 0; `\| Module \| Defect \| … \|` → 0. Fix: buffer any heading depth ≥ 3 and the region under a non-fence `##`, and case-fold the schema comparison |
| `gate-modernization` | cb-v-instruments-2 M1 · `tests/tooling/verify/gates/gate-modernization.test.ts:138` | **RED on `main` today**: "the split-family door is ENGAGED on the real corpus, not just on fixtures" fails with `covered.length` 0. The `#2096` lane moved all three real excusers' collections into `lib/` (`3420a81e9` for `SANCTIONED_HOMES`, `ebfe88146` for `SANCTIONED_DOMAINS`), and `exemptionCollections` walks the GATE module's own variable declarations — so `#2093`'s split-family door and `#2168`'s subject join are now dead code held alive only by their fixtures. The red is owned by `ebfe88146` (at `205224e9a`, `serde-core-seal` still declared its table locally, so that lane's 18/18 was honest). Separately, `205224e9a`'s `flipped ledger rows: cb-v-fix-wave-3 L1, L4, L5` touched NO ledger and all three still read **OPEN**; and its floor cites `gate-modernization-arm-b.test.ts`, renamed away at `5e2b8af98` before that commit | other (dead enforcement + ledger staleness) | **OPEN** | `pnpm test:scoped tests/tooling/verify/gates/gate-modernization.test.ts` → `expected 0 to be greater than 0`, corpus 304. Direct drive: `covered: 0 []`; per pair `hasStaleArm=false, collections=[]`. `git ls-tree 205224e9a` shows only `gate-modernization.test.ts`; `refutation-ledger-2026-09-12.md:560,563,565` all `**OPEN**`. Fix: teach `exemptionCollections` (and the door) to follow a collection into `lib/`, or retire the door and its fixture together — never leave the test asserting a property nothing on the tree has |

## WHAT I DID NOT COVER

- **`pnpm check:structure` was NOT run** (the brief withheld it and I did not ask, because no claim I
  checked needed a fresh whole-tree pass). So: the real-tree finding delta of these three commits, the
  `N tool error(s)` / `N withheld` tail, and the LIVE production of a `verdict: "verdict"` stamp by an
  actual run are UNMEASURED by me. I read the stamps off slots main's own runs published, and I drove the
  writer only through `--void`.
- **The CONTAMINATION arm of `nonVerdictReason` is code-read only.** I confirmed
  `nonVerdictReason(fixtureMode, observed)` and `keepProbeFindings()` (`ORB_GATE_FIXTURES === "1"`), and the
  fixture branch end to end, but I never produced a run that OBSERVED a planter's paths — that needs a
  planter beside a structure run, which is orchestrator-only.
- **No planting suite was run** (`check-gates`, `gate-ignore-grammar`, `gate-conformance`,
  `gate-spelling-twins`) — per the brief. So the coupled-site question "does anything else read
  `run.verdict`" is answered only by a source read of the three readers the commit names.
- **The two deferred `analysis: "types"` liveness arms** (`persist-partialize-and-total-migrate`,
  `section-factory-contribution-bundle`) — I did not attempt them; I accepted the commit's measured
  24 s → 46 s timeout account without re-running it.
- **The #2168 fixture direction beyond the committed rows.** I confirmed the `mustFlag` falsifier passes
  and that the corpus arm is dead, but I did not construct an in-memory sibling pair to re-measure
  "a sibling naming a DIFFERENT collection is accused" independently of the committed fixture — the corpus
  no longer holds a pair to drive it against.
- **`gate-scope.suite.int`, `show.int`, `structure.int`, `structure-mixed.suite`, `cli.int`,
  `warning-promotion.suite`, `run.int`, `stage-budget`, `resource-layout-wave-3`** — of `e0dcf56d8`'s named
  floor I re-ran only `gate-scope.suite.int` (green, inside the four-file run). The rest are unverified by
  me.
- **`ledgers:fresh`'s other six ledgers** — I read the run's output but re-derived none of them myself.
