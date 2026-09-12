---
kind: review
status: active
updated: 2026-08-31
---

# Cold grouped verification — CSS prevention/appearance Review train at `f83aa7071`

## Verdict

Cold verification was performed at the stable SHA
`f83aa70717c5dc6b92eef95f6e8d671c1623773d`. One of the twelve rows is ready to
leave Review: **#957 is CONFIRMED**. The other eleven are **REFUTED at this SHA**.
The Tailwind Variants return-contract repair in `f83aa7071` is behaviorally correct,
but #949 still owns dead exported API surface and therefore is not statically complete.

| Issue | Verdict | Board action now | Exact remaining work |
| - | - | - | - |
| #935 | **REFUTED** | Remain Review | Make the descriptor's planted controls fire under the real conformance runner; generate and execute the declared two-arm behavior at every carrier rather than only compare the two manifest literals; repair its ESLint, structure, fixture-import, type-home, knip, caught-failure marker, CT-reporter, and catalog-receipt failures. |
| #949 | **REFUTED** (behavior and `f83aa7071` return repair **confirmed**) | Remain Review | Remove or deliberately consume the unused exported `OrbCssHandle` and `CssClassOccurrence` API surface, then rerun knip/static. The previously reported `css-merge-parity.int.test.ts` possibly-undefined error did **not** reproduce at this SHA. |
| #951 | **REFUTED** | Remain Review | Repair the shared #961/#965 producer graph so the three live shell class writers are recovered; do not move/delete their CSS and do not refresh the four downstream census counts. Home/derive `ProductStylesheet` and `SelectorCombinator`, and remove the unused `readDirectThemeDeclarations` export. |
| #952 | **REFUTED** | Remain Review | Add governing pointers to all eight `css-var-defined` diagnostics, then rerun structure/static. The variable census itself was populated and clean. |
| #954 | **REFUTED** | Remain Review | Stop the shared static-class substrate from routing the non-class computed JSX spread at `app-shell.tsx:248` into the dark-variant consumer while retaining a planted unresolved computed-*class* control. |
| #955 | **REFUTED** | Remain Review | Apply the same substrate repair to the length consumer and add governing pointers to both `css-length-tokens` diagnostics. |
| #956 | **REFUTED** | Remain Review | Repair writer recognition for all eleven live producers listed below; none of the selectors should be deleted from the raw output. Add the gate diagnostic pointer and make `DataWriter` private unless it becomes a real API. |
| #957 | **CONFIRMED** | May move Review → Verify; the orchestrator may complete the normal Verify → Done evidence transition | None in this issue's four-file stale-guidance scope. The retired `ctx-tab-strip` literal is absent from live TS/TSX/CSS; remaining references are historical/amended prose and negative CT assertions. |
| #959 | **REFUTED** | Remain Review | Make topology scanning AST/import-aware so CSS-looking test strings and path constants cannot counterfeit imports; remove or ratify its excess suppression; reconcile the exact lawful CSS-front-door edge with `client-feature-front-door` instead of changing the mandated source order. |
| #961 | **REFUTED** | Remain Review | Fix `importedSource`'s missing terminal return, the always-true object diagnostic conditional, the two test-layout mirror misses, and the unused `staticClassCollector` export; repair the non-class computed-spread dispatch shared with #954/#955. |
| #965 | **REFUTED** | Remain Review | Preserve the bounded one-pass performance work but repair its producer/terminal regressions: recover the eleven live CSS writers and stop evaluating arbitrary non-class spread properties. Re-run the 42/42 focused tests and the real-tree gates after repair. |
| #966 | **REFUTED** | Remain Review | Finish the hard migration: 112 of the 241 current gate files still declare `run:` and/or `visitFile:` compatibility hooks. Convert the full remaining population to the shared walk/memo model, retain byte-equivalent findings/scan receipts and two-direction controls, then remeasure at a stable SHA. |

## Confirmed findings

### P1 — #935's active gate is false-clean because none of its planted failure fixtures fire

