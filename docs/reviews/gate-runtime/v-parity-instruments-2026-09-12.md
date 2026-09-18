---
kind: review
status: active
updated: 2026-09-12
---

# Verification — the three instrument commits (`c97de9d2f`, `03dd7329e`, `007c8b837`)

Lane `cb-v-parity-instruments`, worktree `.claude/worktrees/agent-a41e81c26cc609c59` at `007c8b837`.
Every number below was produced in this session; nothing is re-quoted from a commit message.

## VERDICTS

| instrument | verdict |
| - | - |
| `tests/support/legacy-differential.ts` (§4.6 harness) | **CONFIRMED**, with one undeclared limit (L9) |
| `tests/tooling/verify/gates/schema-fact-parity.test.ts` | **CONFIRMED** |
| `tests/tooling/verify/gates/port-parity-tier3.test.ts` | **CONFIRMED** |
| `tests/tooling/verify/gates/tier3-close-by-rule.suite.test.ts` | **CONFIRMED as a membership test**, with one undeclared clause-6 limit (L8) |
| `tooling/src/verify/gates/conversion-refusal-liveness.ts` | **REFUTED** — red on its only live subject on the real tree (L1), plus L2/L3/L4/L11 |
| `tooling/src/verify/contract/population.ts` (+64) | **CONFIRMED**, with one dead export (L5) |
| `ops/gen/read-first-costs.ts` + `ops/ledgers-fresh.ts` | **CONFIRMED as two-sided**, with L6 (miscount) and L7 (unnamed rows) |
| `tooling/src/doc-catalog/ops/format.ts` (`007c8b837`) | **CONFIRMED** — both fidelity laws hold under planted controls in both directions |

## 1 · The §4.6 differential harness — CONFIRMED

**Baseline.** `pnpm test:scoped` over the six touched suites: 6 files / 49 tests passed, exit 0
(`schema-fact-parity` 9, `port-parity-tier3` 2, `tier3-close-by-rule` 2, `conversion-refusal-liveness` 3,
`ledgers-fresh` 27, `doc-catalog/ops/format` 6).

**The symmetric-corruption failure mode is genuinely prevented (planted control).** I called
`shimHeaderImports` on a synthetic module whose BODY carries a column-0 `import { x } from "./x-columns";`
inside a fixture template literal. Output: both header imports rewritten to `file:///…` absolute URLs, the
fixture-string import byte-identical, exactly two `file:///` occurrences in the whole result. The
body-identity `expect` inside the function is a real assertion, not a comment.

**The FINAL replay applies the policy's DECLARED population — the §4.6 third failure mode (planted control,
both directions).** With `turn-identity`: a fixture holding only
`packages/server/src/domain/chat/engine/a.ts` → `{findings:["…a.ts:1"],population:1}`. Adding a second file
`docs/notes/a.ts` carrying the *same* `principal` identifier → **identical** output,
`{findings:["…a.ts:1"],population:1}`. The out-of-population file is neither counted nor judged; the
in-population positive control fires. `finalReplay`'s population comes from
`owner.population.effectiveSourcePaths`, not from `Object.keys(files)`.

**All three comparisons are declared and asserted.** `runScenarios` (`legacy-differential.ts:270-298`)
carries six `expect`s per example — legacy findings / legacy population / legacy tool errors / final
findings / final population / final tool errors — plus the twin's three, plus the mechanical inertness
control (`legacyReplay(twin) === legacyReplay(raw)`, compared unlined). `expect(scenarios.length ===
examples.length)` makes a dropped row loud.

**"A filesystem-reading legacy gate on a real tmpdir" does not apply to this corpus, and I checked rather
than assumed.** I extracted all eleven frozen blobs at their declared SHAs and scanned each for
`readFileSync|existsSync|readdirSync|node:fs|node:child_process|process.cwd|runNiced`: **zero hits in all
eleven**. Every replayed legacy gate is a pure in-memory AST reader, so `useInMemoryFileSystem: true` is
sound here. The frozen MODULE itself is written to the real `scratch` tmpdir. The limit is real for a
future caller and undeclared — L9.

## 2 · The Tier-3 rulings — CONFIRMED, with one undeclared limit

