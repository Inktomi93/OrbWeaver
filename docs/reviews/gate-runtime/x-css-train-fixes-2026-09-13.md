---
kind: review
status: active
updated: 2026-09-13
---

# `cb-x-css-train-fixes` — the three refuted cells of the CSS train, fixed

Warm-leg rework of `17a59099b` / `a97454714` / `2dabae9ce` against
[`v-css-train-3-2026-09-13.md`](v-css-train-3-2026-09-13.md). Three commits, one per board row, in the
briefed order. Base at start: `c810fee07`; rebased TWICE while the floor ran (main moved), final parent
`af096b664`, and the whole floor below was re-run on that tree. Shas are the FINAL ones.

| Commit | Row | Subject |
| - | - | - |
| `3c18e88db` | #2292 | `tokens-contract` — the receipt denominator was a FINDING census |
| `e8593887a` | #2293 | `seed-theme-ink-contrast` — coupled site, unpinned blindness arm, private CSS parser |
| `75b99ea89` | #2294 | the `css-home-topology` pair's residue — one narrowing, two statuses, two false sentences |

## 1. #2292 — `tokens-contract`

**What changed.** `members: result.scannedTokens` → `members: contract.paths.length`, and the token census
moves into the receipt SOURCE (`tokens-contract [tokens scanned=310]`). Two rows added: a `mustFlag` on a
`{not json` vault, and the `empty` `mustRefuse` the one declaration was missing. Header records the
denominator rule and both reachable statuses; the family test's receipt pin now asserts the whole
population receipt (`members: 7`) rather than only its source, and its prose no longer says the receipt
names the token census.

**RED-FIRST.** Both new rows were written against the UNMODIFIED source first. `verifyPolicyProofs` then
returned exactly one failure — the malformed row, and with the verifier's predicted message:

```
FAILURES=1
  mustFlag[2] :: PASS TOOL ERROR [receipt] policy receipt refused:
                 population "tokens-contract" resolved zero members
```

The `empty` `mustRefuse` passed on the unmodified source, which is the honest reading of that half: it was
a §4.5 GAP (a reachable status nothing pinned), not a defect. After the one-line denominator change,
`FAILURES=0`.

**§4.6 differential, re-driven, same bytes both engines.** Frozen legacy from
`git show 1692583d6~5:tooling/src/verify/gates/tokens-contract.ts` (materialized as an untracked sibling in
`gates/`, deleted afterwards) through `lib/pass.ts#runPass` over a real `mkdtemp` corpus carrying the seven
canonical documents with `tokens.json = {not json}`; final through `runPolicyPass` over the same bytes as
an overlay on the same root. The legacy module has exactly ONE relative import (`../contract/gate.ts`,
resolving in place), so no import rewrite was needed and §4.6's "an unanchored rewrite corrupts both
engines identically" hazard does not apply here.

| | legacy (`1692583d6~5`) | final |
| - | - | - |
| BEFORE (`HEAD` policy) | `findings=1` `json.parse` @ `packages/ui/src/tokens/tokens.json:0:0` | `effective=0 withheld=["tokens-contract"] toolErrors=1` — `[receipt] … resolved zero members`; receipt `members: 0` |
| AFTER (this commit) | `findings=1` `json.parse` @ `packages/ui/src/tokens/tokens.json:0:0` | `effective=1` `json.parse` @ `packages/ui/src/tokens/tokens.json:1:1`; receipt `members: 7`, source `tokens-contract [tokens scanned=0]` |

Same file, same token, byte-identical message text. The only surviving delta is an **ANCHOR MOVE**
`0:0 → 1:1` (§4.6 category 6) — the whole-module class the conversion already carries — and the module's
marker census is `0 = 0 = 0`, so no positioned waiver is orphaned by it.

## 2. #2293 — `seed-theme-ink-contrast`

### (a) the coupled site — 2 → 0, receipted

`finding-overload-provenance`'s `markersIn` matches the marker form in the file's FULL TEXT and exempts
only string/template/regex spans, so a `//` comment naming the `@` opener IS a marker to it. Both header
mentions are respelled without the opener — the spelling that gate's own module uses on itself
(`finding-overload-provenance.ts:9-10`) — and the header now states the mechanism so the next editor does
not restore it.

| `pnpm check:structure --check finding-overload-provenance` | verdict |
| - | - |
| BEFORE (base `c810fee07`) | exit 1, **3 violations** — `seed-theme-ink-contrast.ts:35:0` and `:52:0` MALFORMED, plus `css-var-defined.ts:294:18 column-derived` |
| AFTER (pre-rebase) | exit 1, **1 violation** — `css-var-defined.ts:294:18` only |

So **2 → 0 in this file**; the survivor is pre-existing and out of fence. See §5 for what the rebase
brought back.

### (b) the unpinned sheet-level blindness arm

NEW `mustFlag[8]`: `mustPass[0]`'s corpus with ONE ground made unresolvable
(`--color-popover: var(--nope)`), `count: 1 · messageIncludes: "could not resolve a colour for --color-popover @ hearth"`. Every other ground resolves and the shipped 0.50 arm clears all seven, so the
sheet verdict is the only thing the row can report.

**Cut direction and receipt.** `k08a`: `for (const miss of unresolved) {` → `for (const miss of []) {`,
anchor asserted to occur EXACTLY ONCE, written to a scratch SIBLING module in the same directory (serial in
the name), `rmSync` in a `finally`:

```
CUT k08a rowsThatDied=1
  mustFlag[8] :: expected at least one effective finding but got 0
```

Tripwire direction, as a blindness arm requires: the cut makes the policy flag FEWER and the `mustFlag`
goes green. Exactly one row dies and it is the new one. The module's `mustFlag[1]` comment — the one that
recorded WHY the arm was unreachable — now points at the row that reaches it.

### (c) the private CSS parser, FOLDED

`lib/seed-theme-ink.ts`'s `DECLARATION` / `THEME_BLOCK` / `SEED_BLOCK` regexes and its hand-rolled
balanced-brace `blockBody` scan over `theme.css` TEXT are DELETED. `readSeedPalettes` now takes
`readonly CssDeclarationFact[]`: the `@theme` at-rule owner carries the base palette, the
`[data-theme="x"]` style-rule owner carries each seed and its own `color-scheme`. The consumer passes
`css.declarations.filter((d) => d.file === theme.path)` off the `product-css` resource it already declares.
**Nothing was left behind and nothing was kept "for now"** — the module now reads nothing at all.

**Parity, measured on the REAL `packages/ui/src/styles/theme.css`, not argued:**