`tooling/src/verify/gates/appearance-carrier-contract.ts:388` declares three
`mustFlag` fixtures, but `tests/tooling/check-gates.int.test.ts:1255` reports
`appearance-carrier-contract` as the sole registered gate that never fired. The real-tree structure
pass simultaneously printed a clean `41/41 appearance keys` receipt, demonstrating the dangerous
failure mode: the instrument can say clean while its own missing-key/wrong-owner/composed-bad-row controls
are dead. Evidence: the focused Vitest command ran 130 tests; 129 passed and the anti-drift assertion
failed with `expected [ 'appearance-carrier-contract' ] to deeply equal []`. Repair the fixture execution
or gate scope so all three mustFlag arms fire and the mustPass arm remains clean before trusting its
real-tree zero. This violates the non-vacuity/planted-positive rule in agent doctrine and the gate row at
`Core-Enforcement-Active-Gates.md:72`.

### P1 — #935 declares test arms but never executes them against the named carrier

`packages/client/src/lib/appearance-carrier-manifest.ts:107` declares `requiredDistinctArms` for 32 of
the 41 rows, but the only production/test reader is
`tests/client/lib/appearance-carrier-manifest.test.ts:39`, which merely checks that the two serialized
values differ. The structural gate likewise only compares arm syntax and checks that an identifier with
the key's spelling occurs somewhere inside a named function (`appearance-carrier-contract.ts:212-236`);
it does not apply either value or observe the carrier. Complete literal and AST sweeps over 4,970 TS and
1,323 TSX files found no generated carrier-pair executor. Only two tests are labelled #935, covering a
custom-light portal and message-header ink; both raw browser tests passed, but they do not exercise the
manifest matrix, and the CT wrapper refused the run because `message-row.ct.tsx` emitted no route marker.
Thus a key can name a function and two unequal values while both values render identically or the real
write disappears. Generate/drive each declared pair at the correct plane and assert the stated DOM/prop/
computed-style observable, including dependencies and portal obligation.

### P1 — #951/#956 are red on live writers because the #965 producer graph lost real terminals

The complete structure pass reports three #951 ownership failures and eleven #956 writer failures, but
literal and structural sweeps proved all eleven hooks have live producers:

- `rail.tsx:102` writes `shell-rail-brand-button`, `rail-button.tsx:53` writes
  `shell-rail-button`, and `chat-recall-indicator.tsx:97` writes `shell-chat-recall-chip`;
- `weave-glyph.tsx:53` writes `orb-weave-shimmer`, and `message-row-variants.ts:187` writes
  `orb-echo-box`;
- `scroll-fade.ts:16` and `:18` export the two live scroll-fade class constants;
- `orb-web.ts:61-62` writes `orb-web-spokes` and `orb-web-pulse` through the icon tuple factory;
- the seed/theme runtime writes `data-theme="light"` and `data-theme="mocha"`, proven by the live
  theme CT/e2e consumers.

The three #951 class findings are the same missed-writer defect; its four `census:*` findings are only
the resulting stale count receipt. Deleting/moving these selectors or refreshing the counts would encode
the blindness. Repair the shared collector/terminal adapters, retain the inert-string/counterfeit-object
negative controls, and require both gates to return zero on this real tree. `css-family-ownership` scanned
960 declarations; `css-selector-has-a-writer` scanned 183/183 selector hooks and reported writers=171,
vendor=1, opaque=571, unresolved=10.

### P1 — #954/#955 consume an arbitrary computed JSX spread as though it were a class expression

Both gates report `packages/client/src/features/app-shell/surfaces/app-shell.tsx:248` as
`unresolved:computed selected-property key`. The source is
`{...{ [LIVE_TOKEN_ROOT_ATTRIBUTE]: "" }}`, a data-attribute spread on the shell grid, not a class
carrier and not a length/dark value. The same false finding reaching two independent class consumers
proves the shared selection/dispatch layer is too broad. Repair #961/#965 so only a selected class-bearing
property is evaluated; keep an explicit unresolved computed-*class* mustFlag fixture so the repair cannot
hide a real dynamic class. The current unit controls all pass, which means this real-tree negative case is
missing from them.

### P1 — #959's topology gate regex treats CSS-looking data strings and path constants as imports

`tooling/src/verify/gates/playwright-css-topology.ts:116-127` applies a text import regex to every file
under `tests/`. It flags four sites that do not import CSS: custom-CSS payloads such as
`"@import 'x.css'"` in `tests/kit/css-validate/index.test.ts:17` and
`tests/server/domain/settings/verbs/create-theme.int.test.ts:76`, and stylesheet path/assertion text in
`tests/ui/styles/css-structure.suite.test.ts:12-18`. The server file is reported twice because it contains
two data strings. Use parsed ImportDeclarations (or an equivalently exact blank-string-aware reader),
retain a planted direct CT CSS import, and prove these three negative controls pass.