**`tier3-close-by-rule.suite.test.ts` does NOT claim the legacy side was executed, and says so.** The brief's
standard ("a 1:1 port whose legacy side was EXECUTED and returned zero") is not what this file asserts, and
the file declares that in its own header: *"it classifies by the legacy blob's SHAPE, never by a real-tree
run. It cannot see whether a legacy gate's live findings were zero."* What it closes on instead is clause 6
— the final still carries the legacy proof rows, so `check:policy-conformance` runs the legacy corpus
through the production dispatcher every static pass. I verified that substitute is live:
`pnpm -s check:policy-conformance` exit 0, **246 final policies · 2818 proof rows · 0 failures · 206 grant
rows · 0 invalid · corpus 300 modules, 54 legacy proven by gate-conformance**. The membership test's own
positive control (`scanned > 200`) and its twelve planted per-clause refusals are real and pass.

**No `schema-fact` module is closed by rule.** `CLOSED_BY_RULE`'s twelve are
`baseui-render-prop-composition`, `ct-story-single-import`, `infra-auth-no-userid`, `member-card-clamped`,
`no-array-literal-querykey`, `no-decorators`, `no-default-props`, `no-external-media-without-gate`,
`no-layout-context-props`, `no-media-queries-in-features`, `no-raw-container-widths`,
`ui-accname-survives-spread`. Intersection with the ten schema-fact modules and with
`plugin-dump-guard`/`turn-identity`: **empty**.

