---
kind: review
status: active
updated: 2026-09-13
---

# cb-adj-policy — adjudication of the policy-correctness cohort (#2063 #2070 #2101 #2136 #2225 #2230 #2210)

## 1. Base and method

Base `1ea2c2a0e` (`docs(catalog): attest resource contract and selection evidence`), isolated worktree
`agent-a75c19861b9dac54c`, tree clean at start and at report time. READ-ONLY lane: no tracked file was
modified, no probe planted, no `work:item` call, no agent spawned.

Per row: the full issue including comments (`gh issue view <n> --json number,title,state,body,comments`),
then re-derivation against the CURRENT tree — the cited `file:line`, `git log --all --grep=#<n>` for landing
commits, `git log -S <literal>` for the exact hunk that landed a text fix, the refutation ledger's rows
citing the number, and a scoped run where one exists. Every negative claim carries a scanned-file count or a
planted positive control in the same invocation; every code-presence claim was decided by `ast-grep`, with
`grep` only corroborating.

**Runs I produced in this session (all exit 0, all in this worktree):**

| Run | Result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/gates/duplicate-action-doors.test.ts css-home-topology-family.suite.test.ts css-hook-provenance-family.suite.test.ts` | 3 files, **24/24 passed**, exit 0 |
| `pnpm test:scoped tests/tooling/verify/gates/suppressions-family.suite.test.ts` | 1 file, **9/9 passed**, exit 0 |
| `pnpm exec ast-grep --lang ts --pattern 'defineGate($$$)'` on `no-blanket-suppression.ts` | **zero matches**; positive control on `suppressions.ts` → `:174` |
| three independent key counts over `git show d23150315:tooling/src/verify/gates/suppressions.ts` span 40–188 | 46 / 46 / 0 duplicates |
| python parse of `packages/ui/src/styles/theme.css` `@theme` block + `packages/ui/src/tokens/tokens.json` | 203 / 203 / 188+15 |
| `git rev-parse aecbc6c6c^` | `6b1d01be0` |

I did NOT run `pnpm check`, `check:structure`, `check:policy-conformance`, whole-tree lint/typecheck, or CT —
the root holds those slots.

**The cohort's headline: four of the seven rows are OPEN paperwork over landed work.** #2101, #2136 and
\#2210 are fully on the tree and verified; #2063 is half landed. Three ledger cells (`:483` context row `:765`,
`:549`, `:818`) still read OPEN for work that shipped, twice within minutes of the report that filed them.

## 2. Per-row adjudication

### #2210 — the RATIFIED census understates its own re-derivation by one

**Rulings preserved:** none carried on the issue (no comments). Fix spec was two-sited: the doc's `**LANDED …**`
annotation, plus the refutation ledger's flipped cell for #2139 at line 552.

**Current-tree receipts.** Both halves landed.

- Doc half: `1bf959a3e` (`git log -S "corrected here under #2210"` returns exactly that commit).
  `docs/reviews/gate-runtime/exception-authority-census.md:171-183` now reads **46** source rows, cites #2210
  by number, and — better than the spec asked — states the METHOD and why the first re-derivation was wrong
  (`^  "` quoted-key sweep returns 45; the 46th key is the BARE `format:`).
- Ledger half: `56ae6a8cf`, a one-line edit to `:552` replacing *"re-derived to 45 source + 7 tests"* with the
  corrected sentence. Verified by reading the diff.

**Independently re-derived, three ways, at the exact sha.** `git show d23150315:tooling/src/verify/gates/suppressions.ts`
→ 539 lines; the `RATIFIED_RULES` object literal spans `39` (`const`) to `189` (`};`), entries `40–188`:

```
quoted-or-bare keys: 46      kind: " occurrences: 46      duplicate keys: 0      quoted-only (^  "): 45
bare key: format: { kind: "ruling", why: "a byte blob kept on ONE line on purpose — …" }
```

