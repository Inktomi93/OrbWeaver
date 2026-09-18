---
kind: review
status: active
updated: 2026-09-13
---

# lane cb-x-vendor-hooks-pins — vendorCensus's four throws, pinned (#2310)

## Deviation from the brief, with receipt

The brief located "the three in-module throw sites" inside `tooling/src/verify/lib/css-vendor-hooks.ts`.
That file was read IN FULL (98 lines) and contains **zero `throw` statements** — it is a pure reader
(`readVendorHooks`, `vendorWritesHook`) with no error branches at all. The four throws named by the row
("the three in-module throws in `vendorCensus` and `selectorCoordinate`'s twin") are actually in
`tooling/src/verify/gates/css-selector-has-a-writer.ts`, whose `vendorCensus`/`hookCoordinate` functions
**call into** `css-vendor-hooks.ts`'s pure readers but hold their own throws locally:

- `css-selector-has-a-writer.ts:93` — `hookCoordinate` (the twin of `css-family-policy.ts:105`'s
  `selectorCoordinate`)
- `css-selector-has-a-writer.ts:109` — `vendorCensus`, manifest schema failure
- `css-selector-has-a-writer.ts:113` — `vendorCensus`, mode mismatch
- `css-selector-has-a-writer.ts:124` — `vendorCensus`, anchorless surface

Fixed per the row's own evidence (which throws actually exist and where) rather than the brief's premise
about the file. Fence respected: `css-vendor-hooks.ts` itself was read but not touched.

## Per-throw table