**`schema-fact-parity`'s legacy side is non-vacuous — I read the legacy numbers first.** Independent count
over the scenario objects: **41 non-empty `legacy` arrays** (a lower bound on the header's "42 findings on
41 of 86", since my splitter collapses a two-element single-line array). Because the suite passes, each of
those arrays IS the frozen engine's output, and all nine tests assert
`compared === legacy.mustFlag.length + legacy.mustPass.length` (9/9 `expect(compared` calls). A zero legacy
side would have downgraded the record; it is not zero.

`port-parity-tier3` additionally proves the `plugin-dump-guard` finalize arm had **zero** legacy example
coverage rather than asserting it in prose, and drives that arm's own trigger condition through both
engines with a `toBeGreaterThan(0)` successor assertion. That is the §4.6 shape done properly.

## 3 · `conversion-refusal-liveness` — REFUTED

### The refutation: the gate is RED on the real tree, against its ONE live subject

`pnpm check:structure` in this worktree, exit 1, run slot
`agent-a41e81c26cc609c59-3553097-2026-09-12T15-25-00-535Z`:

```
✗ conversion-refusal-liveness (2)  ·  final hard/error · population 583 source · 0 resource · verify-modules: 583 member(s)
    tooling/src/verify/gates/no-blanket-suppression.ts:60:14  CONVERSION_REFUSAL
    tooling/src/verify/gates/no-blanket-suppression.ts:60:14  CONVERSION_REFUSAL
```

The two messages are ARM E (*"the refusal declaration could not be read as
contract/conversion-refusal.ts's shape: dynamic: BinaryExpression depends on runtime evaluation"*) and ARM D
(*"the refusal names gate `(unreadable)` …"*). Cause: the live declaration's `why` fields
(`no-blanket-suppression.ts:64-68` and `:72-75`) are multi-line string **concatenations**, and
`readStaticAuthoredValue` refuses a `BinaryExpression`.

**Hermetic control, both directions**, two-file fixture through `runPolicyPass`, before I had the structure
leg: a `CONVERSION_REFUSAL` whose `why` is a single string literal → **0 findings**; the identical
declaration with `why` written as `"…" + "…"` → **exactly those 2 findings**.

**Why the lane's floor could not see it.** `tests/tooling/verify/gates/conversion-refusal-liveness.test.ts`
runs `verifyPolicyProofs` over `mode: "source"` fixtures whose `why` fields are all single literals, plus a
RUNTIME shape assertion on the imported value (`CONVERSION_REFUSAL.gate`, `.blockers`, `.under`) — which
reads the evaluated object and therefore cannot see an authored-source refusal. Nothing in the suite runs
the policy over the real corpus. `verifyPolicyProofs([gate])` returns `[]` today; that is true and does not
cover this.

### §5b, criterion by criterion

1. **Smallest complete contract** — HOLDS. `analysis: "syntax"`, `facts: []`, `resources: []`, no
   `ctx.checker()`; `execution: "entire-population"` is correct because ARM B is a cross-module census.
2. **`message` TRUE of what the code flags** — **FAILS** (L2). When the declaration is unreadable,
   `refusal.gate` is `undefined`, so `reportModule` (`:176`) falls into the ARM D branch and reports *"a
   refusal copied between modules accuses the one it came from"* about a declaration that was never copied.
   That is the live tree's second finding: the accusation is false, and a reader following it would go
   looking for a nonexistent source module. ARM E's own row already says the true thing.
3. **`fix` names the exact waiver spelling** — N/A and correctly so: `authority: "hard"`, no waiver exists.
   The `fix` names the repair, which is the right content for a hard policy.
4. **The family is a real shared `lib/` reader or a declared singleton with its reason** — HOLDS. Declared
   singleton, reader named (`lib/conversion-refusal.ts`, three functions), reason given.
5. **The header records the decisions** — HOLDS for family/population/limits. Its measured census is
   re-derivable and I re-derived it: 300 gate modules today, exactly **one** header line matching
   `^// CONVERSION.*(REFUSED|BLOCKED)` (`no-blanket-suppression.ts:17`), and `tsconfig-entry-liveness.ts` has
   converted and correctly carries no declaration (its header explicitly retires the refusal, *"THE
   CONVERSION BLOCKER IS GONE"*). I also swept all **52** surviving legacy modules for refusal prose in other
   spellings (`#1930|no shipped kind|missing kind|not convert|stays legacy|conversion`): the only hits are
   `no-blanket-suppression`'s own and one unrelated `platform-spellings` proof row. The population of one is
   a measurement, not a grep artefact.
6. **Proofs meet §4 in full** — **FAILS §4.1 twice** (L3, L4). Two narrowings have no row that dies without
   them, proven by planting each and re-running the policy's own proofs:
   · **header-span scoping** in `refusalOpenerLine` — planted a whole-file scan
   (`getFullText().slice(0, headerEnd)` → `getFullText()`); `verifyPolicyProofs([gate])` still `[]`.
   · **the `GATES_DIR` fence** on ARM A — planted its removal; `verifyPolicyProofs([gate])` still `[]`.
   Both real files were restored via `cp`/`mv` backups; `git status --short` is clean.
7. **Nothing forbidden behind the contract** — HOLDS. No private walk, cache, exemption table or filesystem
   read; the census reads AST string positions and the declaration goes through the corpus-wide
   `readStaticAuthoredValue`.

### The #2013 property the brief asked for is NOT expressible, and is not named as unheld (L11)

The brief's plant — *a refusal record citing a kind that now exists → finding; one citing a kind still
absent → pass* — cannot be authored: `CONVERSION_REFUSAL_BLOCKER_KINDS` is `["sole-consumer"]` and the
contract has no field for the missing capability. §12.4's reopen condition has **two** conjuncts — *"a
CONVERSION blocked by a read no shipped kind serves, **and** whose read has TWO OR MORE independent
consumers"*. The gate holds the second and not the first: if a staged-blob kind were minted tomorrow,
nothing here reds, which is the #2013 failure the module's own header opens with. The declaration's
`unheld` list names three other things and does not name this one, so its existence reads as coverage of a
property it does not hold. Mechanisable cheaply (the 18 kinds are data in
`contract/resource-declaration.ts`), so this is a defect rather than a stated out-of-reach limit.

### What DOES hold on the real tree

The census fence is correct: `--cached` occurs in `lib/repo-paths.ts:62` inside a **JSDoc comment** (not a
consumer, correctly), inside `no-blanket-suppression`'s own `unheld` string (inside the declaration span,
correctly excluded by `outsideDeclaration`), and at `:393` as a real code string (the declaring module IS a
consumer, as recorded). The recorded `consumers` list reproduces.

## 4 · `contract/population.ts` +64 — CONFIRMED, one dead export

`AUTHORED_MEMBERSHIP` is exhaustive over `PopulationRoot` via `satisfies`, so tsc is the enforcer; its key
order matches `POPULATION_ROOTS` declaration order exactly, so `@authored`'s derived member order is
byte-identical to the literal it replaced. Coupled sites: `POPULATION_SETS` is read by
`lib/population-resolver.ts:7,93` and asserted by literal in
`tests/tooling/verify/lib/population-resolver.test.ts:20`; both are unaffected by the tuple→array type
change. `pnpm -s check:policy-conformance` exit 0 (246 / 2818 / 0 failures). The read-first §2 counts are
authored and were not touched by this commit.

**L5:** `authoredExclusionReason` is exported and has **no consumer** — `pnpm ast refs
authoredExclusionReason` returns 1 hit in 1 file (its own definition) over `scanned=7507, skipped=0,
status=complete`, corroborated by a repo-wide `grep`. Its JSDoc claims two ("a gate diagnostic, this
contract's own test"); neither exists.

## 5 · `read-first-costs` + `ledgers-fresh` — CONFIRMED two-sided, two defects

**The reconciler reports what it could not hold.** `pnpm -s check:ledgers-fresh` exit 1:
`docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md sections vs their reports (7 of 20 reconcilable;
the rest cite an audit report that declares no rows)` — the unreconciled count is in the row label, never a
serene count.

**Planted: a report declaring N over a PROSE list.** I created
`docs/reviews/gate-runtime/cbvpi-planted-report.md` with `## LEDGER ROWS (3 rows)` above three prose
bullets, and appended a `###` ledger section citing it (real-file probe on the ledger, `cp` backup,
restored). `check:ledgers-fresh` went STALE and named the report **twice**, in both directions:

```
rows   …refutation-ledger-2026-09-12.md:157 carries 1 row(s); cbvpi-planted-report.md's own LEDGER ROWS table declares 0
self   cbvpi-planted-report.md's heading says (3 rows) and its table carries 0
```

**Planted: the `| subject |` header.** `ledgerSections` over the real ledger totals **166** defect rows; with
the single `| subject |` header at `:395` normalized to `| module |`, **165**. The brief's #2075 row is
confirmed exactly. The same literal appears in `reportLedgerRows` (`gate-program-docs.ts:115`) and has the
same failure there — measured on a synthetic report: a 2-row table under a `| subject |` header reads
`{rows: 3, declared: 2}`, which would raise a false `self` drift. And the miscount is already **visible in
the shipped doc**: `gate-runtime-read-first.md:51`'s GENERATED size cell says `166 defect rows` while the
AUTHORED stop-rule prose in the same table row says `165 rows`.

**L7 — the generator's freshness arm names no row.** `baseline read-first-costs --check` prints
`1 difference(s) … the table's SIZE cells differ`. I regenerated on a backed-up copy: **three** rows moved
(row 1 `184 KB`→`190 KB`, row 5b `221`→`222 KB`, row 6 `359 KB`/`298 rows`→`361 KB`/`300 rows`). A reader
cannot tell one moved cell from eight, which is weaker than every sibling row in the same stage.

**Standing red for the barrier:** `check:ledgers-fresh` is exit 1 on this tree because of exactly that
staleness — the doc/roster commits after `03dd7329e` moved the prices. Fix is the named regen command.

## 6 · The docs formatter (`007c8b837`) — CONFIRMED

**Search fidelity, with a positive control for the narrowness of the predicate.** Planted
`docs/reviews/gate-runtime/cbvpi-escapes.md` carrying `NOT_FOUND`, `a_b`, `snake_case_thing`, `#tag`, `[x]`,
`*star*`, `~x~`, `HEAD~1`, `10~20°C` in prose and `` `NOT_FOUND` ``, `` `a_b` ``, `` `#tag` ``, `` `[x]` ``,
`` `~x~` `` in code spans. `pnpm format:docs <file>` exit 0. Result: every underscore and tilde identifier
survives **unescaped** (`grep -c NOT_FOUND` = 2, prose and code span), code spans are byte-identical, and
the ONLY change in the whole file is `[x]` → `\[x]` — a markup-starting character that still gets its
escape. The predicate is provably narrow, not a blanket unescape.

**Render fidelity refuses in BOTH modes and leaves the file alone.** Planted
`docs/reviews/gate-runtime/cbvpi-badtable.md` — a GFM table whose body row carries three cells under a
two-cell header (the `91d9a2ab7` corruption class). `pnpm -s check:docs <file>` → **exit 1**, `1 file(s) NOT
FORMATTED: formatting them would change what they render`. `pnpm -s format:docs <file>` → **exit 1**, same
message plus `formatted 0/1 file(s)`. `md5sum` identical before and after both runs.

**The three named corrupted docs are not re-corrupted.** `pnpm -s check:docs` over
`resource-gate-access-patterns.md`, `plugin-showcase-set.md`,
`stickler/2026-08-29-issue-711-reaudit.md` → exit 1 as "2 file(s) not formatted" (dirty, not refused);
`md5sum -c` on all three: OK, unchanged. To answer the stronger question I copied the two dirty ones to
`cbvpi-` paths and formatted the COPIES: every change is an escape REMOVAL that restores a grep hit
(`card\_state`→`card_state`, `QUEUE\_HEAD\_WINDOW`→`QUEUE_HEAD_WINDOW`, `\~30`→`~30`). No table shape moved.
That is #2068's fix doing exactly what it claims on real corpus bytes.

## LEDGER ROWS (11 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `conversion-refusal-liveness` | cb-v-parity-instruments L1 · `tooling/src/verify/gates/no-blanket-suppression.ts:60` | the new HARD gate is RED on the real tree against its ONE live subject: the declaration's `why` fields are multi-line string CONCATENATIONS, which `readStaticAuthoredValue` refuses as `dynamic: BinaryExpression`, so ARM E and ARM D both fire. Production `check:structure` slot `agent-a41e81c26cc609c59-3553097…` shows `✗ conversion-refusal-liveness (2) · final hard/error`. Hermetic control: literal `why` → 0 findings, concatenated `why` → those 2 | other (instrument) | **OPEN** | make every `why` in `CONVERSION_REFUSAL` a single string literal (or teach `readStaticAuthoredValue` a literal-only concatenation), and add a proof row whose fixture uses the concatenated shape so the suite can see this class |
| `conversion-refusal-liveness` | cb-v-parity-instruments L2 · `tooling/src/verify/gates/conversion-refusal-liveness.ts:176` | ARM D's message is not true of what it flags: an UNREADABLE declaration leaves `refusal.gate` `undefined`, falls into the wrong-self branch, and is reported as *"a refusal copied between modules accuses the one it came from"* — no copy exists. §5b criterion 2 | other (§5b.2 message truth) | **OPEN** | gate the wrong-self branch on `refusal.gate !== undefined`, so an unreadable declaration is reported only by ARM E |
| `conversion-refusal-liveness` | cb-v-parity-instruments L3 · `tooling/src/verify/lib/conversion-refusal.ts:52-58` | §4.1: the header-span scoping in `refusalOpenerLine` has no proof row that dies without it — planted a whole-file scan and `verifyPolicyProofs([gate])` still returned `[]` | §4.1 narrowing | **OPEN** | add a `mustPass` row whose module quotes `// CONVERSION … REFUSED` in a comment BELOW the first statement, which reds the moment the header-span cut is removed |
| `conversion-refusal-liveness` | cb-v-parity-instruments L4 · `tooling/src/verify/gates/conversion-refusal-liveness.ts:161` | §4.1: the `GATES_DIR` fence on ARM A has no proof row that dies without it — planted its removal and `verifyPolicyProofs([gate])` still returned `[]` | §4.1 narrowing | **OPEN** | add a `mustPass` row placing a refusal-opener comment in a `tooling/src/verify/lib/` module, which reds when the fence is dropped |
| `conversion-refusal-liveness` | cb-v-parity-instruments L11 · `tooling/src/verify/contract/conversion-refusal.ts:27` | the #2013 property the module's own header opens with is neither held nor named as unheld: `CONVERSION_REFUSAL_BLOCKER_KINDS` has no member for "the capability this refusal cites does not exist", so a newly-minted resource kind cannot red any refusal — only §12.4's SECOND conjunct is held, and `unheld` names three other things instead | other (instrument) | **OPEN** | add a `missing-kind` blocker whose `kinds` are re-derived against `contract/resource-declaration.ts`'s frozen 18, or state the gap verbatim in `unheld` |
| `contract/population.ts` | cb-v-parity-instruments L5 · `tooling/src/verify/contract/population.ts:74` | `authoredExclusionReason` is an exported dead reader — `pnpm ast refs` returns 1 hit in 1 file (its own definition) over `scanned=7507 status=complete` — while its JSDoc names two consumers ("a gate diagnostic, this contract's own test") that do not exist | other (dead export) | **OPEN** | either wire it (the natural consumer is a `@showcase`-excluded diagnostic) or delete it and keep the reason in the map's `why` field |
| `lib/gate-program-docs.ts` | cb-v-parity-instruments L6 · `tooling/src/verify/lib/gate-program-docs.ts:79` and `:115` | the header literal `module` (matched as a whole cell) is the ONLY excluded spelling in BOTH readers, so a table whose first header cell is `subject` counts its header as a defect row: the ledger reads 166 vs the method's 165 (measured with the one `:395` header normalized), and `reportLedgerRows` reads a 2-row `subject`-headed table as three rows. The generated cell at `gate-runtime-read-first.md:51` now says `166 defect rows` beside authored prose saying `165 rows` | other (instrument) | **OPEN** | exclude by SHAPE — the row immediately preceding an alignment rule — rather than by one column name, and pin both readers with a `subject`-headed fixture |
| `ops/gen/read-first-costs.ts` | cb-v-parity-instruments L7 · `tooling/src/verify/ops/gen/read-first-costs.ts:130` | the freshness arm reports a bare `1 difference(s) … the SIZE cells differ` and names no row; a regeneration on a backed-up copy showed THREE rows had moved (1, 5b, 6). Every sibling row in the same stage names its drifting rows | other (instrument) | **OPEN** | emit one drift line per changed row id with its old and new cell, the way `ledgerSectionDrift` does |
| `tier3-close-by-rule` | cb-v-parity-instruments L8 · `tests/tooling/verify/gates/tier3-close-by-rule.suite.test.ts:131-139` | clause 6 — the load-bearing one — checks carriage with `final.includes(why)` only, so a conversion that keeps the legacy `why` STRING while rewriting the fixture bytes still qualifies for closure, and the "policy-conformance already runs the legacy corpus" argument is then false. The header declares two limits and not this one | other (instrument) | **OPEN** | compare the legacy row's `files`/`at` payload as well as its `why`, or declare the limit in the header's WHAT-THIS-TEST-CANNOT-DECIDE block |
| `tests/support/legacy-differential.ts` | cb-v-parity-instruments L9 · `tests/support/legacy-differential.ts:202` | the shared harness is `useInMemoryFileSystem: true` and its header — which enumerates four other caller obligations — does not state that a legacy gate performing a real filesystem read cannot be replayed faithfully. Verified harmless TODAY: all eleven frozen blobs scan clean for `readFileSync/existsSync/readdirSync/node:fs/node:child_process/process.cwd` | §4.6 differential | **OPEN** | add the limit to the header's obligations list, and refuse (or `expect`) when a frozen blob's source carries an fs/proc import |
| `ledgers:fresh` | cb-v-parity-instruments L10 · `docs/design/gate-runtime-read-first.md:49-55` | `pnpm -s check:ledgers-fresh` is exit 1 on `007c8b837`: the read-first SIZE column is stale by three rows because the commits after `03dd7329e` moved the priced documents. Not an instrument defect — the mechanism working — but it is a live red on the static bar | other (stale ledger) | **OPEN** | run `pnpm exec node tooling/src/verify/cli.ts baseline read-first-costs` at the barrier and commit, after L6 so the regenerated row-3 count is the corrected one |

## WHAT I DID NOT COVER

- **No merge-train barrier run.** My `check:structure` is one worktree's run at `007c8b837`; I did not run
  `pnpm check`, `pnpm verify --push`, or any behavioural product suite.
- **`split-arm-parity.test.ts`** (Tier 2a, the third inline copy of the differential machinery) was out of
  scope and is not verified here.
- **The nine schema-fact modules' per-row VERDICT prose** — I verified the legacy side is non-vacuous, that
  every example is compared, and that the twin inertness control is mechanical, but I did not independently
  re-derive each of the 86 rows' declared finding strings; the suite is the two-sided holder for those.
- **`tier3-close-by-rule`'s roster derivation** is asserted by the suite over today's corpus (12 modules,
  scanned > 200) and I did not re-derive the twelve by hand against their legacy blobs.
- **The other §5b criteria for the OTHER instruments** — I applied the seven-criterion bar only to
  `conversion-refusal-liveness`, which is the one new final policy in the three commits.
- **`member-card-clamped`'s `["@authored", "@showcase"]` widening** and the #2008 deferred-roster half of
  `03dd7329e` were not exercised; only the `population.ts` contract change and its coupled sites were.
- **No probe survives.** Four scratch test files and four scratch docs were created and deleted; two real
  files (`lib/conversion-refusal.ts`, `gates/conversion-refusal-liveness.ts`) and two real docs
  (`refutation-ledger-2026-09-12.md`, `gate-runtime-read-first.md`) were probed via `cp` backups and
  restored. `git status --short` shows only this report. Three of the probe files were on disk during the
  `check:structure` run and appear inside `✗ test-layout (54)` — the clean baseline for that gate is 51.