All three agree at 46; the doc's stated method reproduces exactly. The doc says span `39–189`, which is the
brace-inclusive span and is correct (the issue body's `39–193` is the figure the doc explicitly corrects).

**LIFECYCLE ONLY.** Closure receipt: `1bf959a3e` (doc) + `56ae6a8cf` (ledger cell). Proposed transition:
**land** with evidence `1bf959a3e`.

### #2136 — the mirror family's false legacy-SHA gloss

**Rulings preserved:** the owner-of-record transfer comment (claude-b, 2026-09-12 23:50Z) — the row was freed
from a folded lane via `park --wake` → `ready` with its eight family siblings so the mirror family dispatches
as ONE lane, one cold read. That is a lifecycle note and is satisfied by closing the row. The issue's
"do not redo what the verifier CONFIRMED" instruction is honoured: I re-derived only the SHA claim.

**Current-tree receipts.** All FOUR carriers are correct.

```
test-layout.ts:21           // POPULATION PORT — legacy at 6b1d01be0 (the parent of the conversion commit aecbc6c6c), …
test-presence.ts:54         // POPULATION PORT — legacy at 6b1d01be0 (the parent of the conversion commit aecbc6c6c), …
test-presence-client.ts:25  // POPULATION PORT — legacy at 6b1d01be0 (the parent of the conversion commit aecbc6c6c), …
mirror-index-family.suite.test.ts:1-4   … converted from legacy `GateDescriptor`s at `aecbc6c6c` (#2061/#2062). The legacy
                                   tree is that conversion's PARENT, `6b1d01be0` … (#2136: this line read
                                   "the child of 90bbeb04f", which is a different commit, `90c7be9e7`).
```

The parenthetical is now TRUE: `git log -1 --format="%h %p" aecbc6c6c` → `aecbc6c6c 6b1d01be0`. The bytes claim
also still holds: `git diff --stat 90bbeb04f 6b1d01be0 -- <the three gate modules>` is EMPTY.

Fixing commit for all four: **`8c165cd9f`** (2026-09-12T20:35:18-06:00), found by `git log -S "6b1d01be0"`.
The FOURTH carrier that ledger row `:818` (cb-v-wave-9b, filed at `865e7050c`, 19:59) reports as surviving was
fixed **36 minutes later** by that same commit. `grep -rn 90bbeb04f` at HEAD returns the literal only inside
that self-documenting parenthetical plus review records — no live false claim anywhere.

**LIFECYCLE ONLY.** Closure receipts: `9b01c410a` (the family's other halves) + `8c165cd9f` (all four SHA
carriers). Proposed transition: **land** with evidence `8c165cd9f`. Two ledger cells owe a flip — `:549`
(state cell `OPEN` with a 2026-09-13 refutation note that is itself stale) and `:818` (`OPEN (board #2136)`).

### #2101 — cardinality ruled ONCE across four modules

**Rulings preserved:** the issue's fix spec is the ruling — *"rule cardinality ONCE for this module plus
`css-family-ownership`, `css-var-defined` and `duplicate-action-doors`: an occurrence-unique subject, or a
hard algorithm that owns the count."* Also preserved: the header's own general rule, *"a `count` is never the
fix for an over-broad subject; it is the TELL that the subject is wrong."*

**Current-tree receipts, module by module.**

| Module | Outcome | Landing |
| - | - | - |
| `css-length-tokens` | the 16 count-bearing rows are gone; `STRUCTURAL_CLASS_FILES` went `(file → count)` → 13 `(file, candidate)` occurrence-unique rows with a zero-occurrence liveness arm behind `onRealTree` | `b5490a02a` → `e7e3f083b` → `ea37c99d8` (the #2198 guard restore) |
| `css-var-defined` | `:5` — "THE THREE COUNT RATCHETS ARE GONE (#2181)" | `e7e3f083b` era |
| `css-family-ownership` | five per-file counts retired; its remaining `count: N` are `expect: { count: 1, … }` PROOF-ROW expectations, a different object entirely | — |
| `duplicate-action-doors` | **the ruled unit is a NAMED DOOR SET**; `count`/`ratified` survive only as the shared ledger's accounting and *decide nothing*, with `countDisagreement()` making a row whose count disagrees with its named set itself RED | **`8fc7eb6dd`**, 2026-09-12T19:11:41-06:00 |

The three patterns cb-v-wave-8a cited as surviving in `duplicate-action-doors` — `row?.count ?? MIN_DOORS - 1`,
`live < row.count`, `budget ${row.count}` — are **all absent** at HEAD. `MIN_DOORS = 2` survives as the
CLASS DEFINITION (a pair is what a duplicate IS), stated at `:29`, not a per-row budget.
`8fc7eb6dd` landed **seven minutes after** the wave-8a report `e417baa5b` that filed row `:765`.

Negative claim with control: `grep -nE "count: [0-9]"` over the three count-ratchet modules returns only
`expect:` proof-row counts and comment prose; the same pattern matches in **299** files under
`tooling/src/verify/gates/`, so the scan is live.

Proof run: `duplicate-action-doors.test.ts` + `css-home-topology-family.suite.test.ts` +
`css-hook-provenance-family.suite.test.ts` → **24/24 passed, exit 0**. (`css-length-tokens` is a LEGACY module: its
proof rows are visible only to the orchestrator-only planter `gate-conformance.repo.int`, so its arms are read,
not driven, here — the planter run is primary's and is already owed.)

**LIFECYCLE ONLY.** Closure receipt: `8fc7eb6dd` (the last of the four). Proposed transition: **land** with
evidence `8fc7eb6dd`. Ledger row `:765` (`OPEN (board #2101)`) owes a flip.

### #2063 — SPLIT

**Rulings preserved:** the orchestrator ruling in the body (SPLIT: A+B final, arm C legacy and armed, §12.4
residual 1 stands for arm C, header states the split and the catch-regression warning); the owner ruling of
2026-09-12 recorded in `suppressions.ts:24-45` on the two-direction trade and on the 30-occurrence disposition;
read-first §0 ruling 1 (nothing gets to refuse to convert) — which the SPLIT is precisely the resolution of,
not a collision with.

**Half 2 — the `suppressions` gate: LANDED AND VERIFIED.** `a33b2e339` converted it:
`export const gate = defineGate({ id: "suppressions", authority: "reviewed-grant", … })` at `:174`.

- **Grant-home design: RULED and built.** The subject is a RULE CLASS, not a path (`:130-133`) — the one
  consumer that diverges from `reviewed-grant-findings.ts`'s file-subject convention, ruled 2026-09-12, because
  keyed per file it would need 284 rows each carrying a count's worth of meaning, *"the per-file ratchet
  re-minted as grants."* 65 `(rule, scope)` classes → 65 grant rows in `lib/reviewed-grants.ts`, each consumed
  exactly once. Baseline, count ratchet, CLASS DRIFT and STALE RULE arms all deleted with their successors or
  obituaries named at `:66-76`. The census at landing is 597 occurrences / 283 files / 65 classes.
- **The burnable rows: DISPOSED, and the issue's own figure was superseded.** The issue prices "20 burnable
  rows / 27 occurrences"; the conversion measured **30** burnable occurrences, all in `tests` scope, and
  disposed them one by one under an owner ruling: FIVE were genuinely fixable and were **fixed in the same
  commit, never granted** (e.g. the three `noNonNullAssertion` markers in
  `tests/server/domain/chat/wire-capture-fidelity.suite.int.test.ts:275,289,313`, replaced by one
  `requireRunChatTurn` guard); the rest were UNRECORDED RULINGS rather than unresolved findings, because seven
  of the thirteen debt classes were already ruled in the SOURCE table for the same technical reason. §4.4
  ("debt is never converted into a grant to make a run clean") governs the latter and was honoured.
- Proof run: `suppressions-family.suite.test.ts` → **9/9 passed, exit 0**.

**Half 1 — the `no-blanket-suppression` A+B split: STILL MISSING.**
`tooling/src/verify/gates/no-blanket-suppression.ts:512` is `export const gate: GateDescriptor`, importing
`../contract/gate.ts`. Receipt with a positive control in the same invocation:

```
ast-grep --lang ts --pattern 'defineGate($$$)'  no-blanket-suppression.ts   → ZERO matches
ast-grep --lang ts --pattern 'defineGate($$$)'  suppressions.ts (control)   → :174 export const gate = defineGate({
grep -n defineGate no-blanket-suppression.ts    → :17 only, and it is COMMENT PROSE
```

And the module's own header carries both sides of the contradiction the ruling was written to end: `:17-19`
states a WHOLE-module indefinite refusal, while `:36-40` records *"ARM C ALONE is the blocker, and arm C is the
whole #954 defence."* This matches cb-v-wave-8b's row `:796` exactly; I reproduce it rather than inherit it.

**SPLIT.** Half 2 is LIFECYCLE ONLY (evidence `a33b2e339`); half 1 is STILL MISSING. Proposed transition:
**keep #2063 OPEN, narrowed to half 1 only** — re-title and re-body it to the A+B split, and record half 2's
closure receipt in the row so the next reader does not re-derive the whole conversion. Fix spec in §3, chunk 1.

### #2070 — `workItem` liveness

**Rulings preserved:** the forge (#2111) ruling, **owner-approved 2026-09-12**, in the issue's one comment:
`workItem` liveness is **NOT a gate** — it needs the board (network) and guide §12.3 bans every I/O door from a
policy. The honest home is a **BARRIER SCRIPT** (a `pnpm work:item` census over every final policy's `workItem`,
a closed issue is red) run at the quiet barrier beside `ledgers:fresh`. **Do not add an arm.** I did not
re-litigate this and my fix spec obeys it.

**Current-tree receipts — the defect is unfixed AND has grown.** There are exactly three warning-severity
policies on the tree; **two of the three name CLOSED issues.**

| Policy | `workItem` | Board state (read this session) |
| - | - | - |
| `over-art-plate-arm.ts:160` | 2024 | **CLOSED** — *"over-art-plate-arm's warning debt points at CLOSED #626, and the gate stopped blocking when its ratchet retired"* |
| `policy-refusal-coverage.ts:422` | 2184 | **CLOSED** — *"policy-refusal-coverage: a fact/resource consumer without a mustRefuse row … — forge recommendation #1"* |
| `policy-family-readers.ts:262` | 2187 | OPEN |

The second carrier (#2184) is a NEW instance not named in the issue; #2070's body knows only about #2024. The
defect's own recursion — *"the warning debt again points at a closed row"* — has now happened a third time.

Nothing checks openness. `lib/policy-validation.ts:426-433` validates only that `workItem` is an own enumerable
positive safe integer when `severity` is `warning`, and is forbidden when `severity` is `error`. No barrier
script exists: a tree-wide census of the literal `workItem` (`--include=*.ts --include=*.json --include=*.md`,
**51 files matched**, with `defineGate` at **344 files** as the live-scan control) returns only the contract,
the three policies, `new-gate.ts`, four comment mentions, the tests, and documentation.
`tooling/src/verify/ops/ledgers-fresh.ts` (430 lines) has seven derivations and none of them is this one; the
only `work:item` door in `package.json` is `tooling/src/workboard/cli.ts` and nothing under `tooling/src/verify`
calls it.

**STILL MISSING.** Fix spec in §3, chunk 2. Proposed transition: stays Ready; **re-body to name BOTH carriers**
so the lane fixes the population, not the instance.

### #2225 — a registered stage that never produces a verdict

**Rulings preserved:** the NARROWING comment (claude-b, 2026-09-13 03:45Z, agreed with primary). Half (a) — the
tier's exit going 2 when a registered stage produced no verdict — was **orchestrator-REFUSED on measurement**
(46 `classify` rows, all three adapters map `null → 2`, zero inline lambdas launder a null); the refusal and its
reason are recorded in `exit-classifiers.ts` and it **is not re-proposed**. I verified that record exists
(`exit-classifiers.ts:99-101`) and I do not reopen it. The row is now ONLY half (b).

**What landed.** `6d62ad8ab` (the `resolveBin` fix — argv\[0] `bash` no longer sent to `node_modules/.bin`),
`9653cbb71` (the `--list` refusal re-homed), and `c810fee07` part 2 (`StageResult.childExit`,
`VerifyReport.noVerdict`, `producedNoVerdict`, `noVerdictStages`, and a NO-VERDICT block printed above the
verdict line and on GREEN runs). The `--list` half is genuinely pinned against the real registry with a planted
control: `run.int.test.ts:1326` asserts `unrunnableRegistryRows(process.cwd(), PATH)` is `[]` and then hands the
same reader a nonexistent root and an empty PATH and requires **every** row back, named.

**What half (b) asked for, and it is NOT on the tree.** The comment's words: *"the run-door control is
hand-built `StageResult` rows, not a registered stage with an unresolvable `argv[0]` — pin it with a registered
stage whose command cannot resolve, so the summary line that names exit-2/null-code stages is proven against the
real door."* Receipt:

```
grep -rn childExit  tests/ tooling/   → 5 files.  The ONLY producer in tests is
    run.int.test.ts:1422  function ranStage(name, exitCode, childExit): StageResult { return { ...failedStage(...), childExit }; }
The real door is  tooling/src/verify/ops/run.ts:320   childExit: result.code,
and NOTHING in tests reaches it: all three #2225-part-2 arms (:1426, :1448, :1456) consume ranStage(...) literals.
```

The commit's own comment block concedes this shape at `:1395` ("the half the `--list` refusal did not close"),
and the owner comment postdates the commit (`c810fee07` is 2026-09-13T02:24Z; the narrowing is 03:45Z), so the
narrowing was written knowing what landed.

**SPLIT.** Half (a) REFUSED-and-recorded (not work). The `--list` door and the summary rendering are
LIFECYCLE-landed at `6d62ad8ab`/`9653cbb71`/`c810fee07`. The narrowed half (b) is **STILL MISSING**. Fix spec in
§3, chunk 2. Proposed transition: stays Ready, narrowed body already correct.

### #2230 — `EXPECTED_DIRECT_THEME_DECLARATIONS = 203` (OWNER-WORD; arms priced, constant untouched)

I did not propose changing the constant. What follows is the current state and a re-pricing of the arms as the
issue states them, because **two of the arm-A pricing terms have moved on the tree since the issue was filed.**

**Current state: UNRULED, and honestly labelled.** The constant is still `203` at
`tooling/src/verify/lib/css-family-census.ts:82`, still compared at `css-family-policy.ts:478-483`
(`theme.directTheme.length !== EXPECTED_DIRECT_THEME_DECLARATIONS` → a finding naming both numbers). Its
owner-pending status is recorded in TWO module headers — `css-family-census.ts:76-81` (*"ITS SURVIVAL IS NOT AN
ENDORSEMENT … the same SHAPE as the three ratchets `css-var-defined` retired the same day, under a different
word … ESCALATED and deliberately undecided here (#2230)"*) and `css-family-ownership-health.ts:31`. Nothing has
been decided; nothing has drifted. The `#2181` leg that retired the five per-sheet counts and the aggregate
total **deliberately left this one standing** and said so.

**The derivability claim RE-MEASURED at `1ea2c2a0e`, and it holds:**

```
packages/ui/src/styles/theme.css  @theme block (lines 4–208)   → 203 direct declarations, 203 unique property names
packages/ui/src/tokens/tokens.json  $extensions.orb.cssValues  → 26 entries: 15 placement:"theme" · 11 placement:"root"
                                     token leaves               → 203, of which orb.output.kind "input" = 15
                                     (35 snapped · 23 light-dark · 4 percentage · 126 unroled)
theme block props NOT from cssValues (i.e. Style-Dictionary-emitted) → 188
   188  =  203 leaves − 15 "input" (renderPortableToken returns null for outputRole "input", tokens.build.ts:187-189)
   203  =  188 + 15 theme-placement cssValues                                            ✓ generator = reader = constant
corroboration: all 11 root-placement cssValue targets appear in theme.css's :root block, 11/11
```

**Two corrections to the issue's own arm-A text, both measured, both material to the price:**

1. **The "#1956 three-site coupling" is ALREADY a ONE-site coupling.** The issue says arm A dissolves "the
   constant and its two fixture spellings (`css-family-ownership.ts` `mustFlag` `themeDirect: 202` + the clean
   `mustPass`)". Both fixture spellings are GONE: `grep -n themeDirect css-family-ownership.ts` returns nothing,
   and `lib/css-family-proof-fixtures.ts:40-41` now DERIVES both fixtures from the constant
   (`THEME_AT_PARITY = themeBlock(EXPECTED_DIRECT_THEME_DECLARATIONS)`,
   `THEME_ONE_SHORT = themeBlock(EXPECTED_DIRECT_THEME_DECLARATIONS - 1)`), citing the legacy
   `censusControlFiles({ themeDirect: 203 })` it replaced. **A legitimate token addition now reds ONE site, not
   three.** That is most of the pain arm A was priced against, already paid by a different leg — arm C
   ("keep the tripwire") is materially cheaper today than the issue's text implies.
2. **Arm A's stated predicate does not typecheck against the contract.** The issue says *"compare
   `readDirectThemeDeclarations(theme.css).length` against `contract.cssTargets` partitioned by `placement`."*
   `cssTargets` is a flat `ReadonlySet<string>` of **214** target names (188 + 26) and carries NO placement —
   placement exists only on the 26 `cssValues` entries. The correct, measured predicate is a TWO-TERM SUM over
   `TokenContractResult`:

   ```
   expected = baseTokens.filter(t => t.outputRole !== "input").length
            + Object.values(cssValues).filter(e => e.placement === "theme").length
            = 188 + 15 = 203
   ```

   The good news for arm A's cost: this is still **no new kind and no new reader**. The shipped `token-contract`
   resource serves `TokenContractTexts` (raw JSON strings, `contract/resource-artifact.ts:26-47`), and the
   already-exported `validateTokenContractTexts(texts)` returns a `TokenContractResult` carrying `baseTokens`
   (with `outputRole`) and `cssValues` (with `placement`) — `packages/ui/token-contract.ts:143-152`. The
   `tokens-contract` gate already calls it. So arm A is buildable, but the SPEC LINE in the issue must be
   replaced by the sum above or a lane will implement the wrong thing.

**Arms, re-priced at `1ea2c2a0e`:**

| Arm | Cost now | What it buys | What it costs |
| - | - | - | - |
| **A — DERIVE (issue default)** | ~one policy leg: one helper reading the parsed contract + the two-term sum, the constant and its two derived fixtures re-pointed | the literal stops being hand-typed; the §12.5 ratchet-shape objection dissolves | the gate acquires a second reader of the GENERATOR'S PARTITION RULE (`outputRole === "input"` → not emitted). If `renderPortableToken` gains a fourth null branch, the gate silently agrees with the wrong number — the derivation is only as honest as its copy of one switch statement |
| **B — byte-identity freshness of `theme.css` vs the generator, in a `baseline` verb** | larger: Style Dictionary is async and seconds, so it belongs in `ledgers:fresh`/`baseline`, never inside a policy `evaluate` | subsumes A **and** the partition-copy hazard above — it compares BYTES, so no rule is re-implemented; the count becomes a corollary nobody spells | a whole-tree regenerator, which the standing facts forbid a lane from running on a shared tree; it must be barrier-only |
| **C — KEEP the literal as a deliberate tripwire** | zero | cheapest, and **cheaper today than when the issue was written** (one site, not three) | a hand-typed number that reds on every legitimate token addition — the shape §12.5 bans, and #1956 cost four commits over five days |

**My reading of the fork, for the owner, not a decision:** A's benefit shrank (one site, not three) while its
hidden cost surfaced (it copies the generator's null rule). **B is the only arm that does not re-implement
anything**, and it is the arm that makes A's count a corollary. If the owner wants one word, the honest
question is now *"A or B"*, and the reason to prefer B is that A's derivation can be right about the contract
and wrong about the emitter.

**Classification: STILL MISSING (undecided by design) — needs-owner.** Proposed transition: **stays in Needs
owner**, with the body amended by the two measured corrections above (the fixture spellings are already gone;
the predicate is the two-term sum, not `cssTargets` partitioned by placement). Do not dispatch arm A against
the current issue text.

## 3. Coherent repair chunks (2 lane-sized chunks)

### Chunk 1 — `no-blanket-suppression`: land the ruled A+B split (#2063 half 1)

One area, one cold read, one commit.

- **Files:** `tooling/src/verify/gates/no-blanket-suppression.ts` (split), a new sibling final policy module for
  arms A+B, `tests/tooling/verify/gates/no-blanket-suppression.repo.int.test.ts` (the arm-C pin stays; the A+B
  pins move or gain a family test), `tooling/src/verify/gates/conversion-refusal-liveness.ts:25,35` and the
  `CONVERSION_REFUSAL` declaration in the legacy module (the census must now name arm C, not the module).
- **Cut direction:** arms A (harness fileset, working tree, TS/TSX) and B (every other biome-linted file from
  the TRACKED corpus, minus biome.json's top-level ignores) → a `defineGate` policy over the shipped
  `tracked-files` + `authored-text` kinds, which the header at `:36-40` already certifies as unblocked. Arm C
  (`git grep --cached` + `git show :<path>` per candidate blob) STAYS a legacy `GateDescriptor` and stays fully
  armed — §12.4 residual 1 is preserved for arm C alone. The two must share ONE directive reader
  (`lib/suppression-directive.ts` `readDirectiveComment`); a second grammar is the failure mode.
- **Header obligations:** the legacy remnant's refusal narrows from WHOLE-MODULE to ARM C (the `:17-19` /
  `:36-40` contradiction is the whole reason this row exists), and BOTH modules state the split plus the
  **catch-regression warning** the ruling names — converting arm C away would be a catch regression dressed as
  progress (#954: a stale staged blob commits while every working-tree check reads clean).
- **Proof shape:** the A+B policy declares `mustPass`/`mustFlag` rows for each arm and a `mustRefuse` for the
  §4.5 anchor; arm C keeps its existing planted-blob repo-int pin, which must be RE-RUN and shown still red on
  a planted staged blob whose working file is clean — that pin is the only thing standing between the split and
  a silent catch regression. `pnpm test:scoped tests/tooling/verify/gates/no-blanket-suppression.repo.int.test.ts`
  plus the new family test; the planter (`gate-conformance.repo.int`) is orchestrator-only and is owed at the
  barrier.
- **Hazard to brief:** read-first §0 ruling 1 says nothing gets to refuse to convert; the SPLIT **is** the
  resolution of that ruling for this module, not a collision with it. A lane that reads `:17-19` and stops has
  inherited a snapshot (§0 ruling 3). And `suppressions.ts:83-89` states why the two are NOT one family — the
  loader refuses a family string with one final member that is not its own id, so **do not give the new policy
  the `suppressions` family**.

### Chunk 2 — the two never-verified doors: `workItem` liveness (#2070) + the run-door control (#2225 half b)

Both are "an instrument reports something it never measured", both live in `tooling/src/verify`, both are
proved by a planted control at the REAL door. One lane, one commit.

- **#2070 — the barrier script.** New op beside `ops/ledgers-fresh.ts` (its own verb; it does network I/O, so it
  must NOT ride inside `ledgers:fresh`'s pure derivations and must NOT be a policy arm — the owner-approved
  forge ruling). It censuses every FINAL policy's `workItem` through the policy loader (never a grep — the
  roster is `check:policy-conformance`, and today's population is exactly three: `over-art-plate-arm` 2024,
  `policy-refusal-coverage` 2184, `policy-family-readers` 2187), asks the board through
  `tooling/src/workboard/cli.ts`, and reds on a CLOSED number. Proof shape: a planted CLOSED number reds and a
  live one passes, **in the same invocation** — and a network failure must be a loud REFUSAL (exit 2, "the run
  is not a verdict"), never a clean zero. **The fix must also repair the two live carriers it will immediately
  red on** (#2024 and #2184 are both CLOSED today) — either by minting live successor rows or by promoting the
  policies off `warning`; a barrier script that lands red is a barrier script that gets bypassed.
- **#2225 half (b) — the run-door control.** `tests/tooling/verify/ops/run.int.test.ts`. The harness already
  exists in that file at `:120-175`: `fakeBin` + a scratch `run-verify.ts` that imports the REAL `runVerify` and
  spawns it. Reuse it — register (or shadow) a stage whose `argv[0]` cannot resolve on the child's PATH, let
  `runOneStage` settle it at `run.ts:320` (`childExit: result.code`, `null`), and assert on the process's actual
  stdout that `NO VERDICT: 1 stage(s) RAN AND MEASURED NOTHING` names it and that
  `reports/verify.json`'s `noVerdict` array carries it. Negative control in the same test: with the binary
  present, no NO-VERDICT block and an empty `noVerdict`. Do NOT touch the exit contract — half (a) is REFUSED and
  the refusal is recorded at `exit-classifiers.ts:99-101`; this is a VISIBILITY pin only.
- **Hazard to brief:** `run.int.test.ts` spawns detached children with an isolated PATH and a scratch host-pool
  root; the existing arms are load-sensitive (`scaledBudget`). Never wrap a run in your own `timeout` — exit 124
  is exit-2 class, not a verdict.

## 4. Proposed patches

**None written and none applied.** Every remaining item is a build, not a text edit, so a `.patch` would be a
guess at a design. The three ledger-cell flips below are one-word `state` edits the integrator owns by the
ledger's own maintenance rule and are listed as coordinates, not as a patch file:

- `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:549` — mirror family L10, `OPEN (board #2136,
  refuted 2026-09-13: a fourth false-SHA carrier survives …)` → **CLOSED** at `8c165cd9f`; the refutation note
  is itself stale, the fourth carrier was fixed 36 minutes after it was filed.
- `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:818` — cb-v-wave-9b, the fourth carrier,
  `OPEN (board #2136)` → **CLOSED** at `8c165cd9f`.
- `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:765` — cb-v-wave-8a L3, `duplicate-action-doors`
  count budget, `OPEN (board #2101)` → **CLOSED** at `8fc7eb6dd`; all three cited patterns are absent at HEAD.

The class rollup must be re-derived by the ledger's own stated method after those three flips — three `state`
cells DO move bins, unlike `56ae6a8cf`'s in-prose edit.

## LEDGER ROWS (2 rows)

| Family | Where | Defect | Class | State | Receipt |
| - | - | - | - | - | - |
| warning debt | cb-adj-policy · `tooling/src/verify/gates/policy-refusal-coverage.ts:422` | a SECOND warning policy names a CLOSED issue: `workItem: 2184` — *"policy-refusal-coverage: a fact/resource consumer without a mustRefuse row … forge recommendation #1"* — is CLOSED on the board, so two of the three warning-severity policies on the tree point at closed rows and #2070's body knows only about the first. `lib/policy-validation.ts:426-433` validates the number's SHAPE (own enumerable positive safe integer) and never its openness; no barrier-script census exists beside `ledgers:fresh` | other (warning debt liveness) | **OPEN** (board #2070) | `grep -rn 'severity: "warning"' tooling/src/verify/gates/` → exactly 3 (`over-art-plate-arm:159` wi 2024 · `policy-family-readers:262` wi 2187 · `policy-refusal-coverage:422` wi 2184); `gh issue view` this session: 2024 CLOSED · 2184 CLOSED · 2187 OPEN. Tree-wide `workItem` census 51 files (`defineGate` control 344) — no census reader anywhere |
| the refutation ledger | cb-adj-policy · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:549,765,818` | three `state` cells read OPEN for work that landed, and **two of the three were fixed within minutes of the report that filed them** — `:818` (the mirror family's fourth false-SHA carrier, filed by cb-v-wave-9b at `865e7050c` 19:59) was closed by `8c165cd9f` at 20:35, and `:765` (`duplicate-action-doors`' count budget, filed by cb-v-wave-8a at `e417baa5b` 19:04) was closed by `8fc7eb6dd` at 19:11. `:549`'s state cell additionally carries a 2026-09-13 refutation note that is itself stale. Maintenance rule 1 (*"NO ROW OUTLIVES ITS FIX"*) again, and this is the same class as `:632` | other (ledger staleness) | **OPEN — new** | `8c165cd9f`: `git log -S 6b1d01be0` names it for all four carriers; four headers read `6b1d01be0` and `git rev-parse aecbc6c6c^` agrees. `8fc7eb6dd`: `grep -n "row?.count ?? MIN_DOORS\|live < row.count\|budget \${row.count}"` on `duplicate-action-doors.ts` → zero, `MIN_DOORS` survives only as the class definition at `:29`; `duplicate-action-doors.test.ts` 7/7 |

ledger rows OWED: 2

## WHAT I DID NOT COVER

- **No whole-tree verdict of any kind.** No `pnpm check`, no `check:structure` (bounded or otherwise), no
  `check:policy-conformance`, no whole-tree lint or typecheck, no CT — the root held those slots and the brief
  fenced them. So: the corpus partition (261 final / 44 legacy) is quoted from read-first §2's dated
  measurement, **not** re-derived here, and any claim of mine about a module's FINAL/LEGACY status is a read of
  its `defineGate` call, not a loader census.
- **`css-length-tokens`' arms are read, not driven.** It is a LEGACY module, so its proof rows are visible only
  to the orchestrator-only planter `gate-conformance.repo.int`. I verified the count-bearing rows are gone by
  reading the tables and by the `count: [0-9]` sweep with its 299-file control; I did not prove the 13
  `(file, candidate)` rows each match exactly one occurrence on the real tree. That planter run is already owed
  by primary and is the honest closure receipt for the `e7e3f083b` half.
- **#2063 half 2's 65 grant rows were not each driven.** I ran `suppressions-family.suite.test.ts` (9/9) and read the
  conversion header's own census figures (597 / 283 / 65, and 46 source + 19 tests grants); I did not
  independently re-derive the 597 occurrences or confirm each grant is consumed exactly once on the real tree —
  that is the `stale-reviewed-grant` engine's job and it runs in `check:structure`, which I did not run.
- **#2230's generator side was derived arithmetically, not executed.** I did not run `packages/ui/tokens.build.ts`
  (Style Dictionary, seconds, and a generator run on a shared checkout is the regenerator hazard). The
  `188 + 15 = 203` identity is derived from `tokens.json` + `theme.css` + a read of `renderPortableToken`'s
  switch; a byte-identity check of the committed `theme.css` against a live generator run — which is arm B
  itself — is the thing I could not do and the thing arm B exists to do.
- **#2070's "the 4 surfaces still report" premise** (from the issue body) was not re-measured; it needs a
  rendered/`check:structure` pass. It does not bear on the classification — the `workItem` points at a closed
  row whether or not the surfaces report.
- **I did not read the LAW doc (`gate-runtime-standardization.md`, 223 KB) or the playbook end to end**, per
  read-first §1b's lookup rule. I read read-first in full and opened the specific mechanisms each row needed
  (§12.4/§12.5 dispositions via `exception-authority-census.md`, §5b.5's header demand via the mirror rows,
  §4.4 and §12.3 via the module headers that cite them). Where a section is load-bearing to a fix spec above I
  cite the module header that states it, not the design doc.
