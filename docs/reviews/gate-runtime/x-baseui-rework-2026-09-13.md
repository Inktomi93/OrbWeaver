---
kind: review
status: active
updated: 2026-09-13
---

# x-baseui-rework — board #2297, the Base UI family conversion REPAIR

Lane `cb-x-baseui-rework`, worktree `.claude/worktrees/agent-acee617e9b0904a16`, based on `3e03de744` (a
descendant of `dd00ebb78`). Every number below is run output from this session in this worktree.

Four commits: `e89180923` · `9aac27daf` · `9bf69177e` · `e299ff5f9`. `git status --short` EMPTY.
`git rev-list --left-right --count main...HEAD` = **`14  4`** — `main` moved 14 commits after this lane
started, so `git diff main HEAD` would report a sibling's landed work as this lane's deletions; the
per-commit `git show --stat` below is the ownership receipt and the lane did NOT rebase (root integrates).

## 0. Premises re-derived before building — one died

| Brief premise | Verdict |
| - | - |
| the css-hook-provenance conversion (`9104f718f` / `3c685ce6a`) "RETIRED the CSS arms INTO `baseui-surface-manifest#identity()` … read that commit's diff on baseui-surface-manifest.ts" | **REFUTED as stated.** Neither commit touches that file — `git log -- tooling/src/verify/gates/baseui-surface-manifest.ts` stops at `17297f298`, and both css commits' `--stat` name only `css-*` modules. The `state` term in `identity()` and its state-only `mustFlag` row landed at `17297f298`, the baseui conversion itself; the css commits only RETIRED **their own** arms CITING it (`x-css-family-unit-2026-09-13.md` deviation 3). **The RULING is unaffected and was obeyed:** no CSS manifest-installed check was restored, `identity()` is untouched, and `mustFlag[2]`'s `why` now records that cutting `state` blinds two families rather than one. |
| `finding-overload-provenance` still reds on the two derives lines | **CONFIRMED live** at `3e03de744` before any edit — see §5. |
| the three surface-manifest arms and the two anatomy carves are unenforced | **CONFIRMED** by cut-alone on the UNMODIFIED source — see §1 and §2. |
| the phantom `baseui-family.test.ts` citations | **CONFIRMED, and there are SIX, not four** — see §4. One of them cites a test TITLE that has also never existed. |

## 1. `baseui-surface-manifest` — three unenforced drift arms (commit `e89180923`)

**Red-first, on the unmodified source.** Harness: one sibling scratch module PER CUT with a serial in the
name, in the gates directory (relative imports resolve), the anchor asserted to occur **exactly once** or the
cut REFUSES, `rmSync` in a `finally`, and an unpatched CONTROL copy driven first in every batch.

```
CONTROL (unpatched copy of baseui-surface-manifest.ts): 0 failure(s)
CUT sm-vanished-part       (!(partName in installed.parts)  -> false): 0 row(s) died
CUT sm-vanished-component  (!(name in installed.components) -> false): 0 row(s) died
CUT sm-version             (installed.version !== manifest.version -> false): 0 row(s) died
```

**After the three rows land — each cut kills EXACTLY its own row and no other:**

| cut | row that died | detail |
| - | - | - |
| vanished-PART | `mustFlag[3]` | `expected effective finding count=2 but got 1` |
| vanished-COMPONENT | `mustFlag[4]` | `expected at least one effective finding but got 0` |
| version | `mustFlag[5]` | `expected at least one effective finding but got 0` |

**Instrument control** — `count: 99` planted on each of the 11 `mustFlag` rows, one at a time: **all 11 die**
(`got 1,1,1,2,1,1,1,1,1,2,1`). Every count is exact and the instrument can fail.

**§3.5 transplant** — each row's `messageIncludes` moved onto every sibling:

- `mustFlag[3]` `` `Select.Separator` vanished from the installed package `` → **REDS every sibling**
- `mustFlag[4]` ``component `Dialog` vanished from the installed package`` → **REDS every sibling**
- `mustFlag[5]` `the manifest describes 9.9.8` → **REDS every sibling**

