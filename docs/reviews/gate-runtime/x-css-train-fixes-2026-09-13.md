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
identity cut still discriminates: `seed-theme-ink-family.test.ts` passes 5/5, including the arm where a
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