| Line | Function | Reaching input | Phase / status / owner | Refusal text | Pin |
| - | - | - | - | - | - |
| `css-selector-has-a-writer.ts:109` | `vendorCensus` | A committed `json:baseui-manifest` resource that is **valid JSON** (so the `json` door resolves READY) but fails `surfaceManifestFrom`'s schema (e.g. no string `version` field) | `evaluate` phase tool error; owner status `incomplete`; `result.authority.toolErrors` carries one `owner-incomplete` entry restating the same message; 0 effective findings | "the committed Base UI surface manifest is unreadable: the manifest has no string \`version\`" | New test: *"a committed Base UI manifest that is valid JSON but fails the surface schema REFUSES at evaluate…"* + healthy-twin test with `EMPTY_BASE_UI_MANIFEST` |
| `css-selector-has-a-writer.ts:113` | `vendorCensus` | **None constructible.** `loadInstalledPackage` (`ops/resource-installed.ts#astFacts`) always returns `mode: "ast"` for a `mode: "ast"` request, and `resource-declaration.ts#resourceRequestIdentity`/the resource-host cache key the acquisition by the WHOLE identity including mode, so two different modes of one package can never answer into each other's slot | n/a — type obligation | `the installed Base UI door answered a mode it was not asked for` | INVARIANT test against the real loader: asserts `loadInstalledPackage(ROOT, {id:"base-ui", mode:"ast"}).value.mode === "ast"` |
| `css-selector-has-a-writer.ts:124` | `vendorCensus` | **None constructible.** `base-ui`'s `INSTALLED_PACKAGE_DEFINITIONS` entry has no `via`/`directoryAnchor`, so `astFacts`' `collectDeclarations` walk starts at the resolved package directory itself (which IS the `@base-ui/react` segment by node's own resolution) and every returned path is `dir + "/" + child`, hence already contains `installedPackageRootOf`'s `/@base-ui/react/` anchor whenever the door answers `ready` | n/a — type obligation | `the installed Base UI declarations carry no package root, so the vendor acquittal could not be read` | INVARIANT test against the real loader: asserts every real-tree declaration path for base-ui yields a defined `installedPackageRootOf(...)` |
| `css-selector-has-a-writer.ts:93` (`hookCoordinate`, twin of `css-family-policy.ts:105`'s `selectorCoordinate`) | `hookCoordinate` | **None constructible.** Every `SelectorHookIdentity.authored` slice begins with `.` (class) or `[` (attribute) — neither excluded by the `@orb-waive` position grammar (`POSITION_EXCLUDED = ["(", ")", "\r", "\n"]`) — so `waivableCoordinate`'s leading paren-free run is never empty and never whitespace-only, the only two ways it returns `undefined`. This matches the gate's own header, which already states this MEASURED (a `[data-probe="a(b)"]` `mustRefuse` row did not refuse) | n/a — type obligation | `selector hook has no anchorable coordinate: ${hook.authored}` | INVARIANT test calling `waivableCoordinate` directly on parenthesis-carrying hook text (`[data-probe="a(b)"]`, `.a(b)`, `[data-mode="a()b"]`, etc.) — every case returns defined |

## Red-first + control-for-the-control receipts

- **Red-first (reachable pin):** on first write, the new refusal test's `expect(result.authority.toolErrors).toEqual([])` assertion failed against the **unmodified** `css-selector-has-a-writer.ts` — the run reported one `owner-incomplete` entry restating the evaluate-phase message. This proves nothing before this commit asserted this refusal's shape or text: the failure came from my own wrong expectation about an empty array, not from a gate change. Corrected to `toMatchObject([{ kind: "owner-incomplete", policyId: selectorWriter.id }])`. Full run: `tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` → 11 passed / 1 failed (first write), then 12/12 (corrected).
- **Control-for-the-control:** mutated the expected refusal text by one word (`version` → `versionX`) via `cp`/edit/`mv` probe-and-restore on the test file itself (one command per call, per lane-standing-facts). Re-run reds exactly that assertion:
  ```
  AssertionError: expected { ... messages: [ '...has no string `version`' ] ... }
    to match object { ... messages: [ '...has no string `versionX`' ] ... }
  ```
  Restored via `mv` from the pre-edit backup; `git status --short` confirmed only the legitimate committed diff remained; re-ran the floor green (12/12) after restore.

## Floor (all green, unchanged corpus)

- `pnpm test:scoped tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` → 12/12 pass, exit 0.
- `pnpm check:structure --check css-family-ownership --check css-family-ownership-health --check css-family-direct-client-mechanism --check css-selector-has-a-writer --check css-selector-has-a-writer-health` → `final policies: 5 ran · raw 3 = waived 0 + granted 3 + effective 0 (0 error, 0 warning) · 0 alarm(s) · 0 tool error(s) · 0 withheld` — a test-only change, corpus unchanged.
- `pnpm exec biome check tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts --diagnostic-level=error` → clean.
- `pnpm exec eslint tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` → clean (exit 0, no output).
- `pnpm typecheck --config tsconfig.json` → `PASS tsconfig.json` (plan verb confirmed this is the one program rooting the file).

## Deviations, with receipts

1. **File location** — see the deviation section above: the throws live in `css-selector-has-a-writer.ts`, not `css-vendor-hooks.ts`. `css-vendor-hooks.ts` was read in full and confirmed to hold zero throws.
2. **Row count read as 4, not 3** — the row text names "the three in-module throws in `vendorCensus`" (matches: lines 109/113/124) "and `selectorCoordinate`'s twin" (a fourth, `hookCoordinate` at line 93). All four are pinned; none were double-counted.
3. **Three of the four pinned as INVARIANT DECLARATIONS, not planted refusal rows** — per the brief's own allowance ("if a throw is provably unreachable from any input … say so with the receipt and pin it as an invariant declaration instead"). Each invariant is proven against the REAL loader/predicate on the real tree (not asserted in prose), so a future change to `INSTALLED_PACKAGE_DEFINITIONS["base-ui"]` (adding a `via`/`directoryAnchor`) or to `loadInstalledPackage`'s mode handling or to `waivableCoordinate`'s excluded-character set would immediately red the corresponding invariant test — which is the intended tripwire.

## LEDGER ROWS (0 rows)

No instrument defect was measured beyond the row this lane was dispatched for. `ledger rows OWED: 0`.

## Proposed lessons (text only — no memory write performed; orchestrator owns any write)

- **A board row's file-location claim is a hypothesis, not a fact** — even when the row and the brief agree
  on the same wrong path (`css-vendor-hooks.ts`), reading the named file in full (98 lines, zero throws)
  found the real location one hop away (`css-selector-has-a-writer.ts`, which imports the pure readers from
  the named file). Grepping the FUNCTION NAMES (`vendorCensus`, `selectorCoordinate`) across `lib/` +
  `gates/` found the real location in one call; a brief citing "the file with the throws" is worth a
  same-effort verification before editing starts.
- **"Type obligation with no constructible fixture" is provable, not just arguable** — for all three
  unreachable throws here, the unreachability could be pinned as a real assertion against the production
  loader/predicate (not a comment), which gives the invariant a tripwire if the underlying assumption ever
  changes (e.g. a future `via`/`directoryAnchor` added to `base-ui`'s installed-package definition). Worth
  preferring an executable invariant pin over a prose-only "this can't happen" note whenever the
  loader/predicate is cheap to call directly in a test.

## Git receipts

- `git show --stat HEAD` (`21bf17a9f`): `tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts | 114 ++++++++++++++++++++-` (1 file changed, 113 insertions(+), 1 deletion(-)).
- `git status --short`: empty (before this untracked report file).
- `git rev-list --left-right --count main...HEAD`: `3  1` (main is 3 ahead — pre-existing lane-base commits from `f56e83d52`; this lane's own commit is the `1` on the right).

## LEG 2 — cb-x-vendor-hooks-pins (warm leg, additive on top of 21bf17a9f)

Independent review of `21bf17a9f` **ACCEPTED** the reachable malformed-manifest refusal + healthy twin and
the two bounded installed-loader invariants, and **REFUTED** the `hookCoordinate` invariant pin: it called
`waivableCoordinate` on five hand-authored, known-valid strings and never exercised the PRODUCER
(`css-family-selector-provenance.ts:142-160`'s `selectorHookIdentities`, fed by `selectorClassHooks`/
`selectorDataAttributes` folded through `css-resource-facts.ts#hookFacts` into the `authored` field) — so a
regressed producer emitting an empty or paren-leading authored slice would reach the `hookCoordinate` throw
at `css-selector-has-a-writer.ts:93` while the prior test stayed green. Landed additively as `69fd0ec8f`, no
rewrite/amend of `21bf17a9f`, no rebase.

### The parenthesis-case table (fixture: `PAREN_CASES_CSS`, driven through `selectorWriter` via `passResource`)

| Selector as authored | Hook kind | `authored` slice `hookCoordinate` receives | Reported token (`waivableCoordinate` output) |
| - | - | - | - |
| `:is(.shell-wrapper, .other-wrapper) { ... }` | class | `.shell-wrapper` | `.shell-wrapper` (no paren in the class's OWN slice — the wrapper's parens surround the whole selector, not the dot-anchored token) |
| `:is(.shell-wrapper, .other-wrapper) { ... }` | class | `.other-wrapper` | `.other-wrapper` |
| `:where(.tier-wrapper) { ... }` | class | `.tier-wrapper` | `.tier-wrapper` |
| `:not(.excluded-wrapper) { ... }` | class | `.excluded-wrapper` | `.excluded-wrapper` |
| `[data-slot="dialog(popup)"] { ... }` | data (attribute VALUE carries a paren) | `[data-slot="dialog(popup)"]` | `[data-slot="dialog` (leading paren-free run; `waivableCoordinate` stops at the `(` inside the value) |
| `[data-mode="a(b)c"] { ... }` | data (attribute VALUE carries a paren) | `[data-mode="a(b)c"]` | `[data-mode="a` |
| `[data-x] { ... }` | data (bracket at column 0 of its own selector — the "empty-slice edge" the review named) | `[data-x]` | `[data-x]` (whole, no paren) |

All 7 rows (8 with `.shell-wrapper`/`.other-wrapper` counted separately) reached `hookCoordinate` with **zero
evaluate-phase tool errors** and their exact expected tokens, proving the real derivation chain
(`selectorClassHooks`/`selectorDataAttributes` → `hookFacts` → `selectorHookIdentities` → `hookCoordinate`)
never produces an unreachable-branch slice on this corpus shape — not merely that hand-picked literals don't.

### Producer-corruption receipt (temporary, restored — not part of the commit)

- **Backup:** `cp tooling/src/verify/lib/css-family-selector-provenance.ts /tmp/cbxvh-provenance.ts.bak`.
- **Corruption:** in `selectorClassHooks`, changed `hooks.push({ name, offset: index })` to
  `hooks.push({ name, offset: index > 0 ? index - 1 : index })` — every class hook's reported offset shifts
  one character EARLIER, so a parenthesis-wrapped class hook's `authored` slice now begins at the wrapper's
  own `(` instead of the dot.
- **Result — the new production-path test REDS immediately, before any restore:**
  ```
  AssertionError: expected [ { policyId: 'css-selector-has-a-writer', phase: 'evaluate',
    message: 'selector hook has no anchorable coordinate: (.shell-wrappe' } ] to deeply equal []
  ```
  This IS the `hookCoordinate` throw at line 93 firing for real: `waivableCoordinate("(.shell-wrappe")` sees
  its very first character (`(`) is in `POSITION_EXCLUDED`, so the leading-paren-free head is the EMPTY
  STRING, `isWaivablePosition("")` is false, and `waivableCoordinate` returns `undefined` — which
  `hookCoordinate` turns into the throw. **Shape:** an `evaluate`-phase `PolicyToolError`
  (`policyId: "css-selector-has-a-writer"`), which `runPolicyPass` turns into owner status `incomplete`
  (matching the shape already documented in the LEG-1 table above for the sibling `manifest.ok` throw) — never
  a silent finding, never a clean pass.
- **Exact restore:** `mv /tmp/cbxvh-provenance.ts.bak tooling/src/verify/lib/css-family-selector-provenance.ts`.
  `git status --short` after restore: only `M tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts`
  and this untracked report — `css-family-selector-provenance.ts` carries no diff.
- **Post-restore floor re-run:** `pnpm test:scoped tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts`
  → 13/13 pass.

### Floor (LEG 2, all green, unchanged corpus)

- `pnpm test:scoped tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` → 13/13 pass, exit 0.
- `pnpm check:structure --check css-selector-has-a-writer --check css-selector-has-a-writer-health` →
  `final policies: 2 ran · raw 0 = waived 0 + granted 0 + effective 0 (0 error, 0 warning) · 0 alarm(s) ·
  0 tool error(s) · 0 withheld` — a test-only change, real-tree verdict unchanged.
- `pnpm exec biome check tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts --diagnostic-level=error` → clean.
- `pnpm exec eslint tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` → clean (exit 0).
- `pnpm typecheck --config tsconfig.json` → `PASS tsconfig.json`.

### Git receipts (LEG 2)

- `git -C <wt> show --stat HEAD` (`69fd0ec8f`): `tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts | 33 +++++++++++++++++++++++++++++++` (1 file changed, 33 insertions(+)).
- `git -C <wt> status --short`: `?? docs/reviews/gate-runtime/x-vendor-hooks-pins-2026-09-13.md` only (the untracked report).
- `git -C <wt> rev-list --left-right --count main...HEAD`: `6  2` (main advanced independently since LEG 1's
  `3  1` reading; this lane's two commits — `21bf17a9f` then `69fd0ec8f` — are the `2` on the right).

### Notes

- The prior `waivableCoordinate`-on-literals INVARIANT test is left completely untouched, per the review's
  own instruction — it still documents the closed-form reasoning (every authored slice opens with `.`/`[`);
  this leg adds the production-path coverage additively rather than replacing it.
- No ledger rows owed from this leg either; the fix is scoped entirely to test coverage, no new instrument
  defect was measured.

---

## Integration appendix — current main and count correction (2026-09-13)

This appendix is additive. The complete builder report above preserves its historical body. Its frontmatter status was
normalized from the unsupported `final` to the catalog vocabulary `active` during integration; the
original bytes remain in commit `725fc340c`. Its original sentence at line 108, “All 7 rows (8 with `.shell-wrapper`/`.other-wrapper`
counted separately),” is not silently rewritten: the correct production fixture count is **7 hooks**.
The fixture yields four class hooks (`.shell-wrapper`, `.other-wrapper`, `.tier-wrapper`,
`.excluded-wrapper`) and three data hooks (`[data-slot=…]`, `[data-mode=…]`, `[data-x]`), matching the seven
expected tokens and seven rows in the parenthesis-case table. References to eight hooks are off by one and
do not weaken the production-path proof.

- Integrated current-main commits: `cd4712cbd` and `28c7cf77f` include the accepted #2310 repair chain.
- Current-main combined focused floor: **26/26 passed** across the three-file set. Artifact:
  `reports/runs/test/main-307437-2026-09-13T06-34-00-009Z/test-report.json`.
- Independent final review accepted the reachable refusal, installed-loader invariants, and the additive
  production-path coordinate proof. The latter runs `passResource` through `selectorWriter`; the temporary
  producer offset corruption reached the real `hookCoordinate` evaluate refusal and the restored suite passed
  13/13. These mutation and branch-suite statements remain attributed to the builder report.
- Lifecycle receipt: B978 reports terminal #2310 Done. This appendix records that supplied receipt; it does
  not infer closure from integration or test greenness alone.

### Ledger disposition

The source report declares `## LEDGER ROWS (0 rows)` and `ledger rows OWED: 0`. It measured no new defect
beyond board issue #2310, and the current refutation ledger contains no #2310 row to update. Therefore this
fold proposes **zero new ledger rows and zero existing-row edits**. The four throw sites and seven-hook proof
are evidence for the dispatched issue, not substitute defect rows or a proof-checklist ledger.

## LEG 3 (#2318) — cb-x-vendor-hooks-pins (warm leg)

Board row #2318: `css-selector-has-a-writer` is a SIXTH consumer of `json:baseui-manifest` with no §4.5
refusal pin — reachable, and outside #2297's fence (which pinned only the four-consumer derives loop plus
`baseui-state-data-attributes`). Measured by `cb-v-baseui-final`, ledger row LR-1 in
`docs/reviews/gate-runtime/v-baseui-final-2026-09-13.md` (read read-only, not modified by this lane):
`css-selector-has-a-writer.ts:157` declares the same resource and no test pins any of its three reachable
non-ready statuses.

### Tree mechanics receipt (pre-work)

- `git rev-list --left-right --count main...HEAD` before this leg: `25	2` — NOT `0` as the coordinator's
  instruction expected. STOPPED and SendMessaged per instruction rather than guessing.
- Coordinator confirmed via `git patch-id --stable`: `21bf17a9f` == `cd4712cbd` and `69fd0ec8f` == `28c7cf77f`,
  and `28c7cf77f` is an ancestor of main — my two LEG 1/2 commits were integrated onto main under rebased
  SHAs, making my originals duplicates.
- Reconciliation, one command per call: preserved this untracked report to scratchpad
  (`mv … x-vendor-hooks-pins.pre.md`), confirmed `git status --short` empty, `git reset --hard main`
  (sanctioned here as the "ff onto main tip for an already-integrated lane" — not a probe undo, since the
  branch's only commits were the proven duplicates), confirmed `git rev-list --left-right --count main...HEAD`
  → `0	0`. Diffed the preserved scratch copy against main's tracked/folded copy: main normalized the
  frontmatter `status` from the non-catalog `final` to `active`, and appended its own "Integration appendix"
  correcting a hook-count typo (7 hooks, not 8, in the LEG-2 production-path fixture) and recording the fold
  disposition. Not overwritten; this LEG 3 section is appended additively to the tracked copy per instruction.

### Status × pin table (json:baseui-manifest, `css-selector-has-a-writer`)

| Reachable status | How planted | Phase / owner status | Refusal message (`toolErrors[0].message`) | Findings | Withheld |
| - | - | - | - | - | - |
| `missing` | Fixture omits `BASE_UI_MANIFEST_PATH` entirely (file absent from both overlay and real disk) | `population` / `incomplete` | `resource declaration json:baseui-manifest is missing: resource is absent from the invocation inventory: tooling/src/verify/gates/baseui-surface.manifest.json` | 0 | `["css-selector-has-a-writer"]` |
| `empty` | `[BASE_UI_MANIFEST_PATH]: ""` (zero-length) | `population` / `incomplete` | `resource declaration json:baseui-manifest is empty: resource file is empty: tooling/src/verify/gates/baseui-surface.manifest.json` | 0 | `["css-selector-has-a-writer"]` |
| `unresolved` (unparseable) | `[BASE_UI_MANIFEST_PATH]: "{ not json\n"` (invalid JSON, non-empty) | `population` / `incomplete` | `resource declaration json:baseui-manifest is unresolved: json resource baseui-manifest did not parse as strict JSON: …` | 0 | `["css-selector-has-a-writer"]` |
| healthy twin — valid `EMPTY_BASE_UI_MANIFEST` present | `[BASE_UI_MANIFEST_PATH]: EMPTY_BASE_UI_MANIFEST` | owner `success`, `toolErrors: []` | n/a — no refusal | 0 (SELECTOR_FIXTURE's baseline sheets are inert) | `[]` |

All three statuses are `population`-phase withholds — `json` is a POPULATED resource kind
(`GATE_RESOURCE_UNPOPULATED_KINDS` in `contract/resource-declaration.ts` names only `installed-package` /
`authored-path` / `authored-text`), so `resolveResourceDeclarations` throws before `evaluate` ever runs,
exactly matching the shape `baseui-and-surface-family.suite.repo.int.test.ts` pins for the other five consumers of
this resource. No private loader and no duplicated policy logic were written: every test drives the real
`selectorWriter` policy declaration through `runPolicyPass` via the already-existing `passResource`/
`refusalShape` helpers from LEG 1/2, reusing the family's own fixture constants
(`CLEAN_PRODUCT_CSS`/`INERT_SOURCE`/`VENDOR_SURFACE_FIXTURE`/`BASE_UI_MANIFEST_PATH`/`EMPTY_BASE_UI_MANIFEST`).

### Red-first receipt

`grep 'baseui-manifest' tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` before this leg's
edit: exactly **one** hit — LEG 1's own comment about the schema-invalid-but-parseable-JSON case (a
different, already-pinned defect). Zero assertions existed for the missing/empty/unresolved statuses on
this consumer. Positive control (from LR-1's own method, re-verified): the same literal across the six
gate modules declaring `json:baseui-manifest` returns all six declarations, so the zero above is "not
covered", never "couldn't grep".

On first write, all 4 new tests (3 refusals + healthy twin) passed immediately (17/17 total) — the exact
message shapes matched prediction from reading `ops/resource-json.ts`, `lib/resource-declaration.ts:195-214`
and `contract/policy-pass.ts:85` (`POLICY_PASS_REFUSALS.resourceDeclaration = "resource declaration"`) before
running, so this is a genuine derivation match rather than a fixture that happened to pass by trial.

### Control-for-the-control

Mutated the EMPTY-status test's expected message by one word (`json:baseui-manifest` → `json:baseui-manifestX`)
via `cp`-backed edit (backup at `/tmp/cbxvh-leg3-family.test.ts.bak`). Re-run reds exactly that assertion:

```
AssertionError: expected 'resource declaration json:baseui-manifest is empty: resource file is empty:
tooling/src/verify/gates/baseui-surface.manifest.json' to contain 'resource declaration json:baseui-manifestX is empty'
```

Restored via `mv` from the backup; `git status --short` after restore showed only the legitimate diff
(`M tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts`); floor re-ran green (17/17).

### Floor (LEG 3, all green, unchanged corpus)

- `pnpm test:scoped tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` → 17/17 pass, exit 0.
- `pnpm check:structure --check css-selector-has-a-writer --check css-selector-has-a-writer-health` →
  `final policies: 2 ran · raw 0 = waived 0 + granted 0 + effective 0 (0 error, 0 warning) · 0 alarm(s) ·
  0 tool error(s) · 0 withheld` — a test-only change, real-tree verdict unchanged.
- `pnpm exec biome check tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts --diagnostic-level=error` → clean.
- `pnpm exec eslint tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` → clean (exit 0).
- `pnpm typecheck --config tsconfig.json` → `PASS tsconfig.json`.

### Notes / ledger

No new instrument defect measured beyond board row #2318 itself; `## LEDGER ROWS (0 rows)`,
`ledger rows OWED: 0` for this leg.