Two PRE-EXISTING non-discriminating pairs surfaced and are reported, not changed: `mustFlag[1]`/`[2]` both
carry `"changed shape"` (the prop half and the state half of one message, count 1 each), and `mustFlag[8]`'s
`"learned NOTHING"` survives transplant onto the new `mustFlag[3]`, because that row's count of 2 genuinely
includes arm D's blind-part finding — which is what its own `why` says. Their discrimination is held by the
CUT, not by the message, and v-conversions-11 confirmed the `state` cut kills `mustFlag[2]` and only it.

Real tree: `pnpm check:structure --check baseui-surface-manifest` clean before and after — `0 source · 1
resource`, `installed-package:base-ui:ast: 790 · metadata: 1 · json:baseui-manifest: 1`, 0 tool errors, 0
withheld.

## 2. `baseui-anatomy-completeness` — a text predicate and two unenforced carves (commit `9aac27daf`)

### 2a. Arm C's blindness guard, and the class is WIDER than the comment the reviewer probed

Red-first, three candidate rows driven against the UNMODIFIED module:

```
[comment]  expect {count:1, "must RED when the derivation comes back empty"} -> FAILS: count=1 but got 2
[typeonly] expect {count:1, "must RED when the derivation comes back empty"} -> FAILS: count=1 but got 2
[value]    expect {count:2, 'rules ... "exposed", but no @orb/ui seal renders it'} -> PASSES
```

The reviewer probed a mid-file COMMENT. The same defect has a second spelling the comment fix would not
reach: a file whose only Base UI import is `import type` satisfies a bare binding count, while
`renderedPartsByComponent` admits no type-only binding — so the derivation is empty and every `exposed`
ruling passes for free. Measured identically. The repair is therefore the DERIVATION'S OWN predicate,
`baseUiBindings(sf).some((binding) => !binding.typeOnly)`, read off the family's shared reader, rather than a
comment-proof spelling of the old scan (doctrine: fix the CLASS, not the instance).

**The full cut matrix after the repair** (control 0 rows dead every batch):

| cut | rows that died |
| - | - |
| revert to the raw `getText()` text scan | `mustFlag[3]` + `mustFlag[4]` |
| revert only the type-only half (`baseUiBindings(sf).length > 0`) | `mustFlag[4]` alone |
| fail the guard OPEN (`if (false)`) | `mustFlag[2]`, `[3]`, `[4]` |
| fail the guard SHUT (`if (true)`) | 9 rows, **including the value twin `mustFlag[5]`** |

The last row is why the positive twin exists: without it the guard could be failed shut and every other
blindness row would stay green.

### 2b/2c. The two unenforced carves

Cut-alone on the unmodified source: **CLEAN ×2** (`part.disposition !== "unresolved"` → `true`;
`part.kind !== "part"` → `false`). After:

| cut | row that died | detail |
| - | - | - |
| `unresolved` carve opened | `mustPass[5]` (new) | `` `Select.Backdrop` is rendered at …:4, but the ledger rules it "unresolved" `` |
| `kind` carve dropped | `mustPass[6]` (new) | ``the ledger rules `Select.useFilter` "exposed", but no @orb/ui seal renders it`` |