```
OLD (private parser)  palettes=3  hearth/dark/81  light/light/81  mocha/dark/81
NEW (declaration facts) palettes=3  hearth/dark/81  light/light/81  mocha/dark/81
IDENTICAL_TO_OLD_PARSER=true      (serialized name/scheme/sorted-vars, byte comparison)
```

Three deltas, all in the WIDENING direction and none reachable by the shipped sheet, recorded in both
headers rather than discovered later: a final declaration with no `;` before its `}` is now read (the old
regex required the semicolon); every `@theme` block merges rather than only the first; and a declaration
nested inside an at-rule WITHIN `@theme` is attributed to that inner at-rule instead of to the theme block.
The `[data-theme="x"]` predicate is deliberately UNANCHORED against the selector list, which is the same
containment test the retired text scan applied — a narrowing there would have been an unpinned claim.

**Nine-grant receipt after the fold**, on the rebased tree:

```
✓ seed-theme-ink-contrast · final reviewed-grant/error · population 1686 source · 5 resource ·
  seed-theme-ink-contrast [ink×ground×seed pairs=5856]: 3 member(s) · css-inventory:product: 3035 resource(s) · granted 9
final policies: 1 ran · raw 9 = waived 0 + granted 9 + effective 0 · 0 alarm(s) · 0 tool error(s) · 0 withheld
```

`raw 9 = granted 9 + effective 0`, zero alarms — the nine rows still consume 1:1. The `(carrier, ink)`
identity cut still discriminates: `seed-theme-ink-family.suite.test.ts` passes 5/5, including the arm where a
grant naming the FILE with the WRONG ink licenses nothing and raises `stale-reviewed-grant`, and the arm
where a grant whose ink stopped being painted stales. The pair-count and the ink×ground×seed total are
unchanged by the fold (`5856`, `3 member(s)`).

## 3. #2294 — the pair's residue

- **(a) `playwright-css-topology` `mustPass[2]`** — the CT boot with a COMMENTED product-stylesheet import.
  Green at tip; cut `p12a` (`blankTsCommentsInText(text).matchAll(pattern)` → `text.matchAll(pattern)`,
  anchor unique, scratch sibling, `rmSync` in `finally`) → `rowsThatDied=1`, `mustPass[2]` only:
  *"expected zero effective findings but got 1: CT must import @orb/client/styles and no product or harness
  stylesheet directly"*.
- **(b) `product-css` `malformed`** — one `mustRefuse` per consumer, both on an unclosed rule block, both
  expecting `product-css is malformed: unsupported or malformed CSS in packages/ui/src/styles/theme.css`.
  Both headers now name both statuses, with WHY the pin is load-bearing in each: a half-read sheet would
  feed the graph walk a truncated statement set, and would reach the ink policy as ZERO palettes and be
  reported as instrument blindness about the TREE.
