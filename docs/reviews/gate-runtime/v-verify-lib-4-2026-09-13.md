---
kind: review
status: active
updated: 2026-09-13
---

# cb-v-verify-lib-4 — the seven Verify rows of `cb-x-verify-lib-fixes`, re-derived

## 1. Base

- Base sha: `cce850dc1da47fb08ccaf49748096d64e6464dbb` (main tip at dispatch; `git status --short` EMPTY on entry).
- Worktree root: `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-a50f3c4fd16ab4cc2`.
- Subject commits: `509d1d56a` (#2249 #2250 #2232 #2233 #2234 #2195), `c30c4c9c2` (#2268), `fdc708323` = `b44d9ffa6` (#2275).
- Every receipt below is run output produced in THIS session. No real tracked file was modified; every probe
  was a `cb-v-verify-lib-4-*` SIBLING scratch module (§4.1's own "never mutate the real file" rule), all
  deleted — final `git status --short` is the report alone.

| row | verdict |
| - | - |
| #2249 | **CONFIRMED** |
| #2250 | **CONFIRMED** |
| #2232 | **REFUTED** |
| #2233 | **PARTIAL** |
| #2234 | **CONFIRMED** |
| #2195 | **CONFIRMED** (one new defect in the verb) |
| #2268 | **CONFIRMED** |
| #2275 | **CONFIRMED** |

## 2. Per-row verdicts

### #2249 — `gate-modernization` ARM E — CONFIRMED

Driven through `verifyGateProofs` with a per-spelling `mustFlag` row over a sibling scratch copy of the
PRE-FIX module (`git show 509d1d56a^:…` → `gates/cb-v-verify-lib-4-gm-prefix.ts`) and the TIP module:

```
ARM E TABLE
CONTROL dotted ctx.node.getType()    before=true after=true
element access                       before=false after=true
optional element access              before=false after=true
destructure                          before=false after=true
renamed destructure                  before=false after=true
bind handoff                         before=false after=true
one lib/ import hop                  before=false after=true
NEGATIVE before=false after=false
```

All five claimed spellings (six rows: the destructure carries its renamed twin) are CLEAN before and FLAG
after; the dotted control flags on both sides and the `getText()` negative control never flags. The arm
matching a member POSITION rather than an invocation is what makes `.bind` nameable, and it is proven by the
handoff row rather than argued.

**The hop-narrowing cut kills exactly the row the lane says dies** — `sed 's/used\.has(local) && /local.length >= 0 \&\& /'`
into a sibling (`cb-v-verify-lib-4-gm-cut.ts`; anchor asserted to occur EXACTLY ONCE, `grep -c` → 1):

```
HOP-NARROWING CUT failures=1
[{"gate":"gate-modernization","arm":"mustPass","why":"ARM E HOP NARROWING (#2249) …","detail":"expected NO finding but got 1: "}]
```

So the repaired fixture DOES reach the fence — the lane's first-draft false clean (an unenforced FIXTURE,
not an unenforced fence, §4.1) is genuinely repaired, not re-declared.

**Proof set and real tree, through the gate's own `run`:**

```
PROOF ROWS mustFlag=28 mustPass=20
verifyGateProofs failures=0 []
REAL TREE findings=4
tooling/src/verify/gates/contract-banned-shapes.ts:158
tooling/src/verify/gates/detached-work-traced-health.ts:58
tooling/src/verify/gates/vector-scope-derived.ts:42
tooling/src/verify/gates/windowed-infinite-query.ts:175
toolErrors=[]
```

4 at tip = 3 ARM E + 1 ARM B, which is the brief's "5 before #2268, 4 after" with `ALLOWED_ROOTS` removed.
Each named. **The three ARM E findings are TRUE POSITIVES, chains READ:** all three declare
`analysis: "syntax"` (`detached-work-traced-health.ts:64`, `windowed-infinite-query.ts:181`,
`contract-banned-shapes.ts:172`); `lib/detached-work.ts#staticStringValue:70` is
`node.getType().getLiteralValue()` and `:90` is `value.getSymbol()`; `lib/reference-fact.ts:208` is
`lexicalReferenceSymbol(current)?.getAliasedSymbol()`. Leaving them unfixed and uncarved (#2256) is correct —
`gate-modernization` was already red on the tree, so no verdict class moved.

`tests/tooling/verify/gates/gate-modernization.test.ts` → exit 0, **3 tests** (the lane's floor says "4 passed";
see ledger row L8).

### #2250 — `lib/policy-pass-context.ts` fact-widening remedy — CONFIRMED

Shipped pin: `pnpm test:scoped tests/tooling/verify/lib/policy-pass-context.test.ts` → **exit 0, 4 passed**.

RED-FIRST reproduced independently against a sibling copy of the PRE-FIX module
(`cb-v-verify-lib-4-ppc-prefix.ts`, the same 4 rows re-pointed at it) → **exit 1, 2 failed | 2 passed**,
with the full message read off each door:

```
× ctx.sourceFile's fact-widening remedy names ctx.sourceFile …
× ctx.report.file's fact-widening remedy names ctx.report.file
✓ ctx.relativePath keeps the #1976 wording byte-for-byte
✓ a path NO declared fact admits refuses BARE on every door
Received: "sourceFile path is absent or outside the effective population: packages/server/src/wide.ts; … never with ctx.relativePath."
Received: "finding file is outside the effective population: packages/server/src/wide.ts; … never with ctx.relativePath."
```

Exactly the claimed 2-failed/2-passed asymmetry, and the two passing rows are real controls: the
`relativePath` arm's wording is asserted verbatim (so the fix cannot have been "delete the clause") and a path
no declared fact admits still refuses BARE on all three doors.

### #2232 — the scoped node door — REFUTED

Two independent failures. Instrument first: my plant is LIVE — `tests/support/browser/cb-v-verify-lib-4-broken-dom.ts`
(one unterminated object literal) reds a run whose selection is `types-browser`:

```
pnpm test:scoped tests/ui/primitives/input/index.dom.test-d.ts   → EXIT 1
 ✓ |types-browser|  TS  tests/ui/primitives/input/index.dom.test-d.ts (3 tests)
 ❯ tests/support/browser/cb-v-verify-lib-4-broken-dom.ts:2:1   ·  Test Files 1 passed  ·  Type Errors no errors
```

**(a) The FOUNDING CASE IS STILL BROKEN AT TIP.** `tests/tooling/doc-catalog` is a MIXED operand (it holds
`contract/types.test-d.ts` beside its runtime tests), so `nodeConfigModeArgs` returns `[]`, the root config is
used, and both typecheck projects ride. Plant moved to `tests/tooling/cb-v-verify-lib-4-broken-node.ts`
(inside `tsconfig.json`'s program; `tests/support/browser` is EXCLUDED there, so the two plants are
discriminating), POST-FIX:

```
pnpm test:scoped tests/tooling/doc-catalog   → EXIT 1
 ❯ tests/tooling/cb-v-verify-lib-4-broken-node.ts:2:1
 Test Files  9 passed (9) · Tests 70 passed (70) · Type Errors no errors · typecheck 891ms
```

That is the exact command and the exact symptom #2229 measured — 70 green tests, exit 1, a red verdict about
a file the caller never named. Every lane's directory-operand floor spelling is in this arm.

**(b) THE LANE'S ONE DISCRIMINATING RECEIPT DOES NOT REPRODUCE.** The report claims *"HEAD: exit 1, Tests 1
passed, typecheck 6.70s — a node type claim reddened by a parse error in the BROWSER program"*. Driving the
EXACT pre-fix `spawnNode` argv with the browser plant live:

```
pnpm exec node scripts/vitest-supervised.mjs run tests/tooling/client-pure-doors.test-d.ts --reporter=default --reporter=json
  → EXIT 0 · Test Files 1 passed · Type Errors no errors · typecheck 6.48s
  (two "Testing types with tsc" lines: types-browser is INSTANTIATED and never runs the checker, because
   zero files matched it — the same mechanism the lane itself identified for the runtime arm)
```

and post-fix the same operand is also exit 0. So the before/after pair the fix rests on is exit 0 / exit 0.
The lane's REFUTATION of the brief's other half is CONFIRMED (a runtime operand pays nothing and cannot be
reddened: pre-fix argv on `tests/tooling/smoke.test.ts` with the node plant → **exit 0, 146 ms**). Measured
benefit at tip for a runtime operand: the typecheck projects are no longer instantiated (2 → 0 "Testing types"
lines) and the wall clock is unchanged (146 ms pre-fix → 168 ms post-fix).

**(c) A NEW REGRESSION on the operand-less arm.** `preflight` returns `{ projects: [] }` without collecting
when there are no path operands, so `--runtime-only` is injected beside a caller's own project filter:

```
pnpm test:scoped --project=types-node -t "cb-v-verify-lib-4-nomatch"   → EXIT 1
Startup Error: No projects matched the filter "types-node".
```

Loud, not silent — but that invocation ran before the fix and cannot run now.

FIX SPEC: the MIXED arm must narrow to the UNION of the attributed projects
(`--project=<each collected name>`), which drops nothing the caller claimed and excludes the unclaimed
typecheck project — that is the only arm that answers the row. The operand-less arm must not inject
`--runtime-only` when `rest` already carries a `--project`/`--project=` argument. The committed pin's
red-first paragraph and the UNIFIED sentence must be rewritten to what the tree measures (rows L3–L5).

### #2233 — `gate-spelling-twins.int.test.ts:40` — PARTIAL

The suite was READ, never run (orchestrator-only planter).

**The row's own fix is CORRECT.** `tooling/src/verify/gates/owner-scoped-writes.ts` lines **320–329** are a
`mustPass` row (`mustPass:` opens at `:309`; the row's braces are 320 and 329) whose `why` at `:328` reads
verbatim *"cut it and no mustFlag row moves, while this row reds"*, and the fixture is the namespace-spelled,
correctly-scoped write. The corrected comment names the right file, the right arm and the right coordinates.

**But the SAME hunk added a NEW false claim to the same comment**, which is the class the row exists to fix:

> `tests/tooling/gate-spelling-twins.int.test.ts:48` — *"THIS SUITE IS LEGACY BY REQUIREMENT AND RETIRES AT
> THE #1584 CUTOVER … **It calls `loadGates()`, which returns `corpus.legacy` ALONE**, so every conversion
> SHRINKS its subject … delete it with the legacy loader."*

The suite calls `loadMixedGateCorpus(ROOT)` at `:100` — `loadGates` appears in this file only inside prose
(`grep -n 'loadGates\|loadMixedGateCorpus'` → `:11`, `:21`, `:49` prose; `:70` and `:100` the real import and
call) — and `ops/spelling-twin-blindness.ts#spellingTwinCensus` walks BOTH halves (`:190` `corpus.legacy`,
`:202` `corpus.final`). The file's OWN header at `:10-23` records the #2031 repair that retired exactly this
premise and concludes *"At the cutover the legacy loop simply finds an empty list and this control keeps its
subject"* — the new paragraph 26 lines below contradicts it and re-asserts the retired claim.

Secondary: the new paragraph was inserted BETWEEN the two bullets of the `SHRINK RECEIPTS` list, orphaning the
`owner-scoped-upserts` bullet from its list header.

FIX SPEC: delete or rewrite `:48-51` to say what the file's header already says (the census drives BOTH
engines, the LEGACY loop empties at the cutover and the control keeps its subject), and move whatever survives
BELOW the `owner-scoped-upserts` bullet so the list stays contiguous.

### #2234 — legacy `runPass`'s two-term `ok` — CONFIRMED

Shipped pin: `pnpm test:scoped tests/tooling/verify/lib/pass.test.ts` → exit 0, 6 passed.

Independent red-first + control, driven against a sibling copy of the PRE-FIX `lib/pass.ts`
(`cb-v-verify-lib-4-pass-prefix.ts`, which still carries `ok: findings.length === 0` at its `:404`/`:443`)
and the TIP module in the SAME file — 6 rows, all passing:

```
✓ PRE-FIX pass.ts: a throwing gate comes back ok:true with an empty finding list (the defect)
✓ TIP pass.ts: the same gate is ok:false, with the failure named in toolErrors
✓ TIP pass.ts CONTROL: a healthy silent gate stays ok:true
✓ TIP pass.ts: a THROW in the begin phase is also caught by the two-term verdict
✓ TIP pass.ts: a THROW in finalize is also caught
✓ TIP pass.ts: a sibling's break does not touch a healthy gate's verdict  → {healthy-probe: true, reader-probe: false}
```

So the pre-fix false clean is reproduced, the fix holds, the healthy control is not reddened, attribution is
per-gate-name, and the verdict additionally covers the `begin` and `finalize` phases (which the lane did not
claim). Coupled sites swept with `ast-grep -p '$X.ok'` over `tooling/src/verify`: the only `GatePassResult.ok`
readers are `lib/render.ts:106` and `lib/population.ts:33`, both named. `ops/structure.ts:83` recomputes
`ok: violations.length === 0` into the ARTIFACT and is genuinely still one-term (ledger row L6) — the lane
flagged it rather than silently leaving it.

### #2195 — `pnpm check:ledger-claims` — CONFIRMED (with one new defect)

All arms driven on the CURRENT ledger (`205 ledger row id(s)` on every run — the subject is printed, so no
zero is bare):

| drive | exit | output |
| - | -: | - |
| `--since b5490a02a~1 --until b5490a02a` (founding case) | **1** | `RED  b5490a02a852… claims "flipped ledger rows: cb-v-authority-census C1 (list-row-adoption, …" and touched NO hunk of docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` |
| `--since ac9be2e8a~1 --until ac9be2e8a` (acquitting control) | **0** | `1 commit(s) … 205 ledger row id(s)` |
| no `--since` (misuse) | **3** | `ARG ERROR ledger-claims needs --since <rev>` + the usage block |
| `--since 509d1d56a~1 --until b44d9ffa6` (arm b, current ledger) | **1** | `RED  b44d9ffa69… owes ledger row #2275, which exists as no row in …` |
| `--since HEAD~300` | 1 | 50 RED + 27 `report` lines over 304 commits — arm (c) prints and does not red |
| `--since cce850dc1` (= `merge-base(main,HEAD)`) | **0** | `0 commit(s)` — the default base that measures nothing |
| `--since origin/main` | **2** | `TOOL ERROR git log origin/main..HEAD failed (status null)` |

Arm (b) is live on today's ledger and CAUGHT A REAL GAP: `#2275` has **zero** ledger rows
(`/usr/bin/grep -ac '^|.*#2275\b'` → 0; positive controls `#2214` → 1, `#2249` → 3, `#2268` → 1), so
`b44d9ffa6`'s own `ledger rows OWED: #2275` is an unhonoured claim (row L7). The #2201/#2203 case the lane
cites now exits **0** — the ledger grew and both ids resolve — which is why the default base was refused for
its shape, not for that instance.

Pins: `tests/tooling/verify/ops/ledger-claims.test.ts` → **exit 0, 14 tests**. Manual registry row present and
discoverable: `pnpm verify --list` prints `structure:ledger-claims — the BARRIER check on …` (exit 0). Both
constructible default bases refuse as claimed.

**NEW DEFECT (row L2).** `origin/main..HEAD` exits 2 not because git failed but because `gitLog` passes no
`maxBuffer`, so `spawnSync`'s 1 MiB default truncates and returns `status: null`. Measured boundary:
`HEAD~450..HEAD` = **1,023,170 B** → judged fine (exit 1, 457 commits); `origin/main..HEAD` = **1,457,840 B**
→ exit 2, `status null`. The message blames git for what is a buffer ceiling.

### #2268 — `list-row-adoption`'s vocabulary set — CONFIRMED

Corpus drive with the gate's OWN exported predicates over the real gates directory:

```
CORPUS modules=303 accused=["vector-scope-derived.ts::IMPORT_SANCTIONED"]
list-row-adoption BEFORE=["ALLOWED_ROOTS"] AFTER=[]
own-tables-only collections=["FILE_ALLOWLIST"] hasStaleArm=true
```

2 → 1 confirmed, and the PREMISE CORRECTION is right on both halves: the surviving accusation is
`vector-scope-derived::IMPORT_SANCTIONED`, and `own-tables-only` carries a `FILE_ALLOWLIST` and is NOT accused
because it carries a stale-arm string.

**The discriminating receipt reproduces.** Cutting `ALLOW` out of arm B's name vocabulary in a sibling scratch
(`sed 's#/ALLOW|WHITELIST#/WHITELIST#'`, anchor `grep -c` → 1) takes `verifyGateProofs(gate-modernization)`
**0 → 2 failures**, both `expected a finding (token="ALLOWLIST") but got 0` — the arm's FOUNDING one-sided-allowlist
row and the #2219 inverted-carve tripwire. So the module's SPELLING was the right side; the ruling survives and
its input changed.

`ROW_ROOT_NAMES` is `new Set(["ListRow", "LibraryRow"])` — a composite-root vocabulary with no per-file rows,
so the reclassification is correct rather than a rename-to-dodge. Literal sweep for the removed name across the
whole tree (`/usr/bin/grep -rn 'ALLOWED_ROOTS'`): 12 hits, ALL prose/past-tense records (the module's own
header, the family test's measured comment, three review docs, the ledger). **No live code or fixture reference
survives.**

### #2275 — the two `lib/` comment reflows — CONFIRMED

- `pnpm exec eslint tooling/src/verify/lib/bus-fact.ts tooling/src/verify/lib/tuple-vocabulary-fact.ts` →
  **EXIT 0**, no diagnostics.
- **Planted positive control** (the zero is measured, not assumed): the PRE-FIX contents copied to
  `tooling/src/verify/lib/cb-v-verify-lib-4-old-{busfact,tuple}.ts` — same path family, same rule config —
  → **EXIT 1, `✖ 7 problems (7 errors, 0 warnings)`**, the same 7 diagnostics at `62:74`, `62:87`, `63:15`,
  `63:82`, `131:86`, `131:96`, `132:5`.
- Comment-only: every changed line in `git show fdc708323` on both files begins ` *` —
  non-comment changed lines = **0**.
- Prose survived: word streams normalised for backticks and whitespace are IDENTICAL on both files
  (`bus-fact WORD STREAM IDENTICAL` / `tuple-vocab WORD STREAM IDENTICAL`).
- `pnpm lint:eslint` whole was NOT run (brief fence).

Independent floor over the whole tree state: `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json`
→ **exit 0, PASS both** (`11 discovered, 2 runnable`).

## LEDGER ROWS (9 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `gate-spelling-twins` | cb-v-verify-lib-4 · `tests/tooling/gate-spelling-twins.int.test.ts:48-51` | The paragraph `509d1d56a` added says the suite *"calls `loadGates()`, which returns `corpus.legacy` ALONE"* and *"retires at the #1584 cutover … delete it with the legacy loader"*. The suite calls `loadMixedGateCorpus(ROOT)` at `:100` and the census walks BOTH halves; the file's own header at `:10-23` records the #2031 repair that retired exactly that premise and says the control KEEPS its subject at the cutover. A comment-honesty fix shipped a new false comment in the same hunk. Secondary: the paragraph landed BETWEEN the two `SHRINK RECEIPTS` bullets, orphaning the `owner-scoped-upserts` bullet | false comment (§5b criterion 2) — the class the row was closing | **OPEN** | `grep -n 'loadGates\|loadMixedGateCorpus' <file>` → prose `:11 :21 :49`, real import `:70`, real call `:100`; `ops/spelling-twin-blindness.ts:190` `corpus.legacy` + `:202` `corpus.final` |
| `ledger-claims` | cb-v-verify-lib-4 · `tooling/src/verify/ops/ledger-claims.ts` (`gitLog`) | `runNicedSync` is called with no `maxBuffer`, so `spawnSync`'s 1 MiB default truncates any large range and returns `status: null`; the refusal then reads `git log … failed (status null)`, blaming git for a buffer ceiling. A barrier verb whose whole subject is an operator-stated range silently caps at ~380–460 commits | refusal message names the wrong cause + unbounded-input ceiling | **OPEN** | `--since HEAD~450` (output 1,023,170 B) → exit 1, 457 commits judged; `--since origin/main` (output 1,457,840 B) → exit 2 `TOOL ERROR git log origin/main..HEAD failed (status null)` while `git rev-parse origin/main` resolves and `rev-list --count` = 841 |
| `scoped-test` | cb-v-verify-lib-4 · `tooling/src/verify/ops/scoped-test.ts` (`nodeConfigModeArgs`, MIXED arm) | The MIXED arm emits NEITHER flag, so a DIRECTORY operand holding one `.test-d.ts` still runs the root config with both typecheck projects — the #2229 founding case is unfixed at tip. Narrowing to the UNION of the attributed project names drops nothing the caller claimed | incomplete fix — the row's own founding case still reproduces | **OPEN** | plant `tests/tooling/cb-v-verify-lib-4-broken-node.ts` (in `tsconfig.json`, not in `tsconfig.tests-dom.json`); `pnpm test:scoped tests/tooling/doc-catalog` → **exit 1**, `Test Files 9 passed (9) · Tests 70 passed (70) · Type Errors no errors`, `❯ tests/tooling/cb-v-verify-lib-4-broken-node.ts:2:1` |
| `scoped-test` | cb-v-verify-lib-4 · `tests/tooling/verify/ops/scoped-test.test.ts:12-16` | The committed pin's RED-FIRST paragraph claims receipt 2 — *"with a PLANTED parse error … inside `tsconfig.json`'s program, `pnpm test:scoped tests/tooling/smoke.test.ts` exited 1 with `Test Files 1 passed (1)`"* — which is false on the tree AND contradicted by the lane's own report ("that half of the mechanism is REFUTED"). Receipt 1's *"the typecheck projects ran"* is also false: they are instantiated and never run the checker | false red-first receipt baked into a committed test's header | **OPEN** | same plant, pre-fix argv `pnpm exec node scripts/vitest-supervised.mjs run tests/tooling/smoke.test.ts --reporter=default` → **exit 0**, `Duration 146ms`, no typecheck |
| UNIFIED-VERIFICATION-DESIGN | cb-v-verify-lib-4 · `docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md` §tests | The added sentence says *"every scoped node run carried the typecheck projects, so a parse error anywhere in the `tsconfig.json` or `tsconfig.tests-dom.json` program exited the run 1 with every named test green (measured: a `.test-d.ts` claim reddened by a planted parse error in the BROWSER program)"*. The parenthetical does not reproduce, and "every scoped node run" is false for a pure-runtime operand. Law-tier doc now carries an unreproducible measurement | false measured claim in law | **OPEN** | exact pre-fix `spawnNode` argv on `tests/tooling/client-pure-doors.test-d.ts` with the browser plant LIVE (plant proven live: `pnpm test:scoped tests/ui/primitives/input/index.dom.test-d.ts` → exit 1 naming it) → **exit 0**, `Type Errors no errors`, `typecheck 6.48s` |
| `structure` | cb-v-verify-lib-4 · `tooling/src/verify/ops/structure.ts:83` | `toLegacyRows` writes the per-gate artifact row as `ok: violations.length === 0`, so `reports/check-structure.json` STILL reports `ok: true` for a gate whose phase threw — #2234 one file over, in the artifact every downstream harness reads. The run-level `ok` at `:345` is safe (`!legacyBroken`), so the exit code is unaffected | the fixed defect's uncovered twin | **OPEN** (lane FLAGGED it) | `sed -n '79,84p' ops/structure.ts`; `ast-grep -p '$X.ok'` over `tooling/src/verify` — the only other `GatePassResult.ok` readers are `lib/render.ts:106` and `lib/population.ts:33`, both repaired |
| ledger hygiene | cb-v-verify-lib-4 · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` | `b44d9ffa6` states `ledger rows OWED: #2275` and `#2275` exists as no row in the ledger — the new verb's own arm (b) reds on the commit that shipped alongside it | an OWED id nothing filed | **OPEN** | `pnpm check:ledger-claims --since 509d1d56a~1 --until b44d9ffa6` → exit 1, `RED  b44d9ffa69… owes ledger row #2275, which exists as no row in …`; `/usr/bin/grep -ac '^\|.*#2275\b'` → 0 against positive control `#2214` → 1 |
| receipts | cb-v-verify-lib-4 · `docs/reviews/gate-runtime/x-verify-lib-fixes-2026-09-13.md` | Three receipt statements are wrong: (1) `scoped-test.int.test.ts` is **10** rows, reported as 11; (2) `gate-modernization.test.ts` is **3** tests, reported as "4 passed"; (3) the Deviations bullet says the five `\~`→`~` formatter conversions in untouched context were "deliberately REVERTED … none is mine" — `509d1d56a` SHIPPED three of them, two in sections unrelated to #2232 (the exact multi-lane rebase hazard the standing facts name) | receipt inaccuracy + an untouched-context format diff shipped against its own stated deviation | **OPEN** | `pnpm test:scoped …/scoped-test.test.ts …/scoped-test.int.test.ts` → `6 tests` + `10 tests`; `gate-modernization.test.ts` → `3 tests`; `git show 509d1d56a --unified=0 -- <the doc> \| grep -c '^-.*\\~'` → **3** (`\~10 hours`, `(\~1s,`, `(\~1s)`) |
| `lib/bus-fact.ts` · `lib/tuple-vocabulary-fact.ts` | appended at landing by the orchestrator (cb-v-verify-lib-4 row 7 named the missing row) · `bus-fact.ts:62-63` · `tuple-vocabulary-fact.ts:131-132` | `pnpm lint:eslint` was EXIT 1 on seven `tsdoc/syntax` errors in two files: a code span WRAPPED across two comment lines (TSDoc has no form for it, so `<unresolved identities>` parsed as an HTML tag — one defect reported four times) and three population roots read as TSDoc tags; a REGRESSION after the #472 zero-suppression sweep armed the rule so the zero could not rot, unenforced because the bypassed hooks were its only runner (the #2266 class) | lint red under the bypass | **CLOSED** — `fdc708323` (board #2275): both files reflowed, comment-only, scoped eslint 7 → 0; the whole-repo receipt died on a tool error (#2281) and the row closed on the scoped receipt | `pnpm exec eslint <both files>` EXIT 0; `git show fdc708323` zero non-comment changed lines |

ledger rows OWED: 9

## WHAT I DID NOT COVER

- `pnpm check`, `pnpm verify`, `pnpm check:structure`, `pnpm lint:eslint` whole, and the four planting suites —
  all brief-fenced. No structure leg was requested or run, so **no whole-corpus policy verdict is in this report**;
  every gate number here comes from the gate's own `run`/`verifyGateProofs`, never from a structure slot.
- `pnpm check:policy-conformance` WHOLE (the lane's 250/2985/0 receipt) — not re-run; my gate drives are
  per-module and do not substitute for it.
- `gate-spelling-twins.int` was READ, never executed (planter). Its baseline row keys the MODULE name, which
  \#2268 did not change; that is reasoning, not a receipt.
- The three ARM E true positives were verified as CHAINS to a checker call, not as a claim about whether each
  module's `analysis` value SHOULD flip — that is #2256's question.
- `--related`'s unconditional `--runtime-only`: read and reasoned about, not driven (a `related` run over a
  source file is expensive and the arm is orchestrator-ruled).
- Board state: I did not read or mutate Project 1; `#2256` is cited from the lane's report, not verified.
- The `ledger-claims` maxBuffer defect was diagnosed by byte-boundary bracketing, not by reading a captured
  `ENOBUFS` error object.

## PROPOSED LESSONS

**Index entry:** `- [comment fix adds a comment](comment-honesty-fix-adds-its-own-false-comment.md) — a §5b criterion-2 repair that ships a NEW claim in the same hunk owes that claim the same tree read`

Body: a lane fixing a FALSE COMMENT is in the one frame of mind where a new sentence feels free — it has just
read the code, so the next paragraph "obviously" follows. #2233's one-line correction was right and the same
hunk added a paragraph asserting the suite calls `loadGates()` and retires at the cutover; the suite calls
`loadMixedGateCorpus` and the file's OWN header 26 lines above records the repair that retired that premise.
**Every sentence added beside a comment fix is a claim under the same rule as the one being fixed** — grep the
file for the symbol you just named before you write the sentence, and read the header you are writing under.

**Index entry:** `- [instantiated ≠ ran](vitest-typecheck-project-instantiates-without-running.md) — a vitest typecheck project with zero matched files prints its banner and never runs tsc`

Body: `vitest run <a node .test-d.ts>` against the root config prints *"Testing types with tsc and vue-tsc is an
experimental feature"* TWICE — both `types-node` and `types-browser` are instantiated — while only the project
with matched files runs the checker. So a planted parse error in the OTHER program's exclusive files cannot red
that run, and `Type Errors  no errors` in the summary says nothing about whether a checker ran at all. Measured
2026-09-13: pre-fix argv, browser-program plant live, exit 0 / `typecheck 6.48s`; the same plant reds a run
whose operand IS a `.dom.test-d.ts`. **A cost or blast-radius claim about vitest typecheck projects must name
the OPERAND's project attribution, and the discriminating plant must live in a program the selected project
actually owns.**

**Index entry:** `- [barrier verb range ceiling](spawnsync-1mib-default-caps-a-git-log-verb.md) — `runNicedSync`with no`maxBuffer`turns a large`git log` into "failed (status null)"`

Body: `spawnSync`'s default `maxBuffer` is 1 MiB and a truncated child returns `status: null`, so any tool that
shells `git log --format=… --name-only` over a long range reports a TOOL ERROR that blames git. Measured on
`ledger-claims`: 1,023,170 B of output judged fine, 1,457,840 B exited 2 with `git log origin/main..HEAD failed
(status null)`. `RunNicedSyncOptions` already carries `maxBuffer` — pass it, and when `status === null` say
"produced no exit status (truncated output or killed)" rather than naming the child as the failure.

## Issue summaries (≤500 chars each)

**#2249** — CONFIRMED. Reproduced on a sibling copy of the pre-fix module: all five spellings (element access,
its optional twin, destructure + renamed, `.bind`, one `lib/` hop) CLEAN before / FLAG after, dotted control
flags both sides, `getText()` never flags. Cutting `used.has(local) &&` kills exactly the hop-narrowing
`mustPass` (`expected NO finding but got 1`), so the repaired fixture reaches the fence. 28+20 rows, 0 failures;
real tree 4 findings, the 3 ARM E ones read as true positives to a checker call.

**#2250** — CONFIRMED. Shipped pin exit 0 / 4 passed. Red-first reproduced against a sibling pre-fix module:
exit 1, 2 failed | 2 passed, both failures showing `… never with ctx.relativePath.` on the `sourceFile` and
`report.file` doors. The two passing rows are real controls — the `relativePath` wording is asserted verbatim
and a path no declared fact admits still refuses BARE on all three doors, so the fix cannot have been a
deletion of the remedy clause.

**#2232** — REFUTED. The founding case still reproduces at tip: `pnpm test:scoped tests/tooling/doc-catalog`
(a MIXED operand) exits 1 on a planted parse error in an unrelated `tsconfig.json` file with 70 tests green.
The lane's one discriminating receipt does not reproduce — the exact pre-fix argv on a node `.test-d.ts` with
a live browser-program plant exits 0, because a typecheck project with zero matched files never runs tsc. New
regression: `pnpm test:scoped --project=types-node -t x` now dies "No projects matched".

**#2233** — PARTIAL. The correction is right: `owner-scoped-writes.ts:320-329` is a `mustPass` row whose `why`
says verbatim "cut it and no mustFlag row moves, while this row reds". But the same hunk added a paragraph
claiming the suite "calls `loadGates()`, which returns `corpus.legacy` ALONE" and retires at the cutover — it
calls `loadMixedGateCorpus` at `:100`, the census walks both halves, and the file's own header records the
\#2031 repair that retired that premise. Also orphaned a bullet.

**#2234** — CONFIRMED. Six-row driver over a sibling pre-fix `lib/pass.ts` and the tip module in one file: the
pre-fix module returns `ok:true / findings:[]` for a gate whose `run` threw, tip returns `ok:false` with the
failure in `toolErrors`, a healthy silent gate stays `ok:true`, `begin` and `finalize` throws are also covered,
and a sibling's break leaves the healthy gate `true`. `ast-grep` sweep: the only other `GatePassResult.ok`
readers are the two named. `ops/structure.ts:83`'s artifact row is the honest residue.

**#2195** — CONFIRMED. Founding case exit 1 naming `b5490a02a`; acquitting control exit 0; no `--since` exit 3;
arm (b) live on the CURRENT ledger and reds on `b44d9ffa6`'s `OWED: #2275` (0 ledger rows, control `#2214` → 1);
both default bases refuse (`merge-base..HEAD` = 0 commits; `origin/main..HEAD` exit 2). 14 pins pass and
`verify --list` prints the manual row. New defect: `gitLog` has no `maxBuffer`, so >1 MiB of output becomes
`git log … failed (status null)`.

**#2268** — CONFIRMED. Corpus drive with the gate's own predicates over 303 modules: accused =
`["vector-scope-derived::IMPORT_SANCTIONED"]` alone; `list-row-adoption` BEFORE `["ALLOWED_ROOTS"]` → AFTER
`[]`; `own-tables-only` carries `FILE_ALLOWLIST` and is acquitted by its stale-arm string, so the premise
correction holds. Discriminator reproduced: cutting `ALLOW` from arm B takes `verifyGateProofs` 0 → 2 failures
(the founding row + the #2219 tripwire). Literal sweep: no live `ALLOWED_ROOTS` reference survives.

**#2275** — CONFIRMED. `pnpm exec eslint` on both files exits 0 with no diagnostics, and the zero is measured:
the pre-fix contents copied to the same path family exit 1 with the same 7 `tsdoc/syntax` errors at the same
coordinates. The diff is comment-only (0 non-comment changed lines) and the prose survived — both files'
word streams are identical modulo backticks and reflow. `pnpm typecheck` over both programs passes.