`mustPass[2]`'s `why` claimed to be the row that holds the `unresolved` carve. It structurally cannot: its
fixture renders ROOT ONLY, so `site === undefined` and `judge` returns one clause earlier. The `why` now
states what the row actually holds (arm A's `exposed` narrowing) and points at `mustPass[5]`.

`count: 99` on each of the 6 `mustFlag` rows: **all 6 die**. Real tree: clean, population `366 source`
unchanged.

**One in-module citation repaired beyond the brief, because the added rows shift indices:** the header's
DECLARED LIMIT cited `mustPass[2]` and describes what `mustPass[4]` (the out-of-population seal) holds.

## 3. §4.5 refusal pins, and the door-order proof (commit `9bf69177e`)

Every reachable non-ready status was constructed and MEASURED on a real tmpdir before a pin was written:

| construction | doors | phase | message |
| - | - | - | - |
| zero-byte ledger | ast ready · metadata ready | `population` | `json:baseui-manifest is empty: resource file is empty: …` |
| package.json with `name`, no `version` | ast ready · **metadata unresolved** | `evaluate` | `installed-package:base-ui:metadata … came back unresolved: … has no name/version pair` |
| package publishing no `.d.ts` | **ast unresolved** · metadata ready | `evaluate` | `installed-package:base-ui:ast … came back unresolved: … publishes no declaration files` |
| package absent | **both missing** | `evaluate` | `installed-package:base-ui:ast … came back missing` |
| complete | ready · ready | — | owner `success`, 3 receipts, `unresolved: 0` each |

**THE DOOR-ORDER PROOF the brief asked for.** `missing` is **not a per-mode fact**: `ops/resource-installed.ts`
resolves BOTH modes through the same `manifestPath(root, id, …)` call and only then branches on
`request.mode`, so no tree exists on which one door is missing and the other ready. With the package absent
both doors report `missing` together and the **`ast` door answers first**, because `evaluate` opens it first
(`installedPackage({mode: "ast"})` precedes the metadata read). The single existing whole-package pin
therefore covers that status completely. What IS per-mode is `unresolved`, because each mode reads a
different thing out of the resolved directory — so each got its own pin, reached by a different planted
defect. **The limit is ASSERTED as its own test**, not left in prose: it reds if a refactor ever gives the
two modes separate resolutions.

Also landed: `json` EMPTY for all four ledger consumers and for `baseui-state-data-attributes` (whose header
claims all three statuses), plus the complete-run receipt assertion for the three-resource policy.

Mechanism note for the next lane: the installed doors need **REAL planted files**. `loadInstalledPackage`
goes through node's resolver and `readdirSync`; the `resourceOptions.overlay` reaches neither, by design.

`pnpm test:scoped tests/tooling/verify/gates/baseui-and-surface-family.suite.repo.int.test.ts` → **39/39**.

## 4. The phantom citations — SIX, and one of them cites a phantom TEST TITLE (commit `e299ff5f9`)

`tests/tooling/verify/gates/baseui-family.test.ts` has never existed on the tree. Sites repaired, each
sentence also made TRUE about what the real file pins:

| site | what it now names |
| - | - |
| `baseui-surface-manifest.ts:43` | the ledger's three reachable statuses + the installed doors' three + the complete-run receipts |
| `baseui-surface-manifest.ts:82` | the reader-blindness describe block, by title |
| `baseui-anatomy-completeness.ts:47` | missing · unparseable · empty, with the four assertions each makes |
| `baseui-derives-not-respells.ts:58` | the four-consumer loop, by title |
| `baseui-state-data-attributes.ts:42` | its own §4.5 block + the empty pin added for it |
| `baseui-portal-container-seam.ts:50` | **the header paragraph itself** — see below |

**`baseui-portal-container-seam` is the sharp one.** It cited both a nonexistent file AND a test titled
*"portal seam: legacy and final agree on the flagged portals"*; a grep of `tests/` for `portal seam` returns
**zero**, and for `portalContainerSeam` returns only the family test's import/registration/identity-case
lines. So the differential's numbers in that paragraph were the ONLY evidence and the citation pointed away
from it. Guide §4.6 (#2000) admits either a committed test **or** a statement of what the run found; this
conversion took the second arm, so the paragraph is now labelled as the record. **A test was deliberately NOT
minted after the fact** — I did not run that replay, and a test written now would be a receipt nobody ran.

## 5. The retired marker opener (commit `e299ff5f9`)

Both derives headers spelled `` `@finding-overload-ok` `` literally, inside the corpus the live legacy
`finding-overload-provenance` gate scans, so each was a MALFORMED-marker finding against it (the gate's
`MARKER_ANY_RE` matches the opener in any non-literal comment; without `: <reason>` it reports MALFORMED).
Fixed the way `finding-overload-provenance.ts:9-10` does it to itself.

**Real tree, before and after** (`pnpm check:structure --check finding-overload-provenance`):

```
BEFORE  exit 1, 5 findings:  baseui-derives-not-respells-health.ts:22:0  MALFORMED
                             baseui-derives-not-respells.ts:15:0         MALFORMED
                             css-var-defined.ts:294:18                   column-derived
                             seed-theme-ink-contrast.ts:35:0             MALFORMED
                             seed-theme-ink-contrast.ts:52:0             MALFORMED
AFTER   exit 1, 3 findings:  the two derives rows are GONE; the other three remain
```

## 6. The §4.6 fixture-level replays, RE-RUN (the brief's ask, and one finding)

Every legacy example from `1692583d6` driven through the FINAL policy on the conformance runner's own
real-tmpdir substrate. A legacy `mustFlag` reproduces when the final policy still reports and the legacy
`messageIncludes` still matches; a legacy `mustPass` reproduces when the final policy is silent and the run
COMPLETES (a refusal is not a reproduction — it is a classified delta).

| claim in `17297f298` | re-run | verdict |
| - | - | - |
| surface-manifest **7/9** | **7/9** | REPRODUCES — deltas: legacy `mustFlag[4]` (NO_PACKAGE) is now an `[evaluate]` tool error; legacy `mustPass[2]` (no ledger at all) is a `[population]` refusal. Exactly the two the commit classified. |
| anatomy **6/7** | **6/7** | REPRODUCES — delta: legacy `mustPass[3]` (no ledger) is a `[population]` refusal. |
| derives **12/12 across the two siblings** | **11/12 raw; 12/12 after marker translation** | CORRECTED by `v-baseui-final-2026-09-13.md`: legacy `mustPass[1]` uses the retired `@orb-gate-ignore` opener; translating only that opener to `@orb-waive` makes the ordinary policy silent. Arm ownership matches: legacy `mustFlag[0,1]` → `-health`, `[2,3,4]` → ordinary. |

**But the surface-manifest number is only reachable after ONE forced port of the legacy file map, and the
commit does not say so.** Raw, the answer is **0/9**: legacy `INSTALLED_ONE_PART` plants
`{ "version": "9.9.9" }` with **no `name`** (the legacy reader took the version off disk itself and never
asked for a name), while the final policy declares `installed-package:base-ui:metadata`, whose provider
refuses a manifest missing either half. So all eight package-carrying examples tool-error on the metadata
door before the anatomy is ever compared. Adding `"name"` — the single port the new resource contract forces
— yields 7/9. The commit's number is CORRECT; its method silently included that port. Guide §4.6's own rule
applies: *a differential is a claim about a POPULATION (and a substrate) as much as about findings.* Ledger
row LR-3 below.

## 7. OPEN RESIDUAL — v-conversions-11 row 11, unchanged and out of scope

`baseui-derives-not-respells.ts:100,103` and `-health.ts:85,86` declare `analysis: "resource"` with
`execution: "selected-files"`. `resource-policy-contract.md` §1(4) and §3.4 require
`execution: "entire-population"` of every `analysis: "resource"` policy and state *"where it disagrees with a
module, the module is wrong"*. **State on this tree: unchanged — both still `selected-files`, and neither
header records the deviation.** The two arms, priced:

- **Arm A — amend the contract doc** to *"…unless the verdict is genuinely per-file, stated in the header"*,
  and add the header sentence to both modules. Cheap and honest: these two policies DO compute a per-file
  verdict (a member of a `*Props` interface in one file re-spells a prop), so `entire-population` would be an
  over-declaration, and guide §3's own table says `entire-population` is for a verdict that *cannot* compose
  over a subset. Cost: a binding-contract edit, which is not a lane's call.
- **Arm B — change both modules to `entire-population`.** Contract-literal, and it also forces an `evaluate`
  hook (`POLICY_PASS_REFUSALS.entireWithoutEvaluate`, #2111, refuses `entire-population` with no `evaluate`),
  which neither module has. So arm B is not a field flip; it is a restructure of two policies whose per-file
  reasoning is correct.

**Not taken, deliberately:** the brief fenced it as awaiting a runtime-contract adjudication, and both arms
edit something owned above this lane (the contract doc, or two policies' execution semantics). **Recommended:
arm A**, because the modules' reasoning is defensible on the tree and the contract's clause is the thing that
is over-broad. The orchestrator owns the ruling.

## 8. Deviations, with receipts

1. **The type-only twin was NOT in the brief and is a widening of item 2(a) beyond the reviewer's probe.**
   The brief said "replace with `baseUiBindings(sf)`". A bare `baseUiBindings(sf).length > 0` leaves the
   identical defect reachable through `import type` (measured: `count=1 but got 2`), so the guard is the
   derivation's own predicate instead, with its own row and its own cut. Receipt: the "revert only the
   type-only half" cut kills `mustFlag[4]` alone.
2. **An `ast`-unresolved pin was added beside the metadata one.** The brief asked to "check EACH
   installed-package door missing independently"; `missing` is provably not per-mode (§3), so the honest
   per-door coverage the ask was aiming at is the two `unresolved` refusals, which ARE independent.
3. **`baseui-state-data-attributes` and `baseui-portal-container-seam` were edited** though the row calls
   their citations "not this lane's". Both were in the brief's item-4 list, and the state-data-attributes
   citation could not be made TRUE without adding its EMPTY pin.
4. **Two `why` strings were reworded away from spelling their own predicates.** The first cut run REFUSED
   (`anchor occurs 2 times, must be exactly 1`) because a new row's `why` quoted `!(partName in
   installed.parts)` verbatim — guide §4.1's documented false-clean trap, caught by the harness's own
   exactly-once assertion. The header of `baseui-anatomy-completeness` legitimately quotes its guard, so the
   cuts there carry the `ctx.files.some((sf) => ` prefix the prose does not.
5. **`pnpm exec biome check --write` was run SCOPED to two files I had just edited** (the sanctioned form).
   Both diffs were read in full before commit; both were pure re-wrapping.
6. **Out of fence, not fixed:** `seed-theme-ink-contrast.ts:35,52` carry the same malformed-opener defect
   (§5), landed by `2dabae9ce`. Reported rather than fixed — the module is another lane's conversion and this
   lane cannot check whether it is in a sibling's live diff.
7. **Not run (fence):** `pnpm check`, whole-tree `check:structure`, `check:policy-conformance`, and the four
   planter suites (`check-gates.repo.int` names `baseui-*` ids and is orchestrator-only). Nothing in this
   lane converts a module or changes the legacy roster, so no roster-derived suite moves.

## LEDGER ROWS (3 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `seed-theme-ink-contrast` | x-baseui-rework · `tooling/src/verify/gates/seed-theme-ink-contrast.ts:35,52` | The #2293(a) class AGAIN, a third landing: header prose spells the retired marker opener WITH its `@` inside the corpus the live legacy `finding-overload-provenance` gate scans, so both lines are MALFORMED-marker findings against it. Landed by `2dabae9ce` (the seed-theme conversion), not by the baseui train. Fix is one word per line, exactly as `finding-overload-provenance.ts:9-10` does to itself | retired-opener in prose / live legacy finding | **OPEN** | `pnpm check:structure --check finding-overload-provenance` at `3e03de744`: 5 findings, two of them these; after this lane's fix of the baseui pair, 3 findings and these two remain. `git log -1 -S'finding-overload-ok' -- <path>` → `2dabae9ce`. OUT OF THIS LANE'S FENCE |
| `baseui-portal-container-seam` | x-baseui-rework · `baseui-portal-container-seam.ts:50` | The §4.6 differential citation named a test TITLE as well as a file, and BOTH are phantoms: no test titled "portal seam: legacy and final agree on the flagged portals" has ever existed, and `grep -rn 'portal seam' tests/` returns zero. This is one class worse than the four citations #2297 already carries — a reader chasing it concludes the differential is pinned by a suite when the paragraph's own numbers are the only evidence. REPAIRED here by labelling the paragraph as the record (guide §4.6's second admissible arm); a test was deliberately NOT minted after the fact | header / dangling citation, phantom TITLE | **FIXED** (`e299ff5f9`) | `/usr/bin/grep -rn 'portal seam\|portalContainerSeam' tests/` → 3 hits, all the family test's import/registration/identity-case lines, none a test title |
| `baseui-surface-manifest` | x-baseui-rework · `17297f298` commit message, §4.6 paragraph | The "surface-manifest 7/9 reproduce" differential is CORRECT but its SUBSTRATE is undeclared: replayed on the legacy file maps as authored, the answer is **0/9**, because legacy `INSTALLED_ONE_PART` plants `{ "version": "9.9.9" }` with no `name` and the newly-declared `installed-package:base-ui:metadata` door refuses a manifest missing either half. 7/9 requires one forced port to every legacy fixture. Guide §4.6 already rules that a differential is a claim about the population/substrate as much as about findings; a replay that silently ports its fixtures owes the port | differential method / undeclared substrate port | **OPEN** (documented in this report §6; no code change owed) | re-run both ways in this lane: RAW `0/9` (eight rows `[evaluate] … metadata … has no name/version pair`, one `[population] … json:baseui-manifest is missing`); PORTED `7/9` with exactly the two deltas the commit classified. Anatomy `6/7` needs no port. CORRECTION from the final verifier: derives is `11/12` raw and `12/12` only after translating the retired marker opener in `mustPass[1]` |

ledger rows OWED: 3

## PROPOSED LESSONS (report text — the orchestrator owns the memory write)

**A `-health`/resource conversion's declared doors can make the LEGACY fixtures unreplayable, and the
differential number will still look right.**

Index entry: `[replay owes its substrate port](differential-replay-owes-its-fixture-port.md) — a conversion that declares a NEW resource door makes every legacy file map incomplete, so a fixture-level §4.6 replay silently ports them and reports a number the raw fixtures never produce`

Body: `baseui-surface-manifest`'s conversion added `installed-package:base-ui:metadata`, whose provider
refuses a package manifest missing `name` OR `version`. Every legacy fixture planted `{ "version": "…" }`
alone, because the legacy reader read the version itself and never asked for a name. Replayed as authored,
**0 of 9** legacy examples reproduce — all eight package-carrying ones tool-error on the new door before the
anatomy is compared. Add the one missing field and it is **7/9**, the number the commit claims. Neither
number is wrong; the commit just never said which it measured. **How to apply:** when a conversion declares a
resource door the legacy gate did not have, run the replay BOTH ways and report both. The raw number tells
you how much of the legacy fixture corpus the new contract invalidated, which is itself a conversion delta
worth naming; the ported number is the catch-parity answer.

**A cut harness's exactly-once anchor assertion fires on the FIX's own `why`, not just on the header.**

Index entry: `[cut anchor collides with the new row's why](cut-anchor-collides-with-the-fix-s-own-why.md) — the §4.1 row you write to close a gap re-spells the predicate it pins, so the next cut of that predicate refuses`

Body: guide §4.1 already warns that a module's HEADER quotes its fences and a naive `String.replace` patches
the comment. The half nobody writes down: **the `mustFlag` you add to close the gap does it too.** Writing
``the row that dies when `!(partName in installed.parts)` is cut`` made the anchor occur twice and the
harness (correctly) refused before running anything. **How to apply:** in a §4.1 row's `why`, name the fence
by its ROLE ("the second `diffParts` loop's membership test is failed OPEN"), never by its source text — and
where the header legitimately quotes the predicate, extend the cut anchor with a code-only prefix the prose
cannot contain (`ctx.files.some((sf) => …`). Keep the exactly-once assertion; it is the thing that caught it.

**A text-predicate defect found through comments is usually reachable through a second spelling.**

Index entry: `[text-scan guard has a type-only twin](text-scan-guard-has-a-type-only-twin.md) — replacing a getText() scan with a bare AST binding count leaves the identical defect reachable via `import type`; pin the DERIVATION's own predicate`

Body: `baseui-anatomy-completeness`'s blindness guard was `sf.getText().includes(<prefix>)` and a reviewer
demonstrated it with a mid-file comment. The obvious fix — `baseUiBindings(sf).length > 0` — is still wrong,
because the derivation the guard protects (`renderedPartsByComponent`) admits only NON-type-only bindings, so
a run whose sole importer writes `import type` derives an empty map and every ruling passes for free.
Measured identically (`count=1 but got 2`). **How to apply:** when a guard exists to say "the derivation came
back empty", make the guard the derivation's OWN admission predicate rather than any proxy for it, and pin
all three positions — the false-positive spelling, the second false-positive spelling, and a POSITIVE twin
that dies if the guard is failed shut.

## Floor

| command | result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/gates/baseui-and-surface-family.suite.repo.int.test.ts` | **39/39 pass**, exit 0 |
| `pnpm test:scoped` ui-gate-structural-regressions.int · port-parity-tier3 · verify/ops/conformance.int · verify/lib/baseui-read.int | **16/16 pass**, exit 0 (every other `tests/**` file naming these six policy ids as a literal, except the orchestrator-only planter) |
| `pnpm check:structure --check baseui-surface-manifest --check baseui-anatomy-completeness` | exit 0, clean, before AND after |
| `pnpm check:structure --check baseui-derives-not-respells --check …-health --check baseui-state-data-attributes --check baseui-portal-container-seam` | exit 0, `raw 7 = waived 7 + granted 0 + effective 0`, 0 alarms, 0 tool errors, 0 withheld |
| `pnpm check:structure --check finding-overload-provenance` | 5 findings → **3** (the two derives rows gone) |
| §4.6 fixture-level replays re-run | surface-manifest 7/9 (0/9 raw) · anatomy 6/7 · derives 12/12 after marker translation (11/12 raw; final verifier correction) |
| `pnpm exec biome check <7 touched files> --diagnostic-level=error` | `Checked 7 files. No fixes applied.` |
| `pnpm exec eslint <7 touched files>` | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | `PASS` / `PASS`, exit 0 |

## Commits

```
e89180923  fix(gates): pin baseui-surface-manifest's three unenforced drift arms (#2297, #1584)
             tooling/src/verify/gates/baseui-surface-manifest.ts | 53 +++-       (46 ins, 7 del)
9aac27daf  fix(gates): baseui-anatomy-completeness asks the AST, and its two unenforced carves get rows
             tooling/src/verify/gates/baseui-anatomy-completeness.ts | 82 ++++-  (76 ins, 6 del)
9bf69177e  test(gates): the baseui-read family's §4.5 pins cover every REACHABLE resource status
             tests/tooling/verify/gates/baseui-and-surface-family.suite.repo.int.test.ts | 126 ++- (124 ins, 2 del)
e299ff5f9  docs(gates): the baseui family stops citing a test that never existed, and stops spelling a
           retired opener
             baseui-derives-not-respells-health.ts |  6 +-
             baseui-derives-not-respells.ts        | 10 ++-
             baseui-portal-container-seam.ts       |  9 ++-
             baseui-state-data-attributes.ts       |  6 +-                       (24 ins, 7 del)
```

`git status --short` EMPTY (this report is untracked by instruction).
`git rev-list --left-right --count main...HEAD` = `14  4`.

## Integration provenance (2026-09-13)

The four lane commits landed as `dea1061df`, `f638436a2`, `90a7a90db`, and `27acc5617`.
Independent source review accepted these repairs. The integrated family test passed 39/39 at
`028e278ee`, within the 117-test run recorded at
`reports/runs/test/main-4058674-2026-09-13T05-33-08-762Z/test-report.json`.
The branch differential above still means 7/9 after its explicit metadata fixture port, not 7/9 on raw
legacy fixtures. The resource-only changed-path execution defect is separately tracked as #2309;
\#2297 final acceptance awaits that repair and an independent verifier. The later CSS integration also
removes the seed header-marker pair; the selected production receipt is recorded in the CSS repair report.

## Final verifier correction and current contract (2026-09-13)

The independent final verifier re-ran the derives corpus through production dispatch and refuted this
report's original unqualified 12/12 claim. The corrected entries above state both results: 11/12 as authored,
12/12 after translating only the retired opener in legacy `mustPass[1]` from `@orb-gate-ignore` to
`@orb-waive`. The raw ordinary policy reports one finding; the health sibling is silent. No implementation
change or additional legacy fixture alteration is implied. The full independent receipt is
`v-baseui-final-2026-09-13.md` claim 9. This correction also supersedes the immutable conversion commit's
unqualified replay statement.

The final verifier confirmed all four code repairs and #2309's population reselection on three seals,
including source-only exactness and resource-only complete reselection with healthy controls. Its base
`99acf985d` predates `c8fccfa7c`, which already revised `resource-policy-contract.md` §3.4: indivisible
answers require whole-population execution; composable selected-source answers may use `selected-files`
with complete declared resource reads. Thus §7 above records the earlier contract conflict, not the
current contract. No execution-mode flip is appropriate: the final verifier measured that such a flip
would defer the resource-change request instead of re-judging its dependent source members. The module
explanations and whole-program verification remain separately reviewable integration work.