- **(c) `sanctioned-css-homes.ts:42`** — the sentence is true now and says why `empty` cannot be a row (a
  proof row's substrate is a `files` MAP; a map cannot spell an existing directory with no members), naming
  the `runPolicyPass` arm that holds it. The PIN did not change; the claim about where it lives did.
- **(d) `check-gates.repo.int.test.ts`** — `#2183` → `#2182` with its receipt (`a97454714`'s own subject).
  **The suite was NOT run: it is a planter.**
- **Carried here, belonging to #2292:** the roster's `tokens-contract` row called the token census the
  gate's DENOMINATOR. One line changed. `pnpm format:docs` deliberately NOT run on that multi-lane file,
  and the drift is not mine — control: `doc-catalog format --check` on the file reports "not formatted"
  with the file restored to HEAD, unmodified, exactly as it does with my line.

## 4. Floor, re-run on the REBASED tree (`af096b664` + 3)

| Check | Result |
| - | - |
| `verifyPolicyProofs` ×4 (`tokens-contract`, `seed-theme-ink-contrast`, `playwright-css-topology`, `sanctioned-css-homes`) | `FAILURES=0` each |
| `pnpm check:structure --check <id>` ×4 | all exit 0 · `0 alarm(s) · 0 tool error(s) · 0 withheld` · per-policy lines quoted above and in the commits |
| `pnpm check:policy-conformance` (whole) | exit 0 — **261 final policies · 3102 proof rows · 19 refusal rows · 0 failure(s) · 216 grant rows · 0 invalid** |
| `pnpm gate:contract` | 339 findings across 305 modules; **ZERO name any of the four** (grep count 0) |
| `pnpm test:scoped` the three family tests + `tests/tooling/token-contract.test.ts` | 4 files, **29/29**, exit 0 |
| `pnpm exec biome check <7 files> --diagnostic-level=error` | exit 0 |
| `pnpm exec eslint <7 files>` | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | exit 0 |
| literal grep of the four ids across `tests/tooling/**` | 5 files: the three family tests, `token-contract.test.ts` (all run), and `check-gates.repo.int.test.ts` (a PLANTER — comment-only edit, not run) |
| `pnpm check:docs` | RED, whole-tree baseline — 162 unformatted files plus one REFUSED (`v-fix-wave-4-2026-09-12.md`), none of them mine; the roster control is in §3 |
| `pnpm check:structure --check finding-overload-provenance` | my two sites **2 → 0** (`e8593887a`); the remaining 3 are `css-var-defined.ts:294` (pre-existing) + two baseui lines landed by `17297f298` (**#2297**, primary's lane — not mine, ruled: do not touch) |

**Per-policy deltas.** `tokens-contract`'s receipt line moved from `tokens-contract: 310 member(s)` to
`tokens-contract [tokens scanned=310]: 7 member(s)` — the whole point of the fix. Everything else moved
only with the rebase: `seed-theme-ink-contrast` `population 1685 → 1686 source`, `playwright-css-topology`
`4262 → 4264`, `sanctioned-css-homes` `4197 → 4198 resource`, `gate:contract` `370/303 → 339/305`,
conformance `254/3021 → 261/3102 policies/rows` — all of that is main's other lanes, and each of my own
numbers is unchanged across the rebase. Refusal rows `14 → 19`: three of the five are mine (one `empty`,
two `malformed`).

## 5. Deviations and things the orchestrator owns

1. **THE #2293(a) DEFECT CLASS RE-LANDED FROM ANOTHER LANE, OUT OF MY FENCE.** On the rebased tree
   `finding-overload-provenance` is back to 3 violations, and my two are gone: the new pair is
   `baseui-derives-not-respells.ts:15:0` and `baseui-derives-not-respells-health.ts:22:0`, both HEADER PROSE
   naming the retired marker's `@` opener, landed by `17297f298` ("the baseui-read family converts…"). The
   `baseui-*` gates are primary's per my fence, so I did not touch them; SendMessaged at the time with the
   default stated. **RULED by the orchestrator: the default stands — do not touch the two files; they are
   recorded on #2297 with the one-word fix.** Fix is one word per line. Filed as a ledger row below.
2. **Scratch modules inside `gates/`.** The differential and the two cuts needed sibling modules in
   `tooling/src/verify/gates/` (relative imports must resolve, and the corpus loader imports every file in
   that directory, so a scratch there tool-errors any concurrent loader-scanning run). Every one was
   removed immediately — the cut harness in a `finally`, the two frozen descriptors by hand — and every
   `check:structure` receipt in this report was taken with none present. `git status --short` was verified
   empty after each.
3. **The roster line is a #2292 claim landed in the #2294 commit.** Named as such in that commit message
   rather than amending a commit whose floor had already been run.
4. **`token-contract.test.ts:163,371` still assert `scannedTokens`** — untouched and correct: they are
   about the VALIDATOR's census, not about the policy's receipt, and the census is still published.

## LEDGER ROWS (1 row)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `baseui-derives-not-respells` + `-health` | x-css-train-fixes · `tooling/src/verify/gates/baseui-derives-not-respells.ts:15`, `baseui-derives-not-respells-health.ts:22` | HEADER PROSE naming the retired marker's `@` opener is read by the LIVE legacy `finding-overload-provenance` gate as a MALFORMED marker — the SAME class as #2293 row 2, re-landed by a different lane and masked by the standing whole-tree red. Fix is one word per line: drop the opener, as `finding-overload-provenance.ts:9-10` does on itself | coupled-site regression | **OPEN** (board **#2297**, primary's lane — this lane was ruled OFF it) | `pnpm check:structure --check finding-overload-provenance` on `af096b664` + this branch → exit 1, 3 violations: these two plus the pre-existing `css-var-defined.ts:294:18`. The two `seed-theme-ink-contrast` sites from #2293 are GONE. Introduced by `17297f298` |

`ledger rows OWED: 1`

Closed by this branch: cb-v-css-train-3 rows **1, 2, 3, 4, 5, 6, 7, 8, 9** — all nine (boards #2292, #2293,
\#2294).

## 6. Proposed lessons (report text — the orchestrator owns the memory write)

**A CONSUMER RECEIPT WHOSE `members` IS A FINDING CENSUS WITHHOLDS THE GATE'S LOUDEST FINDING.** The
verifier proposed this and the fix confirms the mechanism end to end: `receiptFailures` reds on
`count === 0`, so any subject whose failure mode is "I parsed nothing" turns into `policy receipt refused:
population "<id>" resolved zero members` and the finding never reports. The tell is a denominator that CAN
be zero on the input the gate exists to catch. Receipt what the policy MEASURED (the document count, the
palette count — a number the provider's own refusal already floors above zero) and put the census in the
receipt `source` string, where a zero is data. Index line:
`[receipt census eats the finding](receipt-census-turns-a-finding-into-a-tool-error.md) — a receipt whose members is a finding census withholds the policy instead of reporting`.

**A CONVERSION'S HEADER PROSE IS INSIDE THE CORPUS ITS OWN FAMILY POLICES — three sites, two lanes, one
day.** Naming a retired marker's opener in a gate header makes the legacy marker-hygiene gate read the
comment as a malformed marker; it is invisible under the standing whole-tree red, and it has now happened in
`seed-theme-ink-contrast` (fixed here) and in the `baseui-derives-not-respells` pair (landed while this lane
ran). The house spelling is the one the auditing gate uses on ITSELF: name the marker without its opener and
say in prose that the opener is deliberately not written. Any brief that retires a marker vocabulary should
carry that sentence. Index line:
`[prose about a marker IS a marker](converted-header-prose-trips-the-marker-hygiene-gate.md) — naming a retired opener in a gate header reds the legacy hygiene gate`.

**A PRIVATE PARSER FOLD IS A PARITY MEASUREMENT, NOT A REWRITE.** Folding `readSeedPalettes` onto the shared
`product-css` declaration facts was ~40 lines, and the load-bearing artifact was the byte comparison of the
old and new palette sets over the REAL sheet (`IDENTICAL_TO_OLD_PARSER=true`) plus the three widening deltas
written into the header. A fold with green proof rows and no parity receipt proves only that the fixtures
still pass — and the fixtures are exactly the inputs the private parser was written to handle. Index line:
`[fold owes a real-corpus parity byte-compare](private-reader-fold-owes-a-parity-receipt.md) — proof rows cannot see a fold's behaviour change; the real subject can`.

**A §4.5 STATUS GAP AND A §4.6 CATCH-REGRESSION LOOK IDENTICAL IN A BRIEF AND ARE NOT.** Both arrive as
"this status/arm has no row". Write the row against the UNMODIFIED source FIRST and read which one you have:
the malformed-vault row came back RED (a live defect the fix closes), the `empty` refusal row came back
GREEN (a real gap, nothing broken). Reporting the second as a fixed defect, or the first as merely a missing
pin, both misprice the row. Index line:
`[red-first separates a gap from a defect](red-first-tells-a-gap-from-a-catch-regression.md) — write the new row against the old source before you fix anything`.

## LEG 2 — the fold's NARROWING, found by primary's source review (`53d3d74ec`)

One commit on top of `75b99ea89`, no rebase (a live integration review owns the branch).

**The finding held.** `e8593887a` kept only declarations whose IMMEDIATE owner is the `@theme` at-rule or a
seed selector list, and the shared reader assigns a nested declaration to its INNER block, so a `--color-*`
one level down vanished from the palette. My leg-1 parity twin ran over the live `theme.css`, whose only
conditional is a TOP-LEVEL `@media` at `:224` — it never exercised the changed path. **A parity receipt
over a subject that does not reach the changed code is not a measurement of the change**, and the header's
"three deltas, all widening" was false on exactly that gap.

### Red-first delta table (frozen `e8593887a^` reader vs the folded one, same fixture bytes)

| case | LEGACY | NEW at `75b99ea89` | NEW at `53d3d74ec` |
| - | - | - | - |
| (a) `@supports` inside `@theme` | `hearth{x,y}` | `hearth{x}` — **`--color-y` LOST** | `hearth{x}` + `hearth @ @supports (color: oklch(0 0 0)){x,y}` |
| (b) `@media` inside `[data-theme=dusk]` | `dusk{x,z}` | `dusk{x}` — **`--color-z` LOST** | `dusk{x}` + `dusk @ @media (prefers-contrast: more){x,z}`, scheme `light` |
| (c) `& .x` inside `[data-theme=dusk]` | `dusk{x,w}` | `dusk{x}` | `dusk{x}` — excluded ON PURPOSE |
| control (flat seed override) | `dusk{x=0.9}` | identical | identical |

Real-sheet parity re-run after the repair: `palettes=3 hearth/dark/81 light/light/81 mocha/dark/81`,
`IDENTICAL_TO_OLD_PARSER=true` — the shipped sheet exercises none of the four deltas, which is now stated
in the header instead of being offered as the whole receipt.

### Adjudication, per case

- **(a) + (b) a conditional at-rule is an ARM of its palette**, `<palette> @ <prelude>`, built as the
  palette OVERRIDDEN — so BOTH the unconditional and the conditional value are judged. Legacy's last-wins
  merge is NOT restored: it replaced the unconditional value and hid the base arm, which is the opposite
  blindness. An arm INHERITS its palette's polarity unless the block declares its own `color-scheme`
  (case (b)'s arm is `light`; taking the base default there would collapse every `light-dark()` to the
  wrong side — measured, and the reason `SeedDraft.scheme` is now optional), and it composes the RAW maps
  so the collapse happens ONCE under the arm's own scheme.
- **(c) a nested PLAIN SELECTOR is NOT the palette.** Its subject is a descendant element, so a
  `text-<token>` resting on the seed never resolves against it. Legacy counted it — a defect of the
  balanced-body read, not a capability. The pin asserts the ABSENCE, so the exclusion is a claim.

### The capability, and a REFUSAL with its receipt

**Half of the ancestry already existed and I did not re-invent it:** `lib/css-rules.ts:280`
`atRulesContaining` is the shared at-rule ancestry reader, and two gates already ask ancestry through it
(`motion-token-purity.ts:167`, `rest-transform-grid.ts:286`, both with header prose saying `owner` cannot
answer). What did NOT exist is the STYLE-RULE half: `CssRule` published `braceStart` and no `end`, so
"which selector encloses this offset" was unanswerable by ANY consumer. Landed on the resource, additively:
`CssRule.end` (the parser already knew it at `closeFrame`) + `rulesContaining()` beside its twin.
`CssDeclarationFact`'s shape is UNTOUCHED, so the three other fact consumers are unchanged — checked with
`pnpm ast refs CssDeclarationFact` (17 hits / 6 files) and `refs CssRule` (11 hits / 3 files; `toRule` is
the only constructor in source, and the one hand-built literal is the test below).

### A pre-existing RED the control found

`tests/tooling/verify/ops/resource-tree.test.ts`'s whole-object `toEqual` never learned the `statements`
key that `17a59099b` (#2183) added to every `AuthoredCssFile`. **That suite has been failing on main since
that commit**, invisible because `tests/tooling/**` is `--full`-only. Proven, not assumed: both files
restored to HEAD (`cp` + `git show`, restored by `mv`, `git status` verified) and re-run — still red,
`+ "statements": []`. Both missing keys land in this commit.

### Floor (scoped only; a whole-tree structure baseline is live on main)

| Check | Result |
| - | - |
| `verifyPolicyProofs` ×3 (seed · playwright-css-topology · sanctioned-css-homes) | `FAILURES=0` each |
| `pnpm test:scoped` seed-family · css-rules · resource-tree · css-home-topology-family · token-contract-family · motion-token-purity · integer-line-boxes · over-art-plate-arm | **8 files, 52/52, exit 0** |
| bounded `runPolicyPass(seed-theme-ink-contrast)` on the real tree (3,388 files) | `toolErrors=[] withheld=[] effective=0 granted=9`; receipts `[ink×ground×seed pairs=5856] members:3` + `css-inventory:product 3035/0` — identical to the pre-leg `check:structure --check` receipt. (The harness drives ONE policy against the WHOLE waiver table, so its `ordinary-waiver` alarms are unknown-policy noise by construction, not a verdict; `check:structure` reported `0 alarm(s)` for this policy at leg 1.) |
| `pnpm exec biome check` + `pnpm exec eslint`, 7 touched code/test files | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | exit 0 |
| `doc-catalog format --check` on the roster | RED — pre-existing whole-file drift, controlled in §3: the file reads "not formatted" restored to HEAD too |
| `tests/tooling/check-gates.repo.int.test.ts` | **REFUSED, with receipt.** It is one of the four `__g_` PLANTERS, and `gate-runtime-read-first.md` §4 makes a planting suite and a `check:structure` on main mutually exclusive in BOTH directions — the brief's own premise is that a whole-tree baseline is running. Running it would void that baseline. My change to it is a COMMENT. |

### LEDGER ROWS (2 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `seed-theme-ink-contrast` | x-css-train-fixes leg 2 · `tooling/src/verify/lib/seed-theme-ink.ts:110` (at `75b99ea89`) | The fold onto the shared declaration facts read only each declaration's IMMEDIATE owner, so a `--color-*` nested one level inside `@theme` or inside a `[data-theme]` seed left the palette — a NARROWING the module header denied ("three deltas, all in the widening direction"). Invisible to the real-sheet parity twin because the shipped `theme.css` has no such nesting | §4.6 catch-regression · false header claim | **CLOSED (`53d3d74ec`)** | frozen `e8593887a^` reader vs the folded one on the same bytes: case (a) lost `--color-y`, case (b) lost `--color-z`. Repaired via `CssRule.end` + `rulesContaining()` on the shared reader; four cases pinned in `seed-theme-ink-family.suite.test.ts`, reader pinned both directions in `css-rules.test.ts` |
| `tests/tooling/verify/ops/resource-tree.test.ts` | x-css-train-fixes leg 2 · `tests/tooling/verify/ops/resource-tree.test.ts:112` | Its whole-object `toEqual` over an `AuthoredCssFile` never learned the `statements` key `17a59099b` added, so the suite has been RED on main since #2183 — unobservable because `tests/tooling/**` is `--full`-only | stale coupled literal · silent suite red | **CLOSED (`53d3d74ec`)** | both files restored to HEAD and re-run: still `1 failed \| 4 passed`, `+ "statements": []`. Not caused by this lane; found by its control |

`ledger rows OWED: 2`

### Proposed lesson (report text — the orchestrator owns the memory write)

**A PARITY RECEIPT IS ONLY AS GOOD AS THE SUBJECT'S COVERAGE OF THE CHANGED PATH.** The leg-1 fold shipped
with a byte-identical palette comparison over the real `theme.css` and a header claiming every delta
widened; the real sheet has no nested conditional, so the twin could not reach the narrowing at all and the
claim was false the day it was written. When a fold replaces a reader, the parity subject must be chosen to
EXERCISE the difference — enumerate the input shapes the old reader accepted (here: nesting, missing
semicolons, repeated blocks) and build a fixture per shape, THEN run the real corpus as a regression check
rather than as the proof. Index line:
`[parity needs a subject that reaches the change](parity-receipt-needs-a-covering-subject.md) — a byte-identical real-corpus diff proves nothing about a path the corpus never takes`.

## LEG 3 — the subject rule, and the half-built exclusion (`4552bdf24`)

One commit on top of `53d3d74ec`, no rebase. The independent review of leg 2 held: the descendant
exclusion was built for the NESTED spelling only, because `rootName` ran the unanchored `SEED_SELECTOR`
over the whole `selectorList` rather than over what the rule STYLES.

### Red-first shape matrix (live reader, before → after)

| shape | BEFORE (`53d3d74ec`) | AFTER (`4552bdf24`) | verdict |
| - | - | - | - |
| `[data-theme="dusk"] .x` — flattened descendant | **absorbed `--color-w`** | excluded | DEFECT, closed |
| `[data-theme="dusk"] { & .x { … } }` — nested twin | excluded | excluded | the two spellings now AGREE |
| `[data-theme="dusk"] + .y` — SIBLING subject | **absorbed `--color-s`** | excluded | same defect, one combinator over — NOT in the finding |
| `[data-theme="dusk"].foo` | root | root | positive control, unchanged |
| `html[data-theme="dusk"]` | root | root | positive control, unchanged |
| `[data-theme="dusk"]:where(.a, .b)` | root | root | positive control, unchanged |
| `[data-theme="dusk"] { .card & { … } }` | **silently DROPPED** | ARM `dusk @ .card &`, scheme `light` | reachable arm restored |
| `[data-theme="dusk"], [data-theme="dusk"] .x` | contributes (accident of the regex) | contributes (per complex selector) | outcome preserved, now deliberate |

Subject reads behind those rows, printed in the same invocation:
`subject([data-theme="dusk"] .x) = .x` · `subject([data-theme="dusk"].foo) = [data-theme="dusk"].foo` ·
`subject(html[data-theme="dusk"]) = html[data-theme="dusk"]` ·
`subject([data-theme="dusk"]:where(.a, .b)) = [data-theme="dusk"]:where(.a, .b)` ·
`subject(.card &) = &` · `subject(& .x) = .x` · `subject([data-theme="dusk"] + .y) = .y`.

### Adjudication, per shape

| shape | verdict | why (CSS subject semantics) |
| - | - | - |
| flattened descendant `[data-theme="x"] .a` | NOT the palette | the subject is `.a`; the seed's own text never resolves against it. Byte-equivalent to the nested `& .a`, so the two spellings must agree |
| sibling `[data-theme="x"] + .b` | NOT the palette | same test, subject `.b` |
| `[data-theme="x"].foo` · `html[data-theme="x"]` · `[data-theme="x"]:where(.a, .b)` | ROOT, MERGED into the seed | the subject IS the seed element. A qualifier narrows WHICH elements carry the seed, not what the palette is — so it merges last-wins exactly as a second bare `[data-theme="x"]` block does. Recorded as a declared limit and pinned |
| `.card &` | **ARM** `<seed> @ .card &` | the subject is still the seed, under an ANCESTOR condition — the same shape as a conditional at-rule. The seed element really takes that value inside a card, and this gate's job is every ground an ink can rest on. Leg 2's prose called it a descendant subject and DROPPED it; that sentence is named as retired in the header, not edited away |
| selector list with several complex selectors | decided ARM BY ARM | one list can carry both a seed subject and a descendant subject; the seed genuinely receives the value, so the palette carries it — but by per-selector decision, never by matching the list text |

### The capability — a REFUSAL with its receipt

The brief allowed adding a subject helper to the shared reader "if nothing yields the subject". **Nothing
needed to be added.** `lib/css-selector-writers.ts` is a TS-side writer census
(`collectSelectorWriters`/`visitSelectorWriterNode`) and `lib/css-family-selector-provenance.ts` yields
class/data HOOKS (`selectorClassHooks`, `selectorDataAttributes`, `selectorHooks`) — neither splits a list
into complex selectors nor yields a subject. `lib/css-rules.ts` already does both:
`splitSelectorList` (`:290`) and `selectorSubject` (`:379` — "the SUBJECT of a complex selector — its LAST
compound, i.e. what the rule actually styles", combinators recognised at bracket depth 0 so
`:where(.a, .b)` and `[attr="a b"]` stay attached), with `over-art-plate.ts:145` as its existing consumer.
Both are reused as-is; **no new helper, and `SEED_SELECTOR` was deliberately NOT anchored** — `^…$` would
have killed all three compound roots, which is why they are pinned as positive controls.

### Floor

| Check | Result |
| - | - |
| `verifyPolicyProofs` ×3 (seed · playwright-css-topology · sanctioned-css-homes) | `FAILURES=0` each |
| `pnpm test:scoped`, the same 8 suites as leg 2 | **8 files, 57/57, exit 0** (52 + the 5 new pins) |
| bounded `runPolicyPass(seed-theme-ink-contrast)`, real tree, 3,388 files | UNCHANGED — `toolErrors=[] withheld=[] effective=0 granted=9`; receipts `[ink×ground×seed pairs=5856] members:3` + `css-inventory:product 3035/0` |
| real-sheet palette parity | 3 palettes, `IDENTICAL_TO_OLD_PARSER=true` |
| `pnpm exec biome check` + `pnpm exec eslint`, both touched files | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | exit 0 |
| `check-gates.repo.int.test.ts` | not run, not touched this leg (planter — leg 2's refusal stands) |

### LEDGER ROWS (1 row)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `seed-theme-ink-contrast` | x-css-train-fixes leg 3 · `tooling/src/verify/lib/seed-theme-ink.ts:139-144` (at `53d3d74ec`) | `rootName` matched the unanchored `SEED_SELECTOR` against the whole `selectorList`, so a FLATTENED descendant (`[data-theme="x"] .a`) and a SIBLING (`[data-theme="x"] + .b`) were absorbed as the seed root while their nested twins were excluded — the same CSS answered two ways by authoring style. Separately, `.card &` was silently DROPPED as a "descendant subject" although its subject is the seed under an ancestor condition, losing a reachable palette arm | half-built narrowing · dropped arm · false header prose | **CLOSED (`4552bdf24`)** | before/after matrix over 8 shapes through the live reader (table above); membership now `splitSelectorList` → `selectorSubject` (shared, reused); 5 new pins in `seed-theme-ink-family.suite.test.ts` incl. flattened-EQUALS-nested and the three compound-root controls; real-tree verdict and receipts unchanged |

`ledger rows OWED: 1`

### Proposed lesson (report text — the orchestrator owns the memory write)

**AN EXCLUSION BUILT ON ONE AUTHORING SPELLING IS HALF A RULE.** Leg 2 excluded the descendant subject
through the nesting ANCESTRY and never noticed the FLATTENED spelling of the same selector was still
matching a list-level regex — one CSS meaning, two code paths, opposite answers. When a rule is about what
a selector MEANS, decide it on the parsed meaning (the subject compound) rather than on the text of
whichever form the fixture happened to use, and pin the two spellings ASSERTED EQUAL so the agreement
itself is the claim. The companion tell: the repair that anchors the pattern (`^…$`) is almost always
throwing away legitimate members — write the positive controls FIRST and the lazy repair becomes
unlandable. Index line:
`[one meaning, two spellings](exclusion-built-on-one-authoring-spelling.md) — decide a selector rule on the parsed subject, and pin the flattened and nested forms equal`.

## LEG 4 — a selector list is a SET of roots (`893d44b49`)

One commit on top of `4552bdf24`, no rebase. The review's blocker held on re-derivation
(`seed-theme-ink.ts:178-187` at that sha): `seedRootOf` `break`ed on the first matching root and
`rootOf`/`Placement` carried ONE name, so a list naming two shipped seeds updated one and dropped the
other. Leg 3's mixed-list pin used one root plus its DESCENDANT, so it could not see this — **the shape
nobody fixtures is the shape the prose is free to lie about.**

### Red-first receipt (all four shapes, one invocation)

| shape | BEFORE `4552bdf24` | AFTER `893d44b49` |
| - | - | - |
| (a) `[data-theme="light"], [data-theme="mocha"]` | `light{--color-q,--color-x}` · **`mocha{--color-x}` — value DROPPED** | `light{--color-q,--color-x}` · `mocha{--color-q,--color-x}` |
| (b) same list wrapping `@media (prefers-contrast: more)` | ONE arm: `light @ …`/light | `light @ …`/**light** · `mocha @ …`/**dark** |
| (c) `[data-theme="light"], [data-theme="mocha"] .x` | `light{--color-d}`, mocha clean | unchanged — mocha still clean |
| (d) `[data-theme="light"], [data-theme="light"].x` | files once | unchanged — files once |

### The four cases, adjudicated

| case | verdict | why |
| - | - | - |
| (a) two distinct valid roots | BOTH palettes carry the value | a list is a set of complex selectors and the declaration reaches every subject in it; the answer is a SET, not a first match |
| (b) conditional arm under several roots | one ARM PER ROOT, each with its own inherited polarity | the condition chain is shared and computed once, the arms fork at filing — a single shared arm would collapse both seeds onto whichever `color-scheme` was read first (`light`/light vs `mocha`/dark is the discriminating cell) |
| (c) valid root beside another seed's descendant | only the root contributes | the rule is "every root the list's SUBJECTS name", never "every seed the list mentions" — this row is what stops the fix over-firing |
| (d) duplicate root in one list | files exactly once | `Set`-deduplicated in `seedRootsOf`, so no census double-counts a seed a list names twice |

### The change

`seedRootOf` → `seedRootsOf` (Set-deduplicated, first-appearance order) · `rootName` → `rootNames` ·
`rootOf` carries `names` · `placementOf` → `placementsOf`, one `Placement` per root over a SHARED
condition chain · the filing loop iterates placements. Same `splitSelectorList` / `selectorSubject` — no
parser fork, no second reader, nothing else moved.

### Floor

| Check | Result |
| - | - |
| `verifyPolicyProofs` ×3 (seed · playwright-css-topology · sanctioned-css-homes) | `FAILURES=0` each |
| `pnpm test:scoped`, the same 8 suites | **8 files, 61/61, exit 0** (57 + the 4 new pins) |
| bounded `runPolicyPass(seed-theme-ink-contrast)`, real tree, 3,388 files | UNCHANGED — `toolErrors=[] withheld=[] effective=0 granted=9`; receipts `[ink×ground×seed pairs=5856] members:3` + `css-inventory:product 3035/0` |
| real-sheet parity | 3 palettes, `IDENTICAL_TO_OLD_PARSER=true` |
| was the defect reachable on today's sheet? | **NO, and here is the receipt:** `theme.css`'s only seed selectors are the bare `[data-theme="light"]` (`:244`) and `[data-theme="mocha"]` (`:290`); a grep for a comma-bearing seed rule returns **0**. It becomes reachable the moment the generator emits a shared block for two seeds |
| `pnpm exec biome check` + `pnpm exec eslint`, both touched files | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | exit 0 |
| CT · conformance stage · `check-gates` planter | not run — excluded by the brief (browser slot and whole-tree consumers in use elsewhere) |

### LEDGER ROWS (1 row)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `seed-theme-ink-contrast` | x-css-train-fixes leg 4 · `tooling/src/verify/lib/seed-theme-ink.ts:178-187` (at `4552bdf24`) | `seedRootOf` returned on the FIRST matching root and `Placement` carried one name, so a selector list naming two shipped seeds filed into one and silently dropped the other — including the conditional-arm path, where only one seed got an arm. The header claimed "decided per complex selector"; the code decided once | half-built rule · prose exceeds behaviour | **CLOSED (`893d44b49`)** | before/after over four shapes (table above): (a) mocha gains the value, (b) two arms with `light`/`dark` polarity, (c) the descendant still excluded, (d) the duplicate still files once. 4 new pins in `seed-theme-ink-family.suite.test.ts`; real-tree verdict, receipts and sheet parity all unchanged; the live sheet has no multi-root list (0 comma-bearing seed rules) so the defect was latent |

`ledger rows OWED: 1`

### Proposed lesson (report text — the orchestrator owns the memory write)

**A "PER-X" CLAIM OWES A FIXTURE WITH TWO VALID X, NOT ONE X PLUS A NEAR-MISS.** Leg 3 wrote "decided per
complex selector" and pinned a list carrying one valid root beside a DESCENDANT — a near-miss, which the
first-match code answers identically to the correct code. The defect needed two things the rule must treat
as PEERS. Same shape as the plural-vs-singular class generally: when a function's contract turns a
container into an answer, the discriminating fixture has ≥2 qualifying members, and the near-miss belongs
in a SECOND row so over-firing is caught too (here case (c)). Index line:
`[per-X needs two valid X](per-x-claims-need-two-qualifying-members.md) — a fixture with one valid member plus a near-miss cannot tell a first-match implementation from a per-member one`.

## LEG 5 — REFUSED with receipt: already fixed in leg 2, no commit owed

The row (measured on `dd00ebb78`) names `seed-theme-ink-contrast.ts:35,52` spelling the retired marker
opener WITH its `@`. **That is exactly the defect leg 2 closed** — `e8593887a`, whose subject is *"its
header was tripping a LIVE gate"* — and `dd00ebb78` is NOT an ancestor of this branch
(`git merge-base --is-ancestor dd00ebb78 HEAD` → exit 1), so the row was measured on a tree that does not
carry the fix. At `e8593887a^` the file did carry it at **exactly `:35` and `:52`**, which is what makes
the row a true reading of that tree and a stale one of this branch.

Re-derived here, not remembered — `pnpm check:structure --check finding-overload-provenance` on
`893d44b49`: **3 violations, and NONE in `seed-theme-ink-contrast.ts`** —
`baseui-derives-not-respells.ts:15:0` and `baseui-derives-not-respells-health.ts:22:0` (#2297, primary's
lane; this lane was ruled OFF them in leg 2 and they are still red on this branch because that fix is not
on it) plus the pre-existing `css-var-defined.ts:294:18`. Before = after = 3; my file's contribution is 0
both ways. The two mentions now sit at `:43` and `:60`, bare (`grep -n "@finding-overload-ok"` → no match,
exit 1; fence-wide across all six of this lane's files → no match). Editing them again would have been a
no-op commit asserting a fix that already exists three commits down.

Floor on the unchanged tree: `pnpm exec biome check` exit 0 · `pnpm exec eslint` exit 0 ·
`pnpm test:scoped tests/tooling/verify/gates/seed-theme-ink-family.suite.test.ts` 18/18 exit 0. HEAD stays
`893d44b49`; `ledger rows OWED: 0`.

**Note for the integrator:** the row is not wrong, it is *unmerged*. It closes when this branch lands —
its evidence is `e8593887a`, not a new commit.

## Integration provenance (2026-09-13)

The six implementation commits above were integrated onto main without runtime changes under new commit
identities:

| Lane commit | Main commit |
| - | - |
| `3c18e88db` | `aef37aced` |
| `e8593887a` | `680d66e7c` |
| `75b99ea89` | `5a3a914d6` |
| `53d3d74ec` | `4e6580704` |
| `4552bdf24` | `8425837e6` |
| `893d44b49` | `b8af78b29` |

The ten runtime implementation/test blobs are byte-identical between the lane and integrated commits. The
planter file differs only in prose because main retained newer bus-family edits; the active-gates catalog
reconciliation carries only the `tokens-contract` row update. Independent source review accepted the final
selector-list repair at `893d44b49`, including distinct-root preservation, per-root conditional polarity,
descendant exclusion, and `Set`-based duplicate collapse.

The integrated focused CSS battery passed **75 tests across nine requested files** at `b8af78b29`; machine-readable receipt:
`reports/runs/test/main-4074155-2026-09-13T05-35-37-661Z/test-report.json`. This is focused integration evidence,
not final program acceptance. The five-policy production drive completed at the same commit: four final
policies ran with nine raw findings, all nine granted, zero effective findings, alarms, tool errors or
withheld policies. The selected legacy `finding-overload-provenance` gate reported one existing finding at
`css-var-defined.ts:294:18`, so the overall command exited 1. Both BaseUI and seed header-marker pairs are
absent from that finding list. Receipt: `reports/runs/structure/main-4076777-2026-09-13T05-36-11-077Z/check-structure.json`.
Board and program closure remain separate lifecycle decisions.

## LEG 6 (#2294 #2314 #2315)

Warm leg on main's tip after integration. Tree mechanics first: `rev-list --left-right --count main...HEAD`
was `10 0` (my six commits already replayed onto main as `aef37aced..b8af78b29`, branch ref moved by root),
`git merge --ff-only main` succeeded, HEAD = main tip, `0 0`.

**The untracked report vs the tracked copy.** My worktree copy was TRUNCATED to leg 1 (an intervening
checkout during integration replaced it), while the TRACKED copy is the complete one: `diff` mine → tracked
is one-directional, `243a244,530`, i.e. tracked is a strict superset carrying legs 2-5 plus root's
"Integration provenance" section. Tracked vs the byte-exact handoff at
`/home/inktomi/.codex/handoffs/pending-reports/agent-a67fb261bed09da8c/` differs only by that provenance
section. **Nothing of mine is missing**; my stale copy was discarded to the scratchpad and this section is
appended to the tracked file.

### A. #2314 — the reader-derived status table

Statuses enumerated from `ops/resource-reader.ts#read`/`#tree`, `ops/resource-tree.ts#loadCssFiles` and
`ops/resource-exact.ts#loadExactFiles` — never counted off the rows. Every status reached on an isolated
`mkdtemp` root with NO overlay (an overlay STRING short-circuits the disk read), each beside a twin:

| declaration · status | constructible? | pin | twin | control |
| - | - | - | - | - |
| `token-contract` missing | ROW | `mustRefuse[0]` | — | pre-existing |
| `token-contract` empty | ROW | `mustRefuse[1]` | — | pre-existing |
| `token-contract` unresolved | NOT a row — no JS string carries an invalid UTF-8 byte | NEW `token-contract-family.suite.test.ts` pin, bytes `0x7b 0xff 0x7d` | NEW, same helper/substrate | text asserted in full incl. the member path |
| `product-css` missing (×2) | ROW | `mustRefuse[0]` each | — | pre-existing |
| `product-css` malformed (×2) | ROW | `mustRefuse` each (#2294) | — | pre-existing |
| `product-css` empty (×2) | ROW | NEW `mustRefuse` in EACH consumer | — | `s2314a`, `p2314b` → `rowsThatDied=1`, that row only |
| `product-css` unresolved (×2) | NOT a row | NEW pin in each family test, bytes `0x40 0xff 0x0a` | NEW, same substrate | full text asserted |
| `exact-file` missing | ROW | `mustRefuse[0]` | — | pre-existing |
| `exact-file` empty | ROW | NEW `mustRefuse[4]` | — | `p2314a` → `rowsThatDied=1`, that row only |
| `exact-file` unresolved | NOT a row | NEW `css-home-topology-family.suite.test.ts` pin | shares the topology twin | full text asserted |
| `exact-file` zero-ids / unknown-id | **UNREACHABLE by construction** | none — `ANCHOR_IDS` is a non-empty compile-time tuple `satisfies readonly ExactResourceId[]` | — | stated in the header |
| `authored-tree` missing | ROW | `mustRefuse[0]` | — | pre-existing |
| `authored-tree` empty | NOT a row — a map cannot spell an empty directory | existing family pin | — | pre-existing |
| `authored-tree` unresolved | NOT a row — a map cannot spell a symlink | NEW symlink pin | NEW, same substrate | full text asserted |

Measured refusal texts (one run, every status + twin):
`token-contract is unresolved: the token contract member resolverSchema (…) is unavailable: The encoded
data was not valid for encoding utf-8` · `product-css is empty: resource file is empty:
packages/ui/src/styles/theme.css` · `product-css is unresolved: The encoded data was not valid for encoding
utf-8` · `authored-tree:packages is unresolved: authored resource traverses a symbolic link:
packages/ui/src/styles/alias.css` · `is empty: exact resource ct-boot (playwright/index.tsx) is
unavailable`. Twins: `toolErrors=[] withheld=[] effective=0`.

**A deviation worth naming:** the brief's list was three declarations; `playwright-css-topology`'s sentence
also covers its `exact-file` declaration and said nothing about it. Leaving that unenumerated would have
re-created the exact defect class the row was filed for, so it is enumerated and its two constructible
statuses pinned.

### B. #2294 — the phrase sweep

`"Both reachable statuses"` → 1 instance (`sanctioned-css-homes.ts:42`), plus 3 `"BOTH reachable statuses
of"` variants in the sibling headers and one downstream restatement in `check-gates.repo.int.test.ts:1109`.
All four gate headers are rewritten by section A; the planter comment already enumerated the topology
pair's three `mustRefuse` rows correctly from leg 4.

`"#2183"` → **12 instances, 5 DRIFTED, 7 CORRECT.** #2183 is the css-home-topology PAIR (`17a59099b`);
\#2182 is `tokens-contract` (`a97454714`) and `seed-theme-ink-contrast` (`2dabae9ce`) — both subjects
quoted from `git log`. A blanket replace would have broken seven true citations.

| site | verdict |
| - | - |
| `gates/tokens-contract.ts:14` · `contract/resource-artifact.ts:40` · `tests/tooling/token-contract.test.ts:199` · `verify/gates/token-contract-family.suite.test.ts:19` · `verify/gates/seed-theme-ink-family.suite.test.ts:211` | DRIFTED → #2182, each with its receipt |
| `gates/playwright-css-topology.ts:43` · `lib/css-home-topology.ts:5` · `check-gates.repo.int.test.ts:716` · `:1101` · `verify/ops/resource-tree.test.ts:113` · `verify/lib/css-rules.test.ts:43` · `check-gates.repo.int.test.ts:1084` | CORRECT — the pair's own conversion or the statement at-rule fact built for it; left alone |

### C. #2315 — the delta table, driven

Frozen `680d66e7c^` TEXT reader vs tip over identical bytes produced the differences and unchanged control
below. This table replaces the earlier header's incomplete four-delta claim:

| class | frozen | tip | pin |
| - | - | - | - |
| WIDER no trailing `;` | `hearth{x}` | `hearth{x,last}` | NEW |
| WIDER two `@theme` blocks | `hearth{x}` | `hearth{x,second}` | NEW |
| WIDER compound-root subject | `dusk{x}` | `dusk{x,f}` | existing compound-root test |
| FIXED `html[data-theme]` | `dusk/light{x}` + `dusk/dark{x,h}` | one `dusk/light{x,h}` | existing compound-root test |
| FIXED multi-root list | `dusk{x}` + `ember{x}` + `ember{x,m}` | each seed once | existing leg-4 tests |
| CHANGED conditional at-rule (in `@theme`) | `hearth{x,y}` | `hearth{x}` + `hearth @ @supports …{x,y}` | existing arm test |
| CHANGED conditional at-rule (in a seed) | `dusk{x,z}` | `dusk{x}` + `dusk @ @media …{x,z}` | existing arm test |
| CHANGED `.card &` | `dusk{x,c}` | `dusk{x}` + `dusk @ .card &{x,c}` | existing arm test |
| NARROWER descendant/sibling subject | `dusk{x,w}` | `dusk{x}` | existing leg-3 tests |
| NARROWER seed nested in a seed | `dusk{x,n}` + `ember{x,n}` | `dusk{x}` | NEW |
| *(not a delta)* flattened descendant | `dusk{x}` | `dusk{x}` | leg-3 test — listed so the set is CLOSED |

Three classes had no pin and now do (the two WIDER reads the header claimed — `grep -c semicolon` was 0 and
no multi-`@theme` fixture existed — plus the seed-in-seed drop it never mentioned). `seed-theme-ink.ts:20`
is rewritten to the enumerated, driven, pinned set, and names both earlier false versions of itself.

### Floor

| check | result |
| - | - |
| `verifyPolicyProofs` × 4 gates | `FAILURES=0` each |
| `pnpm test:scoped` × 9 suites (the lane's 8 + `tests/tooling/token-contract.test.ts`) | **9 files, 87/87, exit 0** — 61 preserved + 26 new |
| bounded `pnpm check:structure --check` × 4, ONE run | **exit 0** · `raw 9 = waived 0 + granted 9 + effective 0 · 0 alarm(s) · 0 tool error(s) · 0 withheld`; per-policy receipts unchanged (`pairs=5856 members:3`, `tokens scanned=310 / 7 member(s)`, `css-inventory:product 3035`, `authored-tree:packages 4198`) |
| `pnpm exec biome check` × 10 files | exit 0 |
| `pnpm exec eslint` × 10 files | exit 0 — it caught two unnecessary optional chains in the new pins first; fixed, re-run green |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | exit 0 |
| parser-heavy real-tree `runPolicyPass` | NOT run — not needed; the bounded four-gate structure run is the real-tree receipt |

### LEDGER ROWS (0 rows)

v-css-train-4 rows 1-5 are all CLOSED by this commit: row 1 (`token-contract` third status) · rows 2-3
(`product-css` / `authored-tree` completeness + gaps) · row 4 (`seed-theme-ink.ts:20`) · row 5 (the
`token-contract.test.ts:199` twin). No new defect found.

`ledger rows OWED: 0`

### Proposed lesson (report text — the orchestrator owns the memory write)

**A COMPLETENESS SENTENCE ABOUT A SET IS ONLY TRUE IF IT WAS DERIVED FROM THE SET'S PRODUCER.** "Both
reachable statuses are pinned" was written three times in four headers by counting the ROWS that existed
and calling that the set; the set is a property of the READER (`read` → four statuses, `tree` → four,
`loadCssFiles` → five), and every one of those sentences was false the day it was written — including the
one #2294 rewrote to fix its *other* half and left standing. The habit that fixes it: when a header claims
a set is covered, open the function that PRODUCES the set, enumerate its return arms, and write the
enumeration into the header with a pin or a not-constructible receipt per arm. A count of what you built is
never a measurement of what exists. Index line:
`[completeness claims come from the producer](completeness-sentence-derives-from-the-producer.md) — enumerate a status/kind set from the reader that returns it, never from the pins you happen to have`.
