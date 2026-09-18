---
kind: review
status: active
updated: 2026-09-13
---

# `cb-x-css-family-unit` — the `css-hook-provenance` family (#2181, #2182, #1584)

Lane `cb-x-css-family-unit`, isolated worktree, rebased onto `711e207d6` (main's tip at the leg-1 report; the
whole floor was re-run on the rebased tree). **Two legacy descriptors converted
as ONE unit and SPLIT by authority into five final policies under one family; the module-global collector
they shared became a `defineFact` provider; four count ratchets retired, three of them into 1:1 reviewed
grants; one shared-reader field built; two dead guards deleted; 36 fences cut with a denominator.**

Commit `6ddca708c` — one commit, because the two modules do not compile apart: they share
`lib/css-family-source-provenance.ts`'s pass state, and the substrate that replaces it serves all five ids.

## The shape

| id | authority | population | resources | facts |
| - | - | - | - | - |
| `css-family-ownership` | ordinary/error | `{ in: ["@client","@ui"] }` | `product-css` | `css-hook-provenance` |
| `css-family-ownership-health` | hard/error | `{ of: "none" }` | `product-css` | — |
| `css-family-direct-client-mechanism` | reviewed-grant/error | `{ in: ["@client","@ui"] }` | `product-css` | `css-hook-provenance` |
| `css-selector-has-a-writer` | ordinary/error | `{ in: ["@client","@ui"] }` | `product-css`, `vendor-css-surface`, `json:baseui-manifest`, `installed-package{base-ui,ast}` | `css-hook-provenance` |
| `css-selector-has-a-writer-health` | hard/error | `{ of: "none" }` | `product-css`, `vendor-css-surface` | — |

FAMILY `css-hook-provenance`, named for its shared reader
`lib/css-family-source-provenance.ts#cssHookProvenanceFact` (`collectHookOwners` + `collectSelectorWriters`,
one collector). The CSS-side reader is `lib/css-family-selector-provenance.ts`.

## THE ONE DEVIATION FROM THE BRIEF, stated with its price

**The brief ruled the provenance state into `create`. It went into a `defineFact` PROVIDER instead.**

- The brief: *"state into `create` (the provenance `hookPass` becomes create()-owned pass state consumed by
  all four importers — the module keeps ONE entry point)"*.
- The tree: `create` runs **per POLICY**. The legacy `let hookPass` existed precisely so it would NOT —
  its own comment reads *"the sibling CSS gate reuses the still-open state"*, and `beginHookOwnerCollection`
  was a deliberate no-op on the second call. Measured on the real tree at `1692583d6`: 23.9 s of gate-hook
  time for the selector gate's visit and 16.7 s for the ownership gate's finalize, over ONE collector. The
  conversion has THREE policies needing it, so `create`-owned state would build the collector three times
  and triple a ~20 s walk on the commit bar.
- §12.3 names the home for exactly this: *"Shared whole-population work is a branded `defineFact` provider
  with its own id, population, analysis, resources, collector, finish hook, receipts … the dispatcher
  instantiates each unique provider once, feeds it in the same physical walk, and finishes it before policy
  evaluation."* That is `beginHookOwnerCollection`'s contract, written down.
- The brief's own requirement is satisfied MORE strongly: the module keeps ONE entry point
  (`cssHookProvenanceFact`), and all five consumers read the identical object — asserted, not asserted-about,
  in `tests/tooling/static-class-collection.int.test.ts` (`expect(seen[0]).toBe(seen[1])`).

**Receipt that the sharing holds:** `pnpm check:structure --check css-family-ownership` prints
`fact css-hook-provenance: success · … 1685 member(s) … · 13966.6ms` — one fact run, once.

## Population port — BYTE-IDENTICAL, two-way, with planted controls

The legacy descriptors were `scopeSafety: "whole-project"` with **no `scanRoot`**, so their admitted set was
the whole harness corpus, and each then discarded everything outside `packages/{ui,client}/src/` in its own
code (`ownerForPath` / `isProductSource`). Driven at `711e207d6`:

```
harness corpus (legacy admitted set, no scanRoot):      7568
legacy, after the gate's own ui/client filter:          1686
declared population { in: ["@client", "@ui"] }:         1686
legacy \ final: 0        final \ legacy: 0
CONTROL — one extra on the legacy side: 1 · one removed from the final side: 1
```

The declared population admits **exactly** what the gate ever looked at, so the two internal fences are
MUTUALLY REDUNDANT with it and are deleted rather than kept as decoration (`server-layout` precedent). Legacy
sha `1692583d6`.

Resource-side ports: `product-css` replaces `readCensus`'s `existsSync`/`readFileSync` over the same five
paths (`PRODUCT_STYLESHEETS`, byte-equal). The direct-`@theme` question moves from a hand-written brace
scanner to `CssAtRule.declarations` — **measured byte-identical: 203 direct declarations both ways, 109 rule
declarations, on the real `theme.css`.**

ONE DECLARED CORRECTION: the per-sheet declaration DENOMINATOR is now every declaration the shared parser
read in that sheet (rules + at-rule bodies), where the retired reader counted at-rule bodies for `theme.css`
ALONE. Real tree 1029 → 1161. It feeds only the blindness tripwire and the receipt, and it can only ever make
the tripwire quieter; `css-family-ownership-health` `mustPass[3]` is the fixture that would have been a false
positive (a home whose only declarations sit inside a `@media` block).

## Authority, and the two doors that did not exist before

Both ordinary policies got a **NEW** door. The legacy findings came out of `cssFamilyFinding`, which minted
`column: 1` with a synthetic composite token (`class:shell-wrapper`, `data-density="birdie"`) — guide §3's
class 2, where `locateFinding` requires the token to be authored text at the exact line and column. Under the
LEGACY engine that worked (`lib/gate-ignore.ts:180,196` compared a plain string against the finding's own
reported lexeme); under this contract it does not. Every surviving finding is re-anchored on the AUTHORED
SLICE at its real coordinate:

| verdict | anchor | example position |
| - | - | - |
| selector-level ownership | the selector arm's own text, or its leading paren-free run | `[data-density="compact"]` · `:is` |
| hook provenance | the hook's own slice inside the selector | `.shell-rail` · `[data-slot="button"]` |
| declaration-level | the property name at its own column | `--color-fresh-palette` |
| authored layer | the at-keyword | `@layer` |
| selector census | the hook's slice | `.shell-wrapper` · `[data-streamdown="code-block"]` |