### P1 — #959's mandated front door violates the still-active client feature boundary

`packages/client/src/styles/index.ts:4` imports
`../features/app-shell/surfaces/shell.css`, exactly as client lockdown §4.5 requires for the single ordered
CSS front door, but `pnpm depcruise` rejects that edge under `client-feature-front-door`. This is a law/
enforcement collision, not permission to restore duplicate CSS imports: add the narrow exact CSS-front-door
exception (or a law-consistent public CSS seam) while keeping shell first and client globals second. The
current depcruise result is one error over 4,103 modules and 23,217 dependencies.

### P1 — #961/#965 do not compile cleanly and their test layout is structurally invalid

`tooling/src/verify/lib/static-class-expression-model.ts:33` lacks a terminal return after the candidate
loop (`TS7030`), and `tooling/src/verify/lib/static-class-object.ts:153` contains an always-true conditional.
`tests/tooling/verify/lib/static-class-collection.test.ts` and
`static-class-consumers.int.test.ts` prefix-swap to nonexistent singular source modules, so the test-layout
gate reports both. `staticClassCollector` is also exported but unused. Evidence: `pnpm typecheck` failed
with the single TS7030; focused ESLint failed on `static-class-object.ts:153`; structure reported both
layout misses; knip reported the unused export. Repair without creating dummy alias modules.

### P1 — #966 is explicitly a first tranche, not the authorized full hard migration

The research authority states that 110 gates declined the shared walk and that the unified model is
existing law (`docs/reviews/research/2026-08-31-gate-pass-unified-walk.md:140-172`). The issue's sole
implementation comment labels the landed work the first tranche and names the remaining tail. At this SHA,
an `rg` census over all 241 gate files finds 80 files with `run:`, 35 with `visitFile:`, and 112 unique
files with one or both. Ast-grep independently scanned all 241 gate files; the original fragment query
produced no match and therefore was not used as absence evidence. The issue cannot graduate until the
complete population rides the shared walk/memo path and byte-equivalence/non-vacuity are re-proved. The
owner's no-skipped-hard-migration ruling makes partial performance improvement insufficient.

### P2 — #935's source, tests, suppression, and catalog receipts are statically red

Focused ESLint reports three strict-boolean-expression errors in
`appearance-carrier-contract.ts:229,234,242`. Structure adds one diagnostic-legibility error, two
inline-union re-declarations (`appearance-carrier-manifest.ts:14-15`), two forbidden direct Vitest fixture
imports (`appearance-carrier-manifest.test.ts:4`), and a caught-failure marker/ownership mismatch at
`tooling/src/_shared/appearance.ts:85-88`. Knip reports the exported `AppearanceCarrierRow` unused.
`pnpm check:doc-catalog` also reports the Core-Enforcement catalog receipt's `verifiedCommit`
`fce6b2b1...` is not an ancestor of this landed cherry-pick (`a3c51c5d...`). Repair the source rather than
ratcheting suppressions; re-attest the catalog at the integrated ancestor.

### P2 — #951/#952/#955/#956 still violate active gate-authoring/type-home/dead-code gates

Structure reports twelve diagnostic-legibility failures: eight in `css-var-defined`, two in
`css-length-tokens`, one in `css-selector-has-a-writer`, and one in
`appearance-carrier-contract`. It also reports `ProductStylesheet` outside a type home and the re-spelled
`SelectorCombinator` union. Knip reports `readDirectThemeDeclarations` and `DataWriter` unused. These are
item-owned failures in newly landed enforcement code; they cannot be waived as unrelated. Add concrete
doc/code-home pointers, derive/home the types, and make non-API declarations private.

### P2 — #949's behavior is correct, but its newly exported API surface is dead

`f83aa7071` correctly normalizes Tailwind Variants' empty ordinary and slot results to `""` and uses
`Proxy` so callable generic/attached recipe metadata survive. The focused class-merge suite passed all
ordinary, slot, extension, modifier, arbitrary, empty-return, once-only trace, and later-wins cases. The
compiler parity suite passed with 1,585 files / 2,335 roots / 2,322 exact values and a production Oxide
population of 1,600 files / 27,387 candidates; omitted-positive and bogus-registration controls both
failed in the intended direction. However, knip reports `OrbCssHandle` and `CssClassOccurrence` as unused
exports. Make them private (or establish a real public consumer) before moving #949 out of Review.