The §4.2 identity arm is a `mustPass` row in each ordinary module (guide §4.2 names both homes;
`schema-branding.ts:137` is the precedent). It is self-checking: `proofFailure` runs `toolFailure` first and
fails on ANY `authorityAlarms`, so a dead position, a foreign id, an over-broad match or a fixture that
stopped flagging each RED the row.

**MARKER CENSUS 0 = 0 = 0**, re-run in this lane with a positive control in the same invocation:
`scannedFiles: 7753 · POSITIVE CONTROL any @orb-waive marker-form: 1203 · legacy @orb-gate-ignore files 0 ·
final @orb-waive files 0`, for all five ids. The arithmetic closes: no marker was translated because none
existed, and the anchor move orphans nothing.

## The count ratchets — four retired, three DERIVED and kept

`exception-authority-census.md:178` disposed only the five declaration counts; the §5b audit's ledger row 11
found seven more surviving in the same file, reached by ZERO proof rows (cut f07) and unmoved by a changed
number (cut f08).

- **`EXPECTED_RUNTIME_WRITERS.fade = 12` — DELETED.** A bare current-population literal. The SEAM survives
  and still acquits (`css-family-ownership` `mustPass[15]`, cut f06); only its cardinality is gone.
- **`density` / `blur` / `colorization` — KEPT, and re-read.** Each is `DECLARED_SET.size * DECLARED_SET.size`,
  so it states a COMPLETENESS property ("every declared seam × every declared selector is written exactly
  once") that a legitimate vocabulary change updates on both sides at once. That is not a population count,
  and cuts f04/f05 kill 11 rows each.
- **`EXPECTED_DIRECT_CLIENT_UI_MECHANISMS`' three counts — MIGRATED.** The counts wrapped an EXEMPTION, so
  the exemption moved to three 1:1 rows in `lib/reviewed-grants.ts` and the policy's authority followed its
  exception mechanism (§12.5; the `seed-theme-ink-contrast` precedent from the sibling train). **Real tree:
  `raw 3 = granted 3 + effective 0 · 0 alarm(s)`** — every migrated row consumed exactly once. The central
  `stale-reviewed-grant` alarm is the two-sided ratchet the counts owned by hand, pinned three ways in the
  family test.
- **`EXPECTED_DIRECT_THEME_DECLARATIONS = 203` — READ, NEVER MOVED** (#2230 owner-pending). What this lane
  DOES close is audit ledger row 13: the two fixture spellings now DERIVE from the constant, so the number
  has ONE home instead of three. The arm still bites — cut f22 kills two rows, and `mustFlag[2]` is a corpus
  one declaration short.

## §4.1 cut matrix — 36 fences, enumerated from the CODE

Method: ONE CHILD PROCESS per cut (node caches an imported module — the `?query` trap one layer out); the
REAL file patched with `cp`/`mv` and restored in a `finally`; **every anchor asserted to occur EXACTLY ONCE**
before the patch (a cut that patches a header comment or a `why` string is the false clean that assertion
exists to stop); an identity CONTROL first, which killed 0. Harness:
`scratchpad/cbxcfu-cuts.py`. The list is the denominator — v-css-train-3's lesson that a matrix without one
is a sample, not a sweep.

| # | fence | direction | rows died |
| - | - | - | -: |
| c00 | identity control | — | 0 (CONTROL OK) |
| f01 | `@layer` arm's AUTHORED_STYLESHEETS fence | flag MORE | 2 (was 0 — new row) |
| f02 | density placement: TIERS return | flag MORE | 51 |
| f03 | `--orb-tier-` prefix | flag MORE | 52 |
| f04 | runtimeWriter density seam | flag MORE | 11 |
| f05 | runtimeWriter blur seam | flag MORE | 11 |
| f06 | local fade-stop seam | flag MORE | 2 (was 0 — new row) |
| f07 | generated-family prefix test | flag MORE | 52 |
| f08 | generated writers: THEME return | flag MORE | 52 |
| f09 | ui-direction owner fence | flag MORE | 5 |
| f10 | direct-client `html ` fence | mixed | 1 |
| f11 | direct-client message-list arm | mixed | 1 |
| f12 | bareUiSlots client-mechanism carrier | flag MORE | 1 |
| f13 | bareUiSlots ui-only fence | flag MORE | 1 |
| f14 | shell `:root` view-transition exception | flag MORE | 34 |
| f15 | shell root-rule selector fence | flag MORE | 18 |
| f16 | shell structural-hook fence | flag MORE | 10 |
| f17 | shell provenance client acquittal | flag MORE | 12 |
| f18 | `isShellSelector` | flag FEWER | 10 |
| f19 | tier selector grammar | flag FEWER | 1 |
| f21 | health: zero-theme-values arm | flag FEWER | 1 |
| f22 | health: parity arm | flag FEWER | 2 |
| f23 | health: empty-namespace seam fence | flag MORE | 1 |
| f25 | directTheme: at-rule `@theme` fence | flag MORE | 2 (was 0 — new row) |
| f26 | directTheme: custom-property fence | flag MORE | 2 (was 0 — new row) |
| f27 | grant: per-(carrier, hook) aggregation | flag MORE | 1 |
| f28 | writers: HAST element fence | flag FEWER | **0 alone, 1 JOINT** |
| f29 | writers: `data-` prefix on JSX attributes | flag FEWER | **0 — non-verdict-bearing** |
| f30 | vendor: Base UI intersection | flag FEWER | 1 (was 0 — new row + corrected fixture) |
| f31 | vendor: Streamdown emission test | flag FEWER | 4 |
| f32 | selector: vendor acquittal | flag MORE | 2 |
| f33 | selector: authored class writer | flag MORE | 2 |
| f34 | selector: authored data value match | flag FEWER | 2 |
| f35 | selector-health: zero-hook tripwire | flag FEWER | 1 |
| f36 | selector-health: Streamdown XOR | flag FEWER | 2 |
| f37 | hook identity dedupe | flag MORE | 1 (was 0 — new row + **corrected cut**) |
| f38 | `hookValueMatches` presence arm | flag MORE | 1 (was 0 — new row) |
| ~~f20~~ | health `fullHomeSet` guard | — | **DELETED** |
| ~~f24~~ | directTheme outer `file.path !== THEME` | — | **DELETED** |

**Nine clean cells on the first sweep; every one classified rather than counted.**

- **UNENFORCED → seven new rows, written and RUN** (f01, f06, f25, f26, f30, f37, f38). Two of them were
  UNENFORCED FIXTURES rather than unenforced fences, which is the guide's own warning: f06's old row put
  `--fade-start-stop` outside any MINTED token family, so it never reached the seam at all.
- **WRONG-DIRECTION CUT, twice, and both are worth recording.** f37's first cut deleted the `out.has(key)`
  guard — but `out` is a Map keyed by identity, so re-`set`ting the same key still collapses. The fence IS
  the key; cutting `identityKey` to include the file and offset reds the row. f30's first fixture had an
  installed package with NO state interfaces at all, so the value map was empty on both sides of the cut; the
  discriminating fixture declares the STATE INTERFACE while publishing no component entry — exactly the shape
  a vendor removal leaves behind.
- **MUTUALLY REDUNDANT → f28.** The `type === "element"` string test sits behind two
  `isPropertyAssignment` guards aimed at the same subject. Cut alone: 0. Cut JOINTLY with both: 1
  (`mustFlag[4]`, the inert `properties` object). Kept, and the classification is recorded rather than a row
  invented.
- **NON-VERDICT-BEARING → f29.** Removing the `data-` prefix filter records every JSX attribute in the writer
  census under its real name; the census is only ever queried for `data-*` names the CSS selects, so no
  verdict can change. This is the "declared performance prefilter" class — counting it is counting honesty as
  a defect.
- **DELETED → f20, f24.** Two guards whose false arm is now unreachable: `fullHomeSet` existed because a
  filesystem walk could miss a sheet, and a `product-css` identity short of a home REFUSES one phase earlier;
  the outer `file.path !== THEME` was redundant with the per-declaration `file` test inside the same filter.
  Guide §4.1: an unreachable clause is deleted, not documented as a limit.

## §4.6 differential

**Method and its limits, stated first.** The legacy descriptors are gone from the tree, so the differential
below is a REAL-CORPUS outcome+population comparison against the receipts taken from the legacy modules
BEFORE the conversion (this lane's own base run at `1692583d6`), plus the population set diff above. It is
NOT a fixture-level replay through `lib/pass.ts#runPass`; per the vacuity rule, a both-sides-zero cell is a
population/outcome receipt and not catch parity, and the cells are labelled accordingly.

| policy | legacy (at `1692583d6`) | final (at `711e207d6`) | class |
| - | - | - | - |
| `css-selector-has-a-writer` | `184/184 selector hook; writers=183; vendor=1`, **0 findings** | 184 hook identities, **0 findings** across the pair; `classes=551` | **POPULATION IDENTICAL** (184 = 184), outcome identical. Both sides zero → an outcome receipt, not catch parity |
| `css-family-ownership` | `1029/1029 declarations`, **0 findings** | `declarations=1161; hooks=1291`, **0 findings** across the trio | outcome identical; the denominator moved by the DECLARED CORRECTION above (+132 at-rule-body declarations outside `theme.css`) |
| `css-family-direct-client-mechanism` | (no legacy policy — the arm was a silent count comparison) | `raw 3 = granted 3 + effective 0 · 0 alarms` | **EXEMPTION-MECHANISM MOVE** (guide §4.6 category 5): the legacy side was 0 because the counts matched; the falsifier is not "does it still catch" but "did every hidden site become exactly ONE live, consumed row" — 3 = 3, measured |
| every `-health` arm | 0 (the arms were reached by ZERO proof rows — audit cuts f02/f03/f07, control 49/49) | 0 on the real tree; each arm now has a `mustFlag` that dies without it | the retirement commit's "costs nothing in instrument health" claim is now PROVEN rather than asserted |
| anchor move (§4.6 category 6) | synthetic `column: 1` composite tokens | authored slices at real coordinates | **owed a receipt, and it is the marker census: 0 = 0 = 0, so no positioned waiver can be orphaned** |

The one behavioural DELTA a reader should look for: `css-family-direct-client-mechanism` AGGREGATES to one
finding per `(carrier, hook)` class. `slot:message-list-scroll` is skinned by three selectors — the exact
cardinality the retired count spelled as `3` — and a per-selector shape would make its grant row match three
candidates, license NONE of them and alarm `over-broad` on arrival. `mustFlag[1]` is that row.

## The `unwrapExpression` → shared-reader swap, with its own differential

The brief required replacing `lib/css-selector-writers.ts`'s one `ast-read.ts` import. Done, and the split is
deliberate:

- **VALUE reads moved** to `lib/reference-fact.ts` (`readStaticString` for an element-access key,
  `resolveStableExpression` for the HAST `properties` initializer). That is a **WIDENING**, not a rename:
  `el["data-x"]` still resolves and `el[DATA_X]` now resolves too, and the same swap landed in
  `css-family-source-provenance.ts`'s computed property name and accessed-member name.
- **The STRUCTURAL strip stays `unwrapExpression`**, at exactly one site: an assignment TARGET
  (`(x.className) = y`) is a member access, and `resolveStableExpression` correctly refuses one as a dynamic
  terminal. This is the layering `reference-fact.ts` itself uses — it calls `unwrapExpression` and then
  resolves — and 16 CONVERTED gate modules import the same helper today, so it is not the boundary
  `shared-semantic-readers.md:33` rules against.
- **Differential:** on the real tree the writer census is unchanged in every published figure —
  `writers=183 / vendor=1 / 184 hooks` (legacy) against `hooks=184 / classes=551` (final), 0 findings both
  sides. The widening adds resolutions the legacy reader refused; it removes none, and no live site on this
  tree used the wider spelling.

## Deviations and refusals, each with its receipt

1. **`lib/css-family-census.ts` was edited, and the brief fenced it out.** It had to be: `readCensus` was the
   ownership gate's entire census and its `existsSync`/`readFileSync` is the forbidden machinery the
   conversion exists to remove. What I did NOT touch: `EXPECTED_DIRECT_THEME_DECLARATIONS`'s value, its
   comparison, or its prose (#2230). What I deleted is the DEAD half — the reader and the second CSS parser —
   because constitution §4 forbids leaving the old structure beside the new. (Orchestrator-ruled, note in
   this lane's fork exchange.)
2. **`lib/css-selector-writer-policy.ts` was deleted** though the brief did not list it. It was the singleton
   (one importer) policy lib of the converted gate and dissolves into it; treated as in-fence by necessity
   and confirmed by the orchestrator.
3. **The Base UI manifest↔installed arms (audit w04/w05) are RETIRED, not converted.** The brief asked for
   rows; the honest answer is a MERGE (guide §8 step 3). Receipts: the subject is `baseui-surface-manifest`'s
   (the version-bump tripwire), that gate's per-PART `identity()` now carries `state` and therefore subsumes
   this module's aggregate attribute-NAME diff strictly, both arms were measured UNENFORCED by the audit
   (cuts w04/w05), and both are EMPTY on the real tree (manifest 75 attributes, installed 75, symmetric
   difference zero in both directions — measured in this lane).
4. **`hookCoordinate`'s refusal branch is UNFALSIFIABLE, and the construction was attempted rather than
   argued.** A `[data-probe="a(b)"]` fixture written as a `mustRefuse` row did NOT refuse: it reported two
   ordinary findings at coordinate `[data-probe="a`. Every authored hook slice begins with `.` or `[`,
   neither excluded by the grammar, so `waivableCoordinate` never returns `undefined`. The branch stays (the
   helper is typed `string | undefined` and a silent fallback would mint an unnameable finding) and the row
   was deleted rather than faked.
5. **`Core-Enforcement-Active-Gates.md` is `not formatted` at MAIN's own bytes.** Probed by writing
   `git show main:<path>` to a scratch path and running the checker: exit 1 before any edit of mine. The red
   is inherited; `format:docs` was NOT run on a shared multi-lane roster.
6. **`gate:contract`'s absolute total was not measured on `main`.** A lane cannot run it against another
   commit without a second worktree. What IS measured: 331 findings across 308 modules with **ZERO for all
   five converted modules** (grep of the module paths in the output = 0), and the modules rose by exactly the
   three new ids.

## Floor

| command | result |
| - | - |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | 2/2 PASS, exit 0 |
| `pnpm check:policy-conformance` (whole) | 266 policies · 3191 rows · 22 refusal rows · **0 failures** · 219 grants · 0 invalid, exit 0 |
| `pnpm gate:contract` | 331 findings / 308 modules; **0 for each converted module**; +3 modules |
| `pnpm check:structure --check` × 5 (real tree) | all exit 0 · effective 0 · 0 alarms · 0 tool errors · 0 withheld; grant policy `raw 3 = granted 3` |
| `pnpm check:structure --check enforcement-registry-parity` | exit 0 at 308 registered gates |
| `pnpm check:structure --check finding-overload-provenance` / `gate-ignore-inventory` | 5 and 2 findings, **none in this lane's modules** (all pre-existing: `css-var-defined`, the baseui/seed headers, two product markers) |
| `pnpm test:scoped` × 4 suites | 25/25, exit 0 |
| `pnpm exec biome check … --diagnostic-level=error` (19 files) | exit 0 |
| `pnpm exec eslint` (19 files) | exit 0 |
| §4.1 sweep | 36 fences, 35 enforced, 1 classified, 2 deleted, 7 rows added |
| marker census | `N=7753 · control 1203 · 0 = 0 = 0` for all five ids |
| `pnpm check:docs` on the roster | exit 1, **inherited** (main's own bytes probe: exit 1) |

## Coupled suites the id-grep found, and one it could not

- `tests/tooling/check-gates.repo.int.test.ts` — both names left `UNFIXTURABLE_GATES` with the prose block
  the `tokens-contract` / `playwright-css-topology` conversions established.
- `tests/tooling/static-class-consumers.int.test.ts` — the two converted consumers left the legacy
  `verifyGateProofs` call.
- `tests/tooling/verify/gates/css-selector-has-a-writer.int.test.ts` — DELETED, superseded by the family test.
- `tests/tooling/verify/gates/mirror-index-family.suite.test.ts` — the new family test's path appended to the
  parked roster (main's `183e49714` pin).
- **`tests/tooling/static-class-collection.int.test.ts` — the one an ID-GREP CANNOT FIND.** It names no gate
  id; it imported the four retired lifecycle functions. It is the SUCCESSOR PROOF and is rewritten, not
  deleted: two probe consumers of the fact, `expect(seen[0]).toBe(seen[1])`, `evaluators: 1`,
  `dispatchedNodes: 37`, `rootEvaluations: 7` — byte-identical to the legacy figures — and a second
  invocation proving the collector cannot be reused. Two assertions changed instrument and say so in place:
  the `forEachDescendant` walk counter measures the LEGACY dispatcher's mechanism and is 0 under the final
  one, and `projectArrays` is now 1 per invocation (the RUNTIME resolving its population) rather than 0,
  because a final policy cannot reach a `Project` at all.

## LEDGER ROWS (1 row)

| # | Module / file | Defect | Evidence | Class | State |
| -: | - | - | - | - | - |
| 1 | `tooling/src/verify/contract/resource-css.ts` — `CssSelectorHookFact` | The hook fact published the attribute's OPEN offset and not its close, so the authored slice an ORDINARY finding needs as its waiver position was unrecoverable from the fact. Every consumer would have re-derived one — the private-reader shape §12.3 bans, at the one place a wrong answer mints a permanently unwaivable finding | measured while converting `css-selector-has-a-writer`: `hookFacts` computes `selector.authored.slice(hook.open, hook.close + 1)` internally and then drops `close`. Closed in this commit by publishing `authored` | shared-reader gap | **FIXED** (`6ddca708c`) |

Rows this conversion CLOSES from `css-family-audit-2026-09-12.md` (the orchestrator owns the flip): 8
(`zero-declarations` now reached by `css-family-ownership-health` `mustFlag[0]`), 9 (`zero-theme-values`,
`mustFlag[1]`), 10 (`fullHomeSet` — DELETED as unreachable), 11 (the seven count ratchets — four retired,
three derived), 13 (the number's three homes become one), 17 (w04/w05 — merged into
`baseui-surface-manifest`, with the receipt in §"Deviations" above). Row 12 (#2230) is untouched and OPEN.

## The #1584 landing comment

> **`css-family-ownership` + `css-selector-has-a-writer` → five final policies, one family
> (`css-hook-provenance`), `6ddca708c`.** The pair converted as one unit because they shared a module-global
> collector; that state became a `defineFact` PROVIDER rather than `create` state, because `create` is per
> policy and the sharing is the point (§12.3's named home; the successor proof asserts two consumers read the
> same object with `evaluators: 1`). Each module SPLIT by authority: ordinary policies whose findings anchor
> on authored CSS slices — a door neither had before — plus a `hard` `-health` sibling for the instrument
> verdicts, plus a `reviewed-grant` policy carrying the three bounded direct-skin recipes as 1:1 grants
> (`raw 3 = granted 3 · 0 alarms` on the real tree). Population port byte-identical two-way (1686 = 1686,
> symmetric difference 0, planted controls both directions). Four bare count ratchets retired, three derived
> seams kept, `EXPECTED_DIRECT_THEME_DECLARATIONS` read and untouched (#2230). 36 fences cut with a
> denominator: 35 enforced, 1 classified, 2 dead guards deleted, 7 new rows. Marker census 0 = 0 = 0
> (N=7753, control 1203). Audit rows 8, 9, 10, 11, 13, 17 close; the Base UI reconciliation MERGED into
> `baseui-surface-manifest#identity()` rather than converted, with its receipts.

## Proposed lessons (report text — the orchestrator owns the memory write)

- **A module-global pass shared BETWEEN gates converts to a `defineFact` PROVIDER, never to `create` state.**
  `create` runs per POLICY, so create-owned state multiplies the walk by the number of consumers — and a
  legacy global that two gates deliberately shared is, by construction, the shared-whole-population work
  §12.3 gives `defineFact`. The tell is a `begin` hook whose second call is a documented no-op.
  Hook: `a shared begin-hook global converts to defineFact, not to create`.
- **A CUT THAT DELETES A DEDUPE GUARD IN FRONT OF A KEYED MAP IS A WRONG-DIRECTION CUT.** `Map.set` on the
  same key still collapses, so the sweep reads the dedupe as unenforced. The FENCE is the KEY function; cut
  that instead. Measured twice in one sweep, and the second one also needed the key to include the FILE —
  two occurrences at offset 0 of different sheets have identical offsets.
  Hook: `cutting a has() guard in front of a Map is not cutting the dedupe`.
- **A resource fixture that supplies a door's SUBJECT but not its SHAPE makes an intersection fence
  unfalsifiable.** The Base UI acquittal is `manifest ∩ installed → values`; a fixture whose installed side
  has neither the surface NOR the values cannot discriminate the intersection, because both terms are empty.
  The discriminating fixture supplies ONE side — a `*State` interface with no component entry — which is
  exactly what a vendor removal leaves behind.
  Hook: `an intersection fence needs a fixture where the two sides DISAGREE`.
- **`installed-package {mode:"ast"}` returns PATHS, never a parsed surface** — a consumer needs a `lib/`
  reader with the `tooling-project-home` grant to parse them, and the version is a SECOND argument because
  no declaration path carries it. A policy comparing only anatomy passes `""` and says so.
  Hook: `installed-package ast mode is paths only`.
- **A CSS hook fact's `authored` slice is the waiver position.** Publishing the open offset without the close
  forces every ordinary consumer to re-derive a coordinate; the fact should carry the exact slice at its own
  offset. Generalises to any fact whose position an ORDINARY policy will anchor on.
  Hook: `a fact an ordinary policy anchors on must publish its authored slice`.

## LEG 2 — the duplicated proof rows (integration review of `6ddca708c`)

FOUR duplicate `mustPass` rows, not two: the integration review named health's CUT f25/f26 pair, and the same
double-application had also landed ownership's CUT f01/f06 pair — one edit script wrote both gates, threw on
an assertion against a THIRD file, and a corrected re-run re-applied all of it. Deduped to one row each,
keeping the sharper `why` (health f26's retired-parser regex receipt; ownership f06's FIXTURE-vs-fence
emphasis). **The cut matrix above is corrected by this: f01, f06, f25 and f26 each read `rows died: 2` because
the row was present twice, and each now reads `rows died: 1` — re-cut after the dedup
(`mustPass[13]`, `mustPass[14]`, `mustPass[3]`, `mustPass[4]`).** No other row was duplicated: the selector
gate's f30/f37/f38 are one each, checked by count. No duplicate MEMBERS key exists and none was looked for.

## LEG 3 (#2305) — the four clauses the independent verifier returned PARTIAL on

`cb-v-css-family`'s report (`v-css-family-2026-09-13.md`, over the integrated `9104f718f` + `3c685ce6a`)
returned PARTIAL with six ledger rows. Four were mine to close; each is closed here RED-FIRST, and each
correction supersedes the line of this report it names.

### A · f28 was UNENFORCED, not mutually redundant — and the joint cut proved the opposite of what I read

**Superseded:** the cut-matrix row `f28 … 0 alone, 1 JOINT` and the "MUTUALLY REDUNDANT → f28" bullet.

The joint cut with both `isPropertyAssignment` guards does not FLAG — it **TOOL-ERRORS**
(`FACT TOOL ERROR [css-hook-provenance:visit] Cannot read properties of undefined (reading
'getInitializer')`). Guide §4.1 names that shape exactly: *a joint cut that tool-errors means the surviving
clause is a TYPE OBLIGATION*, which is not evidence of redundancy at all. I read a crash as a finding, which
is the same class of error as reading a clean cut as an unenforced fence.

§4.1 then binds — *before recording UNFALSIFIABLE, write the row that would discriminate and RUN it* — and a
row does exist. Landed as `css-selector-has-a-writer` `mustFlag[5]`: a HAST-shaped object whose `type` is
`"text"` rather than `"element"`, carrying the selected hook in its `properties` bag.

| arm | receipt |
| - | - |
| tip, fence intact | family test green, the row PASSES |
| **cut alone**, `type === "element"` test deleted | **`rows died: 1 — css-selector-has-a-writer:mustFlag[5]`** (it was `0` before this row existed) |

**CORRECTED MATRIX SUMMARY: 36 fences · 34 ENFORCED · 1 was-UNENFORCED-now-PINNED (f28) · 1 non-verdict
prefilter (f29) · 2 deleted (f20, f24).** The earlier "35 enforced / 1 classified" is withdrawn.

### B · `blur` and `colorization` were bare count ratchets wearing a derivation's name

**Superseded:** the whole "`density` / `blur` / `colorization` — KEPT, and re-read" bullet, and the same
sentence in the `css-family-ownership-health` header and in the roster row.

The verifier is right and the receipt is unanswerable: `blur: CLIENT_BLUR_FILL.size * 2` and
`colorization: CLIENT_COLORIZATION.size * 2` multiply a declared set by a LITERAL naming no vocabulary — the
blur predicate admits exactly one selector and the colorization predicate declares no selector set — so the
`2` encoded how many carriers write those properties TODAY. Their planted control: a third legitimate `:root`
blur carrier, **changing no vocabulary anywhere**, reddened five rows. Only `density` was
`DECLARED_SET.size * DECLARED_SET.size`.

**The fix is not a better factor; it is dropping cardinality altogether.** The honest property is COVERAGE:
every member of a seam's declared vocabulary must be written AT LEAST ONCE. It derives entirely from the
declared sets, nothing counts occurrences, and the arm got STRONGER — it now names WHICH member is missing
where the count only said a total moved. `EXPECTED_RUNTIME_WRITERS` is DELETED from
`lib/css-family-census.ts`; the seams keep their vocabularies and gain member sets.

| receipt | result |
| - | - |
| b00 identity control | 0 rows died |
| b01 the coverage loop cut | **2** — both seam `mustFlag` rows |
| b02 density `covers` → `undefined` | **10** |
| b03 blur `covers` → `undefined` | **10** |
| **b04 blur MEMBER SET → `[]`** | **1** — *the expectation now dies with the declared set, which is the claim* |
| **b05 density MEMBER cross-product → `[]`** | **1** — same, over `DENSITY_SELECTORS × DENSITY_SPACING` |
| the verifier's planted control, now a COMMITTED row | `css-family-ownership-health` `mustPass[5]`: a third legitimate `:root` blur carrier is SILENT, where it reddened five rows under the retired cardinality (their measurement, cited — not re-run here) |
| the stray-carrier half | `css-family-ownership` `mustFlag[33]`: a seam property written OUTSIDE its seam position is an ORDINARY finding at the declaration, because it is a generated-family write no seam sanctions. The two arms together mean a member can neither vanish nor be written where it does not belong |

The fixtures shrank with the counts: `BLUR_SEAM_COMPLETE` and `COLORIZATION_SEAM_COMPLETE` had each invented
a second arbitrary carrier purely to reach the factor, and one honest carrier is now the complete seam.

### C · the fact has THREE consumers, not five — in four prose homes

**Superseded:** "five consumers" in the provider header and its `THE ONE ENTRY POINT` line, "four sibling
policies" in `css-family-ownership`, "four other policies" in `css-selector-has-a-writer`, and "one collector
serves all five family members" in the roster row. All four corrected: both `-health` siblings declare
`facts: []` and read the CSS identity alone. (This report's own deviation section said "THREE policies
needing it" and was already right — the code prose counted the FAMILY.)

**Pinned two-sided** in `css-hook-provenance-family.suite.test.ts`, because a prose count nothing holds is exactly
what recurs: the DECLARED half (`policy.facts.includes(cssHookProvenanceFact)`, an identity check over the
five loaded descriptors — which is what `selectedFacts` dedupes on) must equal the CALL half (a literal
census of `ctx.fact(cssHookProvenanceFact)` across the whole `gates/` directory), with a planted positive
control in the same invocation (`anyFactCall > 3`, `modules > 200`) so a bare zero cannot read as agreement.
A second test asserts both `-health` gates' `facts` are `[]`.

**RED-FIRST:** adding `cssHookProvenanceFact` to `css-family-ownership-health`'s `facts` (cp-backed,
trap-restored) reds it with
`expected [ 'css-family-direct-client-mechanism', 'css-family-ownership', 'css-family-ownership-health',
'css-selector-has-a-writer' ] to deeply equal [ …three… ]` — and, independently, the RUNTIME refuses the same
overstatement (`FACT TOOL ERROR [css-hook-provenance:population] Invalid population resolution: candidate
corpus is empty`, because a `-health` fixture has no TS source to walk).

### D · the one-collector pin could not see a second collector

**Superseded:** "**Receipt that the sharing holds**" — that receipt proves the fact RAN once, not that it
built one collector.

`seen[0] === seen[1]` and `evaluators: 1` prove the two CONSUMERS share a value object. They say nothing
about how many collectors the PROVIDER built, because `work` is read off the published instance and a sibling
collector is a different object — the verifier proved it by handing `createSelectorWriterPass` its own
`ClassCollector`: suite GREEN, `check:structure` byte-identical. Verdict-neutral, and a straight doubling of
the ~14 s walk **the `defineFact`-over-`create` deviation was justified on**. The one property the deviation
rests on had no pin.

`lib/static-class-expression.ts` gains a module-level CONSTRUCTION counter — `staticClassCollectorMints()`
plus the `__resetStaticClassCollectorMints` seam — because a different object is the one thing an
instance-level counter cannot see. It counts constructions, never mutation a verdict depends on, and nothing
in the module reads it.

| arm | receipt |
| - | - |
| the pin | `expect(staticClassCollectorMints()).toBe(1)` after one invocation, `toBe(2)` after two (the fact's `create` runs once per invocation, so two drives are honestly two collectors) |
| **RED-FIRST, the verifier's exact PROBE A** | `createSelectorWriterPass(new ClassCollector(ctx.files))` → **`AssertionError: expected 2 to be 1`**, where the same probe previously left the suite GREEN. Restored |
| the COMMITTED control | a second test builds two collectors directly and asserts the counter moves 0 → 1 → 2 **and that their `work` objects are equal** — the instrument seeing the duplicate that `evaluators` cannot, committed rather than probed |

### Not mine, and stated rather than silently skipped

- **Verifier ledger row 3** (the Base UI retirement leans on `baseui-surface-manifest`'s vanished-PART /
  vanished-COMPONENT directions, themselves unenforced under open **#2297**). The fix is to CITE #2297 beside
  the retirement, and the retirement text lives in `css-selector-has-a-writer-health`'s header — mine. Added
  there.
- **Verifier ledger row 6** — `reviewed-grants.test.ts`'s determinism assertion is RED on `main` and was RED
  at `9104f718f^`; the three css rows sit at their sorted indices. INHERITED, not this lane's, and not
  touched.
- **The three in-module throws in `vendorCensus`** and `selectorCoordinate`'s twin are pinned by nothing
  (verifier's "what I did not cover"). Not addressed in this leg — no row filed by them, none filed by me;
  flagged for the orchestrator as remaining work rather than claimed.

### Floor (bounded — `check:policy-conformance`, `pnpm check` and CT deliberately NOT run)

| command | result |
| - | - |
| `pnpm check:structure` with all five `--check` ids, one run | exit 0 · `5 ran · raw 3 = granted 3 + effective 0 · 0 alarm(s) · 0 tool error(s) · 0 withheld` |
| `pnpm test:scoped` css-hook-provenance-family + static-class-collection + static-class-consumers | 3 files / **11 tests**, exit 0 |
| `pnpm exec biome check <10 files> --diagnostic-level=error` | exit 0 |
| `pnpm exec eslint <10 files>` | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | 2/2 PASS, exit 0 |
| `doc-catalog format --check` on CEAG | exit 1 — **INHERITED**, confirmed by the verifier's own cp-backed probe of `9104f718f^`'s bytes at the same path; one row edited, `format:docs` NOT run on a shared roster |
| the clause-B cut set | 5 fences + control, every one enforced |

**STALE FIGURE CORRECTED:** this report's floor table says `3191 proof rows`. That was the pre-dedupe count;
after the four duplicates came out it is **3187**. Leg 3 adds three rows (the f28 `mustFlag`, the
stray-carrier `mustFlag`, the third-carrier `mustPass`), so the corpus figure moves again — the exact number
is UNMEASURED here because `check:policy-conformance` is whole-tree and fenced this leg. The bounded
five-policy structure run above is the verdict I do have.

ledger rows OWED: 0 new. Verifier rows 1, 2, 4 and 5 are CLOSED by this leg; row 3 is answered by a citation
(the underlying arm is #2297's); row 6 is inherited and untouched.

#### Leg 4 — the prose the leg-3 runtime change left behind

**Two homes were named; FOUR carried the untruth**, and the extra two are the ones a reader is most likely to
believe. `css-family-policy.ts:163-165` was an ORPHANED duplicate JSDoc block sitting directly above the live
one (a leg-3 slice that started a line late), still crediting the DELETED `EXPECTED_RUNTIME_WRITERS` with
deriving cardinalities — re-derived rather than assumed: `pnpm ast refs EXPECTED_RUNTIME_WRITERS` gives *no
declaration found*, `scanned=7578 status=complete matches=0`, corroborated by a literal grep that finds the
name only inside comments. `css-family-policy.ts:505-507` promised "written exactly once" while `:521-535`
asks PRESENCE; that line and the two homes the brief did not name — `css-family-census.ts:28-31`, which
contradicted the paragraph directly below it, and `css-family-ownership-health.ts:15-23`, the third home the
verifier's own ledger row 4 listed — now say what the loop does: every declared member covered AT LEAST ONCE,
occurrences never counted, a second legitimate carrier silent, the finding naming the member nothing writes.

**And 13 literal escape sequences my own leg-1/leg-3 edit scripts wrote into shipped comments are repaired**
(`\u2014`, `\u00a7`, `\u2265` across four modules, two of them inside proof-row `why` STRINGS). A python
string written into a `.ts` COMMENT keeps the backslash literally, so the file ships `\u2014` where an em
dash belongs — invisible to tsc, biome, eslint and every gate, and wrong only for the human the comment is
addressed to. Verified prose-only: `git diff -U0` shows no changed line outside a comment or a `why` field,
`git diff --check` is clean, and the family suite is unchanged at 7 tests.

## LEG 5 (#2305 residue) — the five points the re-lens verifier refuted

The re-lens verifier (`v-css-unit-2-2026-09-13.md`) CONFIRMED both conversions and refuted five residue
points. All five are closed below; every number here is measured on this branch, not predicted.

### 1. The colorization member set had no proof row — now `mustFlag[5]`, and the cut pair proves it

Density was held by `mustFlag[3]` and blur by `mustFlag[4]`; colorization was held by NOTHING, so emptying
its declared vocabulary — silently disabling that seam's whole catch — was invisible to every declared row.
The new row's fixture writes `--color-border` and not `--color-sidebar-border`, so exactly one declared
member is uncovered and the finding names it (`expect: { count: 1, messageIncludes: "runtime writer seam
colorization never writes --color-sidebar-border" }`).

The seam × cut matrix, one child per cut, restored after each (`git status --short` clean between children):

| cut | mutation | rows that die |
| - | - | - |
| b04 | `CLIENT_BLUR_FILL` emptied | 1 — `css-family-ownership-health:mustFlag[4]`, "expected at least one effective finding but got 0" |
| b05 | bogus `--blur-fill-bogus` member added | 11 — five `mustFlag` (+1 finding each) and all six `mustPass` |
| b06 | `CLIENT_COLORIZATION` emptied | 1 — `css-family-ownership-health:mustFlag[5]`, the NEW row (ZERO before it existed) |
| b07 | bogus `--color-bogus` member added | 11 — five `mustFlag` (+1 finding each) and all six `mustPass` |

The two seams now measure IDENTICALLY (1 / 11), which is what makes the pair a measurement rather than a
coincidence — and b06's 0 → 1 is the whole point of the row.

### 2. The "third blur carrier" row was a SECOND carrier and INERT — the arithmetic is now the row

`CLIENT_BLUR_FILL.size` is 2, so the retired expectation was `size * 2` = FOUR DECLARATIONS and the retired
arm was `if (actual !== expected) report(…)`. `BLUR_SEAM_COMPLETE` ships ONE carrier writing 2 declarations,
so the committed "+1 carrier" row reached exactly 4 — `4 !== 4` is false, and the row was SILENT under the
very ratchet its `why` said it stopped. (The brief's "+1" arithmetic was wrong and the orchestrator confirmed
the correction: *"your arithmetic is right and my '+1' was wrong … Use THREE carriers / six declarations"*.
The transplanted control had reddened five rows only because `BLUR_SEAM_COMPLETE` then carried TWO carriers;
the same commit shrank it to one and took the discrimination with it.)

`mustPass[5]` now carries THREE `:root` blur carriers — six declarations. **The corruption control, run:**
re-introducing the retired `CLIENT_BLUR_FILL.size * 2` declaration count beside the coverage loop (a
scratch-copy cut, restored) reds `mustPass[5]` with `runtime writer seam blur matched 6 declarations; the
closed seam requires exactly 4`, while every OTHER `mustPass` reds with `matched 2` (the healthy fixtures
ship one carrier). At two carriers this row would have been the ONE row the returning ratchet left silent —
i.e. the only row that cannot detect its return. At six it is on the wrong side of the comparison by
construction, and under COVERAGE it is silent because every declared member is still written.

### 3. `css-family-policy.ts` — the fence comment's counts were the coverage rewrite's casualties

The comment inside `reportClosedSeamDrift` still said "three findings … 2 with it and 5 without", true of
the RETIRED per-seam count. It now states the INVARIANT ("seam coverage is unaskable without a generated
namespace; the fence keeps the verdict to the arms that name the cause") and notes that the right-hand
number is the seams' total declared membership, so it moves whenever a vocabulary does. **Measured (cut f23,
fence deleted): `mustFlag[1]` reports 2 with the fence and 14 without** — the 12 declared members
(8 density + 2 blur + 2 colorization) plus its own 2.

### 4. `css-family-proof-fixtures.ts:107-121` — the JSDoc promised a cardinality the constants had dropped

It still promised `CLIENT_BLUR_FILL.size * 2` = 4 over constants the same commit had shrunk to ONE carrier,
contradicted by the `ONE CARRIER EACH` note five lines below it. Rewritten to the PRESENCE semantics plus the
measured shape: density covers its 8 members with two arms; blur and colorization each cover their 2 members
with one carrier writing 2 declarations; twelve declared members across the three seams — the same 12 the
f23 measurement above independently produced.

### 5. `css-selector-has-a-writer-health.ts` — the #2297 sentence outran the tree, and #2309 does not reach it

The retirement sentence claimed the successor's VANISHED-PART and VANISHED-COMPONENT directions were
"measured unenforced by any proof row under OPEN #2297". Both were already pinned. Re-derived on this tree:

- `baseui-surface-manifest.ts:345` — `mustFlag[2]`, `count: 1`, the `state` term (its own `why` names it as
  the row that dies when `part.state` is cut from `identity()`);
- `:351` — `mustFlag[3]`, `count: 2`, "`Select.Separator` vanished from the installed package";
- `:357` — `mustFlag[4]`, `count: 1`, "component `Dialog` vanished from the installed package".

They landed in `dea1061df` (2026-09-12 23:09:23 -0600); the commit that wrote "measured unenforced" is
`dd98eb356` (23:27:43 -0600) — **eighteen minutes later, and `dea1061df` is its ancestor**
(`git merge-base --is-ancestor` exits 0), so the claim was false on the tree it shipped on. The rule it broke
is read-first §0 ruling 3: a recorded refusal is a snapshot, not a standing verdict, and it is re-derived
before it is inherited. #2297 stays OPEN for its other rows and is cited for those only.

**#2309 does not reach this citation**, and the check is a read rather than an assumption: #2309 is a
CHANGED-MODE SELECTION defect (a selected-files resource policy whose per-file visitors receive zero source
files when only a declared resource changed). `baseui-surface-manifest` declares
`population: { of: "none" }` (`:276`) and `execution: "entire-population"` (`:279`) and subscribes no
visitor, so it has no source population to under-select and defers whole under a narrowed request. The three
arms above cannot go stale-clean by that mechanism. That held before #2309 was repaired and holds after it —
the repair (`x-resource-selection-2026-09-13.md`, the `policy-effective-population` seam) landed on main
during this leg and arrived here in the pre-commit fast-forward; the reason the arms are out of reach is the
DECLARED POPULATION, not the planner, so the repair changes neither the statement nor its receipt.

### Leg-5 floor (scoped; no CT, no `pnpm check`, no policy-conformance, no whole-tree parser run)

- `pnpm test:scoped` on the three suites — **3 files / 11 tests passed**, including "the css-hook-provenance
  family keeps every declared proof arm" (which runs every `mustFlag`/`mustPass`/`mustRefuse` row of all five
  policies).
- `pnpm check:structure --family css-hook-provenance` — **exit 0**, `5 ran · raw 3 = waived 0 + granted 3 +
  effective 0 (0 error, 0 warning) · 0 alarm(s) · 0 tool error(s) · 0 withheld`.
- Six cut children (b04, b05, b06, b07, f23, the retired-ratchet corruption control), each applied to a
  `.cbxcfu-bak`-backed copy and restored, with `git status --short` verified between children.
- `pnpm exec biome check <5 files> --diagnostic-level=error` exit 0 · `pnpm exec eslint <5 files>` exit 0
  (it caught a REAL defect first: a tsdoc code span I had split across two comment lines in the fixtures
  JSDoc — `tsdoc-code-span-missing-delimiter` ×2 — fixed by joining it) ·
  `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` exit 0, `2 runnable, both PASS`.

**Every floor above was then RE-RUN after the pre-commit fast-forward onto main (`1b80182a7` → `06ebd7298`,
10 commits, no conflict), because that ff changed `css-hook-provenance-family.suite.test.ts` by +147 lines and
landed the `policy-effective-population` seam under my policies.** Post-ff: the three suites pass **3 files /
17 tests** (the family test now carries 13), `--family css-hook-provenance` is again exit 0 with
`raw 3 = granted 3 + effective 0 · 0 withheld`, and biome / eslint / typecheck are all exit 0. The pre-ff
numbers are kept above only to date the cut matrix, which was measured before the ff.

## Integration provenance (2026-09-13)

The leg-3 repair `0a301b3e3` and leg-4 prose correction `95f4a9723` landed as `dd98eb356` and
`f56e83d52`; both rebased patches are identical. Independent source review accepted the four behavioral
repairs and the coupled prose corrections. The integrated three-file floor passed 11/11 at `f56e83d52`:
`reports/runs/test/main-4128511-2026-09-13T05-44-47-564Z/test-report.json`.

The integrated planter later passed 10/10, including its two-sided legacy exemption check:
`reports/runs/test/main-4132528-2026-09-13T05-45-37-478Z/test-report.json`. This is an additional runtime
receipt, not a replacement for the independent CSS family re-verification, which remains pending. The
unpinned vendor-hook refusals are tracked by #2310. The inherited grant-ordering defect #2306 was verified
with an intentional row swap that failed exactly its ordering assertion and a byte-exact restoration that
passed 3/3; its fix is `78ec56ea6`. The BaseUI resource-selection defect #2309 remains open.