### P2 — #959 adds an unratified suppression

`tooling/src/verify/gates/playwright-css-topology.ts:88` adds a cognitive-complexity `biome-ignore` beyond
the committed suppression budget. Structure's suppressions gate rejects it. Refactor the decision into
cohesive helpers or perform the separately authorized ratchet workflow; do not silently widen the baseline.

## Verified clean

- Stable SHA and worktree: `git rev-parse HEAD` →
  `f83aa70717c5dc6b92eef95f6e8d671c1623773d`; worktree was clean before this report.
- `pnpm typecheck:tests-dom`: green. `pnpm test:types`: 27 files / 95 tests, green.
- Focused Vitest command over class merge/parity, appearance manifest/shim, selector/dark gates, static
  expression/collection/consumers, token contract, depcruise controls, and registry anti-drift: 10 files
  passed, one file failed only at #935 anti-drift; 129 passed / 1 failed; no Vitest type errors.
- `pnpm check:structure`: complete 241/241 active gates over 6,317 corpus files, 47 violations. Key
  populations: appearance 41/41; CSS family 960/960 declarations; selector hooks 183/183; variables
  1,590 sources / 231 definitions / 772 references / 2,335 class roots / vendor 49 docs, 43 props,
  13 live, 19 memberships; length 349/3,767; static class gates 1,585 files.
- `pnpm depcruise`: one reproduced edge, 4,103 modules / 23,217 dependencies.
- `pnpm exec knip --reporter compact`: six reproduced unused exports/types, all assigned above.
- `pnpm check:docs`: green; `pnpm check:doc-catalog`: one non-ancestor receipt failure.
- Focused #935 Playwright CT: two raw tests passed. The command still exited nonzero because the unfed-read
  reporter refused the message-row file's missing `routeTrpc` marker, so this is not represented as a full
  CT verdict.
- \#957 literal sweep: no live TS/TSX/CSS `ctx-tab-strip` spelling remains. Ast-grep scanned 4,970 TS and
  1,323 TSX files with zero string-literal hits; `rg` found only amended/historical docs, comments, and a
  negative CT count assertion.
- \#949 return contract: empty ordinary → `""`, empty slot → `""`, extension metadata/composition, one
  final Orb merge, cold/warm graph equality, 14 governed families, and two-direction parity controls all
  passed.
- \#950, #883, and #969 were excluded from judgment as instructed.

## Authority and coverage log

Read in full before judgment: `.claude/agent-doctrine.md`, the constitution
`docs/architecture/core/AGENTS.md`, all imported repo rule files, the 1,701-line current CSS census,
`token-contract-program.md`, the CSS token/toolchain research, client lockdown §4, the full current
D-ledger and its cited D54/D62/D66/D71/D140/D141/D144/D150 rows, and every body/comment for the twelve
issues. All twelve board rows were open in Review.

Implementation review used full-file reads for the gate descriptors, shared class-expression/CSS-family/
selector/variable/length/topology/pass modules, appearance manifest/shim, class merge/trace, the five
stylesheets, CSS front doors, and focused tests. For generated/very large touched files, the interaction
regions were read after inventory rather than pretending a line dump was useful: `pnpm-lock.yaml`,
`docs/catalog/catalog.json`, catalog receipts, the test-baseline manifest, and unrelated regions of the
5,000-line AppShell CT / 2,000-line message CT / preset CT. Those excluded regions were generated
dependency/catalog records or tests outside the listed issues; relevant changed records, imports, named
tests, and carrier/cascade regions were read. No product/tooling file was modified.

## Unconfirmed, low priority

None. The report does not treat the two Tailwind build warnings produced by planted dark-variant fixture
strings as product findings; they are fixture-generated pseudo-class warnings and the dark-variant
behavioral controls passed.

## Issue summary

Cold grouped verification at `f83aa7071` found 12 confirmed findings (severity ceiling P1): #957 is the only row ready to move Review → Verify; #935, #949, #951, #952, #954, #955, #956, #959, #961, #965, and #966 must remain Review for the exact repairs above. The `f83aa7071` Tailwind Variants return-contract repair is behaviorally confirmed, but #949 remains statically incomplete. Full report: `docs/reviews/stickler/2026-08-31-css-review-train-f83aa7071.md`.
