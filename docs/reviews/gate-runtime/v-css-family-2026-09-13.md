---
kind: review
status: active
updated: 2026-09-13
---

# `cb-v-css-family` — adversarial verification of the `css-hook-provenance` conversion (#2181, #2182, #1584)

Fresh-context Opus verifier over `9104f718f` + `3c685ce6a`, integrated on main. **Verdict: PARTIAL.** The
conversion is real, live and green on the tree — every policy drives, the population port re-derives
byte-identical, the shared collector is a genuine `defineFact` provider, the grant migration's liveness and
finding halves both fire, and both ordinary doors discriminate a dead marker position. **Three claims do not
survive contact with the tree:** the §4.1 matrix's f28 cell is misclassified (a discriminating fixture exists;
I wrote and ran it), two of the three "surviving derived seams" are still bare population ratchets under a
"derived" label, and the "five consumers" sharing claim is three in four prose homes.

## 1. Base and root

| | |
| - | - |
| worktree | `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-aef10e464846fb27f` |
| `git rev-parse HEAD` | `3c685ce6a6ec03b8a8348362c1ab9a94487c642b` (= the named tip, not a descendant) |
| tree at start / at end | `git status --short` empty both times; `git diff --stat HEAD` empty at end |
| lane report verified | `…/agent-a279d0c53fc79640d/docs/reviews/gate-runtime/x-css-family-unit-2026-09-13.md` (read, never copied or edited) |
| legacy side read | `git show 9104f718f^:` for `gates/css-family-ownership.ts`, `gates/css-selector-has-a-writer.ts`, `lib/css-selector-writer-policy.ts`, `lib/css-selector-writers.ts`, `lib/css-family-census.ts` |
| probes | ALL cp-backed, one command per call, restored and md5/`git status`-verified; announced to the orchestrator before and after |

Probed real files (all in my own isolated worktree, never main): `lib/css-family-source-provenance.ts`,
`lib/css-family-policy.ts`, `lib/css-family-selector-provenance.ts`, `lib/css-vendor-hooks.ts`,
`lib/css-selector-writers.ts`, `lib/css-family-proof-fixtures.ts`, `lib/reviewed-grants.ts`,
`gates/css-selector-has-a-writer.ts`, `gates/css-family-ownership.ts`, `gates/baseui-surface-manifest.ts`,
`docs/architecture/core/Core-Enforcement-Active-Gates.md`.

## 2. Verdicts, one per claim

### Claim 1 — five policies with the stated authorities, each exit 0 on the real tree · **CONFIRMED**

Six sequential single-policy runs, each its own process, each reading its own printed slot:

| `pnpm check:structure --check <id>` | exit | line |
| - | -: | - |
| `css-family-ownership` | 0 | `final ordinary/error · population 1686 source · 5 resource` · `raw 0 = waived 0 + granted 0 + effective 0 · 0 alarm(s) · 0 tool error(s) · 0 withheld` |
| `css-family-ownership-health` | 0 | `final hard/error · population 0 source · 5 resource` · same zero line |
| `css-family-direct-client-mechanism` | 0 | `final reviewed-grant/error · population 1686 source` · **`raw 3 = waived 0 + granted 3 + effective 0 · 0 alarm(s)`** |
| `css-selector-has-a-writer` | 0 | `final ordinary/error · population 1686 source · 55 resource` · zero line |
| `css-selector-has-a-writer-health` | 0 | `final hard/error · population 0 source · 54 resource` · zero line |
| `enforcement-registry-parity` | 0 | `scanned 7570/7570 files`, clean, `of 308 corpus file(s)` |

Authorities match the claim exactly. The fact line prints once per run:
`fact css-hook-provenance: success · css-hook-provenance [hooks=1291; classes=551; data=141] 1686 member(s) · ~13.5s`.

### Claim 2 — ONE shared collector in a `defineFact` provider · **PARTIAL**

**Confirmed.** `cssHookProvenanceFact` is a real `defineFact` at
`tooling/src/verify/lib/css-family-source-provenance.ts:410-435`; the module carries no module-level mutable
state (`ast-grep --lang ts --pattern 'let $A = $B'` over the file: zero hits), and the retired lifecycle
symbols are gone from every live path — `beginHookOwnerCollection` / `passIdentity` / `hookOwnerWork` /
`beginSelectorWriterCollection` now appear only in prose and in the LEGACY engine (`lib/pass.ts`,
`contract/gate.ts`).

**The aliasing question is answered by construction, not by a key.** `lib/policy-pass.ts:425-438`
(`selectedFacts`) dedupes by fact **id** and *throws* if two different descriptor objects share one
(`selected policies import different fact descriptors with id …`); the whole registry is rebuilt per
`runPolicyPass` invocation over `input.project`. There is no module-level cache and no path-keyed `Project`
reuse, so the two hazards in `project-identity-is-not-a-cache-key.md` and
`ts-morph-reused-project-path-reuse-stale-snapshot.md` are structurally out of reach here — and the thing
those lessons warn about is exactly the `ctx.passIdentity`-keyed global this conversion deleted.

**The pin is live** (planted break, PROBE B): replacing `() => collector.work` with
`() => new ClassCollector(ctx.files).work` reds `static-class-collection.int.test.ts` for the right reason —
`expected { evaluators: 1, dispatchedNodes: +0, rootEvaluations: +0 } to deeply equal { evaluators: 1, dispatchedNodes: 37, rootEvaluations: 7 }`.
Restored; md5 back to `421100a72d9c55452c9c1b3f73d02257`.

**Why PARTIAL.** The one-collector claim the module header makes is stronger than the one the pin proves.
PROBE A gave the writer pass its OWN collector —
`createSelectorWriterPass(new ClassCollector(ctx.files))`, anchor asserted exactly once — and
**`static-class-collection.int.test.ts` stayed GREEN (1 passed)**, because `work` is read off the published
collector and `evaluators` counts only that collector's own evaluator mints. The real tree agreed: with the
probe in place `check:structure --check css-selector-has-a-writer` printed a byte-identical
`hooks=1291; classes=551; data=141`, `raw 0`, exit 0 — so the duplicated walk is **verdict-neutral and
purely a performance regression**, which is precisely the property the `create`-vs-`defineFact` deviation
was justified on (~14 s per collector). `seen[0] === seen[1]` proves the two CONSUMERS share; nothing proves
the provider builds one collector. Ledger row 1.

### Claim 3 — population port byte-identical two-way; 203 through the shared parser; constant untouched · **CONFIRMED**

Re-derived independently (`scratchpad/cbv/popdiff.ts`, run under `pnpm exec node` for the heap floor). Legacy
side driven from the pre-conversion predicate lifted verbatim from
`9104f718f^:tooling/src/verify/lib/css-selector-writers.ts:33-36`
(`path.includes("/packages/ui/src/") || path.includes("/packages/client/src/")`) over `harnessGlobs` with no
`scanRoot`; final side from `lib/population-resolver.ts#resolvePopulation({ in: ["@client","@ui"] })` over the
same candidate list:

```
harness corpus (legacy admitted set, no scanRoot): 7570
legacy, after the gate's own ui/client filter:     1686
declared population { in: ["@client","@ui"] }:     1686
legacy \ final: 0   final \ legacy: 0
CONTROL one extra on the legacy side  -> 1 (expect 1)
CONTROL one removed from the final side -> 1 (expect 1)
```

1686 = 1686, symmetric difference zero, both planted controls fire. (The corpus reads 7570 today against the
lane's 7568 — two files landed since; immaterial to the filtered set.)

**203 through the shared parser:** `css-family-ownership-health` reports 0 findings on the real tree while
`lib/css-family-policy.ts:448` compares `theme.directTheme.length !== EXPECTED_DIRECT_THEME_DECLARATIONS`, and
`mustFlag[2]` (`THEME_ONE_SHORT`) proves that arm bites. So the shared parser reads exactly 203 direct
`@theme` declarations — a run receipt, not a hand count.

**The constant is untouched (#2230):** `git diff 9104f718f^ 3c685ce6a -- lib/css-family-census.ts` shows
`export const EXPECTED_DIRECT_THEME_DECLARATIONS = 203;` as a CONTEXT line (unchanged), and the two fixture
spellings now derive from it (`css-family-proof-fixtures.ts:40-41`), closing audit row 13's three homes.

### Claim 4 — the §4.1 cut matrix · **REFUTED on the f28 cell; the rest of my sample CONFIRMED**

Method: one child process per cut, the REAL file patched with `cp`/`mv` and restored in a `finally`, the
anchor asserted to occur EXACTLY ONCE before every patch (the harness refuses otherwise), each cut driven
through `verifyPolicyProofs([gate])` per policy and the policy NAMED (§4.1's split-family rule).

**c00 identity control:** all five policies, `FAILED_ROWS=0`.

| cut | driven against | rows died | claim | verdict |
| - | - | -: | - | - |
| f01 `@layer` `AUTHORED_STYLESHEETS` fence | `css-family-ownership` | 1 — `mustPass[13]` | 1 | ✅ |
| f06 local fade-stop seam | `css-family-ownership` | 1 — `mustPass[14]` | 1 | ✅ |
| f25 directTheme at-rule `@theme` fence | `css-family-ownership-health` | 1 — `mustPass[3]` | 1 | ✅ (also kills `css-family-ownership:mustPass[1]` — the matrix under-reports, in the safe direction) |
| f26 directTheme custom-property fence | `css-family-ownership-health` | 1 — `mustPass[4]` | 1 | ✅ |
| f30 Base UI intersection (wrong-direction) | `css-selector-has-a-writer` | 1 — `mustFlag[8]` | 1 | ✅ |
| f37 hook identity dedupe, key widened (wrong-direction) | `css-selector-has-a-writer` | 1 — `mustFlag[7]` | 1 | ✅ |
| f29 JSX `data-` prefix filter | all three fact consumers | 0 | 0, non-verdict-bearing | ✅ classification sound: `hasAuthoredWriter` only ever looks up `writers.data.get(hook.name)` and a data hook's name always begins `data-`, so a wider census is unreachable |
| **f28 HAST `type === "element"` test** | `css-selector-has-a-writer` | 0 alone; joint = **TOOL ERROR**, not a finding | "MUTUALLY REDUNDANT, kept, classification recorded rather than a row invented" | ❌ **REFUTED** |

**So the dedup commit's headline arithmetic is CONFIRMED:** f01/f06/f25/f26 each kill exactly one row, at
exactly the indices `3c685ce6a` names, and no duplicate survives.

**f28, in full.** Cut alone: `FAILED_ROWS=0`. Cut jointly with both `isPropertyAssignment` guards (§4.1's
MUTUALLY-REDUNDANT procedure): **`mustFlag[4] :: FACT TOOL ERROR [css-hook-provenance:visit] Cannot read
properties of undefined (reading 'getInitializer')`** — a crash, not an accusation, which is §4.1's
*"joint cut tool-errors ⇒ the surviving clause is a TYPE OBLIGATION"* shape and not evidence of redundancy at
all. §4.1 then binds: *"before recording UNFALSIFIABLE, write the row that would discriminate and RUN it."* I
did. Added to `css-selector-has-a-writer` as a `mustFlag`:

```ts
{
  mode: "resource",
  files: {
    ...SELECTOR_FIXTURE,
    "packages/client/src/styles/globals.css": '[data-hast-probe="on"] { color: red; }\n',
    [SOURCE_ANCHOR]: 'const node = { type: "text", tagName: "div", properties: { "data-hast-probe": "on" } };\nexport const probe = node;\n',
  },
  expect: { count: 1, token: '[data-hast-probe="on"]' },
  why: "a HAST-shaped object whose type is NOT element is not a rendered element writer",
}
```

- ARM 1, fence intact: `FAILED_ROWS=0` (the row PASSES at tip).
- ARM 2, fence cut to `if (false as boolean) {`: `FAILED_ROWS=1 — mustFlag[0] :: expected at least one effective finding but got 0`.

The row discriminates. The fence is **UNENFORCED**, not mutually redundant, and it owes exactly that one row.
The matrix summary therefore reads **34 enforced · 1 UNENFORCED (owed a row) · 1 non-verdict prefilter · 2
deleted**, not 35/1. This is the guide's own named trap — *"a clean cut is more often an unenforced FIXTURE
than an unenforced fence"* — and the existing fixtures could not reach the branch because none of them
supplies a `type`/`tagName` pair with a non-`"element"` type. Ledger row 2.

### Claim 5 — the Base UI manifest↔installed arms retired into `baseui-surface-manifest#identity()` · **PARTIAL**

**(a) The legacy arms compared an AGGREGATE name set — CONFIRMED.** `9104f718f^:lib/css-selector-writer-policy.ts:158-177`
iterates `writers.baseUiManifestOnly` / `baseUiInstalledOnly`, and those come from
`lib/css-vendor-hooks.ts#stateAttributes`, which folds `data-${state.toLowerCase()}` across **every component
and every part** into one flat `Set` before differencing. A state moving between parts is invisible to it.

**(b) The successor is strictly stronger and it is LIVE — CONFIRMED with a planted control.**
`gates/baseui-surface-manifest.ts:143-145` — `identity()` is
`kind|symbol|from|props|state|inherits`, compared **per part** by `diffParts` in both directions
(appeared / changed shape / vanished) and per component by `diffSurface` in both directions (`:176-188`).
Planted control: cutting `|${part.state.join(",")}` out of `identity()` reds
`baseui-surface-manifest:mustFlag[2]` and nothing else (`expected at least one effective finding but got 0`).
Restored. `pnpm check:structure --check baseui-surface-manifest` on the real tree: exit 0, `raw 0 · 0 alarms ·
0 tool errors · 0 withheld` — so the two sides agree per part today, which subsumes the report's
"manifest 75 = installed 75, symmetric difference zero".

**(c) Nothing is caught by nobody — CONFIRMED for the state axis.** A manifest state absent from the installed
surface (the exact `baseUiManifestOnly` shape) is an `identity()` string mismatch and is reported by
`baseui-surface-manifest` naming the part; the comparison is a plain string equality, so it is symmetric by
construction and the control above proves the `state` term is load-bearing.

**Why PARTIAL — the collision with #2297 is real and the report does not know about it.** #2297 is **OPEN**
(*"Base UI family conversion REFUTED (baseui-surface-manifest, baseui-anatomy-completeness) …"*). It names no
CSS item — `gh issue view 2297 -q '.body + comments'` grepped for `css-selector`, `css-family`, `w04`, `w05`,
`aggregate`, `stateAttributes`, `identity()` returns nothing — so the retirement does not COLLIDE with a
\#2297 item and is not pre-empted by one. **But one of #2297's own open rows lands on the successor this
retirement leans on:** it measures `diffParts`'s vanished-PART direction and `diffSurface`'s vanished-COMPONENT
and VERSION arms as UNENFORCED by any proof row, and the vanished directions are the direct analogue of the
retired `baseUiManifestOnly` arm. So the successor's CODE is stronger (per-part, state-carrying, two-sided,
driven green on the real tree) and its PROOF for that direction is, today, no stronger than the arm it
replaced — both measured unenforced. The report's "strictly stronger" is true of the mechanism and not yet of
the evidence. Nothing is lost; the retirement should cite #2297 rather than claim closure. Ledger row 3.

### Claim 6 — four count ratchets retired into 1:1 grants with central liveness · **PARTIAL**

**Both grant halves CONFIRMED in one probe.** Renaming one live grant's operation
(`direct-client-mechanism:slot:message-list-scroll` → `…:slot:cbv-vanished-subject`) in `lib/reviewed-grants.ts`
and driving `check:structure --check css-family-direct-client-mechanism`:

```
exit 1
✗ css-family-direct-client-mechanism (1) … granted 2
    packages/client/src/styles/globals.css:854:1  [data-slot="message-list-scroll"]  — … This one is a REVIEWED recipe …
  ⚠ authority alarm [stale-reviewed-grant] css-family-direct-client-mechanism:
      reviewed grant was unused after a complete owner run: css-family-direct-client-mechanism:message-list-scroll
raw 3 = waived 0 + granted 2 + effective 1 (1 error, 0 warning) · 1 alarm(s)
```

A grant whose subject/operation vanishes ALARMS (liveness), and the now-ungranted mechanism becomes an
EFFECTIVE error at a real coordinate. That also proves the baseline `raw 3 = granted 3` is not a vacuous zero:
three live findings are really consumed. Restored. The family test additionally pins the identity three ways
(`css-hook-provenance-family.suite.test.ts` — exact consumption, wrong-hook stales, stopped-being-painted stales)
and holds the three rows two-sided against the policy.

**REFUTED: two of the three surviving seams are NOT "derived from declared vocabularies".**
`lib/css-family-census.ts:56-60`:

```ts
export const EXPECTED_RUNTIME_WRITERS = {
  density: DENSITY_SPACING.size * DENSITY_SELECTORS.size,   // 4 × 2 — two DECLARED sets
  blur: CLIENT_BLUR_FILL.size * 2,                          // 2 × a BARE LITERAL
  colorization: CLIENT_COLORIZATION.size * 2,               // 2 × a BARE LITERAL
} as const;
```

Only `density` is `DECLARED_SET.size * DECLARED_SET.size`. The `2` in the other two names no vocabulary — the
blur predicate admits exactly ONE selector (`:root`) and the colorization predicate declares no selector set
at all — so it encodes how many carriers happen to write those properties **today**. The tree confirms it:
`packages/client/src/styles/globals.css:460-461` and `:605-606` are the two current arms that write
`--blur-fill-chrome`/`--blur-fill-dense`. And the fixtures had to invent a second arbitrary carrier to reach
the factor: `BLUR_SEAM_COMPLETE` is two duplicate `:root` blocks, `COLORIZATION_SEAM_COMPLETE` a
`[data-theme-colorization]` plus a made-up `[data-theme-colorization][data-x]`.

**Planted control.** Adding a THIRD legitimate `:root` blur carrier to `BLUR_SEAM_COMPLETE` — changing **no
vocabulary anywhere** — reds five rows:

```
mustPass[0..4] :: runtime writer seam blur matched 6 declarations,
                  and its declared vocabulary requires exactly 4
mustFlag[0], mustFlag[2], mustFlag[3] :: expected effective finding count=1 but got 2
```

A legitimate new sanctioned writer reds the gate with no vocabulary edit — the definition of the current-
population ratchet §12.5 bans. The claim "a legitimate vocabulary change updates on both sides at once" holds
for `density` and is false for `blur` and `colorization`. Ledger row 4. Restored.

### Claim 7 — `CssSelectorHookFact.authored`, and the other consumers · **CONFIRMED**

`contract/resource-css.ts` adds `readonly authored: string` to BOTH arms of the union with a header stating it
is the waiver position. The chain is closed end to end: the producer publishes the exact slice
(`lib/css-resource-facts.ts#hookFacts`), `selectorHookIdentities` carries it into `SelectorHookIdentity.authored`
(`lib/css-family-selector-provenance.ts:157`), `hookCoordinate` derives the reported token from it alone
(`gates/css-selector-has-a-writer.ts:89-95`), and the §4.2 arm binds a marker at that text.

**Both ordinary doors DISCRIMINATE** (the two-command control §4.2 prescribes, once per policy):

- `css-selector-has-a-writer`: flipping `(.shell-wrapper)` → `(.shell-WRONG)` reds `mustPass[6]` with
  `AUTHORITY ALARM [ordinary-waiver] … names a dead position for css-selector-has-a-writer`.
- `css-family-ownership`: flipping `([data-density="compact"])` → `([data-density="WRONG"])` reds
  `mustPass[15]` with the same alarm.

Both restored. **Other consumers typecheck:** `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json`
→ `11 discovered, 2 runnable`, **PASS/PASS, exit 0**. The one minimal-fixture risk (a `toEqual` over produced
hook facts that omits the now-required field) does not bite: `tests/tooling/verify/ops/resource-css.test.ts:27`
uses `expect.arrayContaining` + `expect.objectContaining`, and that suite passes — which also means `authored`
is not pinned there, only in the gates' own rows.

### Claim 8 — whole-tree conformance, `gate:contract`, registry parity · **PARTIAL (one stale number)**

`pnpm check:policy-conformance`, one run, started 04:39:42Z after the orchestrator's GO (an earlier launch at
04:37Z collided with root's native typecheck; I killed my own three pids by number and discarded it as
exit-2 class — it produced no verdict):

```
policy-conformance: 266 final policies · 3187 proof rows · 22 refusal rows · 0 failure(s)
                    · 219 grant rows (whole table) · 0 invalid · 49462ms
                    (corpus: 308 module(s), 42 legacy proven by gate-conformance)
EXIT=0
```

Policies 266 ✅, failures 0 ✅, grants 219 ✅, refusal rows 22 ✅. **Proof rows measure 3187, the report claims
3191** — a gap of exactly FOUR, the four duplicated `mustPass` rows `3c685ce6a` deleted. The report's Floor
table still carries the leg-1 pre-dedup figure and its own LEG 2 section never corrects it. Report-hygiene, not
a code defect.

`pnpm gate:contract`: **331 finding(s) across 308 gate module(s)**, exit 1 (the corpus-wide legacy-descriptor
baseline). A grep of the output for any of the five converted module names returns **0** — zero findings for
each converted module, as claimed. `check:structure --check enforcement-registry-parity`: exit 0, clean,
`scanned 7570/7570 files` — so the roster's edited `(308 registered gates)` line is TRUE against discovery.

### Claim 9 — prose · **CONFIRMED with one exception (carried in rows 4 and 5)**

- **`check-gates.repo.int.test.ts`:** the diff both rewrites the comment block AND deletes the two
  `UNFIXTURABLE_GATES` entries — the entry is the half the arm checks, and it is gone. The "GONE from the set
  below" claim is true of the file. The suite itself is orchestrator-only and red-by-construction; not run.
- **`static-class-consumers.int.test.ts`:** both imports and both array members removed; the surviving call is
  `verifyGateProofs([variableResolution, lengthTokens])`. Suite green (below).
- **`Core-Enforcement-Active-Gates.md`:** two rows replaced by five; net +3 modules, and the roster count line
  edited `305 → 308`, which `enforcement-registry-parity` confirms. **Two sentences in the new rows are false
  on the tree** — the `css-family-ownership-health` row's *"expectations are DERIVED from the declared
  density/blur/colorization vocabularies rather than counted"* (ledger row 4) and the `css-family-ownership`
  row's *"one collector serves all five family members"* (ledger row 5). The
  `css-selector-has-a-writer-health` row's Base-UI merge sentence is TRUE.
- **The CEAG format red is INHERITED — CONFIRMED by a cp-backed probe.** `pnpm exec node
  tooling/src/doc-catalog/cli.ts format --check <it>` exits 1 at HEAD's bytes (md5 `a2a1d9a7…`) **and exits 1
  at `9104f718f^`'s bytes installed at the same path** (md5 `3383bbc5…`). Restored to `a2a1d9a7…`. Classified
  INHERITED, not a lane defect.

### Claim 10 — the `mirror-index-family.suite.test.ts` `+1` line · **CONFIRMED**

`git diff 9104f718f^ 3c685ce6a -- tests/tooling/verify/gates/mirror-index-family.suite.test.ts` is exactly one added
line, `"tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts",`, in `PARKED_TEST_LAYOUT_MISSES`, in
sorted position. Nothing else in the file changed.

**Suites run (`pnpm test:scoped`, the niced door):**

| suites | result |
| - | - |
| `css-hook-provenance-family` + `static-class-collection.int` + `static-class-consumers.int` + `mirror-index-family` | **4 files / 25 tests passed**, exit 0 |
| `verify/ops/resource-css.test.ts` + `verify/gates/baseui-and-surface-family.suite.repo.int.test.ts` | passed |
| `verify/lib/reviewed-grants.test.ts` | **FAILED — and it is INHERITED, see row 6** |

The literal grep the accreted lesson demands: each of the five ids plus `css-hook-provenance` grepped as a
string across the WHOLE `tests/` tree returns only the four suites above plus the orchestrator-only
`check-gates.repo.int.test.ts`. No unrelated suite names them.

## LEDGER ROWS (6 rows)

| module \| wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - |
| `css-hook-provenance` \| cb-v-css-family · `tooling/src/verify/lib/css-family-source-provenance.ts:64-67`, `tests/tooling/static-class-collection.int.test.ts:152` | The "ONE collector" claim is unpinned in the direction that matters. `evaluators: 1` is read off the PUBLISHED collector, so a second collector built inside the provider is invisible; the whole `defineFact`-over-`create` deviation was priced on not duplicating a ~14 s walk, and that property has no pin | §4.1 unenforced property / false-strength pin | **OPEN — none** | PROBE A: `createSelectorWriterPass(new ClassCollector(ctx.files))`, anchor asserted once → `static-class-collection.int.test.ts` **1 passed**, and `check:structure --check css-selector-has-a-writer` byte-identical (`hooks=1291; classes=551; data=141`, raw 0, exit 0). Control that the pin is otherwise live: publishing a fresh collector's `work` reds it (`dispatchedNodes 37 → 0`). Both restored |
| `css-selector-has-a-writer` \| cb-v-css-family · `tooling/src/verify/lib/css-selector-writers.ts:230` (matrix cell f28) | The HAST `type === "element"` test is classified MUTUALLY REDUNDANT and kept without a row; it is **UNENFORCED** and a discriminating fixture exists. The joint cut TOOL-ERRORS rather than flagging, which is §4.1's TYPE-OBLIGATION shape, not evidence of redundancy | §4.1 unenforced narrowing + wrong classification | **OPEN — none** | cut alone `FAILED_ROWS=0`; joint with both `isPropertyAssignment` guards → `mustFlag[4] :: FACT TOOL ERROR … Cannot read properties of undefined (reading 'getInitializer')`. Constructed `mustFlag` (`{ type: "text", tagName: "div", properties: { "data-hast-probe": "on" } }` + `[data-hast-probe="on"]` in client globals) PASSES at tip (`FAILED_ROWS=0`) and REDS under the cut (`expected at least one effective finding but got 0`). Fix: land that row; matrix becomes 34 enforced / 1 unenforced / 1 non-verdict |
| `css-selector-has-a-writer-health` \| cb-v-css-family · `tooling/src/verify/gates/css-selector-has-a-writer-health.ts:19-27` | The retirement's "THE SUCCESSOR IS STRICTLY STRONGER" rests on `baseui-surface-manifest`'s per-part diff, whose vanished-PART / vanished-COMPONENT directions — the direct analogue of the retired `baseUiManifestOnly` arm — are themselves measured UNENFORCED by open #2297. Code is stronger; proof for that direction is not | retirement citing an unproven successor | **OPEN — #2297** | `gh issue view 2297` OPEN, names three unenforced `baseui-surface-manifest` arms incl. both vanished directions; grep of its body+comments for `css-family`/`w04`/`w05`/`aggregate`/`identity()` → 0, so no direct collision. The `state` term IS proven: cutting `\|${part.state.join(",")}` reds `baseui-surface-manifest:mustFlag[2]` alone. Fix: cite #2297 beside the retirement |
| `css-family-ownership-health` \| cb-v-css-family · `tooling/src/verify/lib/css-family-census.ts:58,59` · `gates/css-family-ownership-health.ts:20-23` · `docs/architecture/core/Core-Enforcement-Active-Gates.md` (its row) | Two of the three "surviving DERIVED seams" are still bare current-population ratchets. `blur: CLIENT_BLUR_FILL.size * 2` and `colorization: CLIENT_COLORIZATION.size * 2` multiply a declared set by a LITERAL that names no vocabulary — it encodes how many carriers write those properties today. Only `density` is `SET.size * SET.size`. The §12.5 retirement is half done and three prose homes call it complete | §12.5 count ratchet surviving under a "derived" label + header/roster untruth | **OPEN — none** | Tree: only two blur carriers exist (`packages/client/src/styles/globals.css:460-461`, `:605-606`); the fixtures invent a second arbitrary carrier to reach the factor (`BLUR_SEAM_COMPLETE` = two duplicate `:root`; `COLORIZATION_SEAM_COMPLETE` = a made-up `[data-theme-colorization][data-x]`). PLANTED CONTROL: adding a third legitimate `:root` blur carrier, changing NO vocabulary, reds `mustPass[0..4]` with `runtime writer seam blur matched 6 … requires exactly 4` plus three `mustFlag` count breaks. Restored |
| `css-hook-provenance` \| cb-v-css-family · `lib/css-family-source-provenance.ts:14-16` · `gates/css-family-ownership.ts:5-6` · `gates/css-selector-has-a-writer.ts:6-7` · CEAG's `css-family-ownership` row | "FIVE consumers" / "four sibling policies" / "four other policies" / "one collector serves all five family members" — the fact has **THREE** consumers. Both `-health` modules declare `facts: []` and never call `ctx.fact`. §5b item 5: the header's decision record is not true of the code, in four homes | header / roster untruth | **OPEN — none** | `ast-grep --lang ts --pattern 'ctx.fact(cssHookProvenanceFact)' tooling/src` → 3 sites (`css-selector-has-a-writer.ts:170`, `css-family-direct-client-mechanism.ts:59`, `css-family-ownership.ts:67`); `grep -n "facts:"` on both `-health` gates → `facts: []` at `:52` and `:70`. The lane's own report says "three of the five" and is right; the code prose is not |
| `reviewed-grants` \| cb-v-css-family · `tooling/src/verify/lib/reviewed-grants.ts` · `tests/tooling/verify/lib/reviewed-grants.test.ts:47` | **INHERITED, not this conversion.** The central grant table's determinism assertion (`expect(keys).toEqual([...keys].toSorted())`) is RED on main: `bus-payload-allowlist` sits at index 2 where `bus-channel-primitive` belongs, and `seed-theme-ink-contrast` / `selection-store-via-factory` are transposed. A scoped `tests/tooling/**` red is never baseline (`gates-and-tooling.md`) and this one is unobserved because that tree is `--full`-only | inherited scoped red / grant-table order | **OPEN — none** | Key order extracted from four revs: `9104f718f^` **216 rows, sorted=False, first divergence idx=2**; `9104f718f`, `3c685ce6a`, `HEAD` all 219 rows, same divergence at the same index. **The three css rows sit at actual idx 26..28 = sorted idx 26..28**, so this conversion placed its rows correctly and did not cause it. `pnpm test:scoped tests/tooling/verify/lib/reviewed-grants.test.ts` → 1 failed / 34 passed |

ledger rows OWED: 6

## WHAT I DID NOT COVER

- **I ran no `pnpm check`, no whole-tree lint/biome/eslint, and no CT** (brief-fenced). Biome/ESLint over the
  19 touched files is UNVERIFIED by me; I re-ran only the type floor.
- **I did not re-cut 28 of the 36 matrix cells.** My sample is 8 (c00, f01, f06, f25, f26, f28 ×3, f29, f30,
  f37). f02–f05, f07–f19, f21–f23, f27, f31–f36, f38 are taken on the lane's word. Given that ONE of the two
  classification cells I checked was wrong, **treat the remaining 28 as an upper bound on enforcement, not a
  measurement** — in particular the other cells the lane re-did after a wrong-direction cut.
- **I did not drive a fixture-level §4.6 replay** through the frozen legacy `runPass`. My differential is the
  population half (independently re-derived, byte-identical) plus the real-tree outcome half. Per §4.6's
  vacuity rules, the both-sides-zero cells remain outcome receipts and say nothing about catch parity, exactly
  as the lane labelled them.
- **The three in-module throws in `css-selector-has-a-writer#vendorCensus` are pinned by nothing.** `grep -rlF`
  across `tests/` and `tooling/src` for `"the committed Base UI surface manifest is unreadable"`,
  `"answered a mode it was not asked for"` and `"carry no package root"` returns only the gate module itself.
  The policy declares FOUR resources and pins the refusal of ONE (`vendor-css-surface`, `mustRefuse[0]`), so it
  clears `policy-refusal-coverage`'s "one or the other, never neither" bar — but the anchorless-surface throw
  is the fail-closed guard protecting an ACQUITTAL, and nothing proves it fires. Same class as #2297's §4.5
  row; I did not construct the fixtures, so I filed no ledger row for it.
- `css-family-policy.ts:109`'s `selectorCoordinate` throw is undocumented — the header's unfalsifiability
  paragraph names only `hookCoordinate`'s twin. Not measured.
- The marker census (0 = 0 = 0, N=7753) is taken on the lane's word; I did not re-run it. The five gate ids
  carry no `@orb-gate-ignore` sites I found by literal grep, but I ran no anchored marker-form predicate with
  its own positive control.
- **The `x-css-family-unit` report itself is untracked in a lane worktree.** If that worktree is torn down, the
  document my verdicts cite disappears.

## PROPOSED LESSONS

**1.** `a work-counter published by the shared object cannot see a second one` —
`shared-collector-pin-cannot-see-a-second-collector.md`

> A `defineFact` provider that publishes its collector's own `work` counters proves the CONSUMERS share a
> value object (`seen[0] === seen[1]`), and proves nothing about how many collectors the PROVIDER built:
> `evaluators` increments on the published instance only, so a sibling pass handed its own collector is
> invisible and the run is byte-identical — the duplicated walk is verdict-neutral and purely a cost
> regression. That matters when the whole justification for `defineFact` over `create` was the cost of the
> walk. **Why:** measured 2026-09-13 on `css-hook-provenance` — giving `createSelectorWriterPass` its own
> `ClassCollector` left `static-class-collection.int.test.ts` green and `check:structure` byte-identical.
> **How to apply:** when a conversion's stated reason is "one collector, N consumers", pin the COLLECTOR
> COUNT (a construction counter on the class, or the fact's own `sources`/timing), not just value identity.

**2.** `a joint cut that TOOL-ERRORS is not evidence of redundancy` —
`joint-cut-tool-error-is-not-mutual-redundancy.md`

> §4.1's MUTUALLY-REDUNDANT classification asks for two fences guarding one subject where the joint cut
> FLAGS. When the joint cut instead throws (`Cannot read properties of undefined`), you deleted a TYPE
> narrowing, not a second fence — the guide already rules that shape a type obligation — and the clean single
> cut is still unclassified. **Why:** paid 2026-09-13 on `css-selector-has-a-writer`'s HAST `type === "element"`
> test, recorded MUTUALLY REDUNDANT and kept without a row; a fixture built in three minutes
> (`{ type: "text", tagName: "div", properties: { … } }`) passes at tip and reds under the cut, so the fence
> was UNENFORCED all along. **How to apply:** before recording anything other than UNENFORCED for a clean cut,
> read the joint cut's FAILURE MODE, and write the discriminating row anyway — a classification is only
> cheaper than a row when the row cannot exist.

**3.** `SET.size * <literal> is still a population ratchet` — `derived-cardinality-needs-two-declared-sets.md`

> `EXPECTED = DECLARED_SET.size * DECLARED_SET.size` is a completeness claim a vocabulary change updates on
> both sides. `EXPECTED = DECLARED_SET.size * 2` is a population count wearing a derivation: the literal names
> no vocabulary, so a legitimate new carrier reds the gate with no vocabulary edit anywhere. **Why:** measured
> 2026-09-13 — `EXPECTED_RUNTIME_WRITERS.blur`/`.colorization` survived a §12.5 count-ratchet retirement under
> a "derived from declared vocabularies" label in three prose homes; adding a third legitimate `:root` blur
> carrier reds five proof rows. **How to apply:** when a conversion claims a count is derived, read EVERY
> factor and ask which declared set each names. The tell is a fixture that has to invent an arbitrary second
> carrier (a duplicate `:root`, a `[data-x]` suffix) to reach the number.

**4.** `count the fact's ctx.fact() call sites, never its family` —
`fact-consumer-count-is-call-sites-not-family-size.md`

> A split family's `-health` siblings routinely declare `facts: []` — they judge the resource, not the walk —
> so "the family has five members" and "the fact has five consumers" are different numbers, and the second is
> the one a sharing argument is priced on. **Why:** 2026-09-13, `css-hook-provenance` says FIVE consumers in
> four prose homes (the provider header, both ordinary gate headers, the enforcement roster row) and has
> THREE. **How to apply:** `ast-grep --lang ts --pattern 'ctx.fact($F)'` is the census; `facts: [` in the
> descriptor is the declaration; the family string is neither.

## Issue summaries

**f28 — `css-selector-has-a-writer`'s HAST `type === "element"` fence is UNENFORCED, not mutually redundant
(#2181, #1584).** The `css-hook-provenance` §4.1 matrix records cell f28 as MUTUALLY REDUNDANT ("cut alone: 0;
cut jointly with both `isPropertyAssignment` guards: 1") and keeps the fence without a proof row. Re-cut by
`cb-v-css-family` at `3c685ce6a`: the single cut is clean, and the JOINT cut does not flag — it produces
`mustFlag[4] :: FACT TOOL ERROR [css-hook-provenance:visit] Cannot read properties of undefined (reading
'getInitializer')`, which is guide §4.1's TYPE-OBLIGATION shape and not evidence of a second fence. A
discriminating fixture does exist and was written and run: a `mustFlag` whose source anchor is
`const node = { type: "text", tagName: "div", properties: { "data-hast-probe": "on" } };` against
`[data-hast-probe="on"] { color: red; }` in client globals PASSES at tip (`FAILED_ROWS=0`) and REDS with the
fence cut to `if (false as boolean) {` (`expected at least one effective finding but got 0`). Fix: land that
row in `tooling/src/verify/gates/css-selector-has-a-writer.ts` and correct the matrix summary to 34 enforced ·
1 UNENFORCED · 1 non-verdict prefilter · 2 deleted.

**`EXPECTED_RUNTIME_WRITERS.blur` and `.colorization` are still bare count ratchets (#2181, §12.5).** The
conversion retired four count ratchets and kept three seams as "DERIVED from declared vocabularies" — stated
in `lib/css-family-census.ts:52-60`, `gates/css-family-ownership-health.ts:20-23` and the
`Core-Enforcement-Active-Gates.md` roster row. Only `density` is `DECLARED_SET.size * DECLARED_SET.size`;
`blur` and `colorization` are `DECLARED_SET.size * 2`, and the `2` names no vocabulary — the blur predicate
admits exactly one selector (`:root`) and the colorization predicate declares no selector set at all, so the
literal encodes how many carriers happen to write those properties today (`packages/client/src/styles/globals.css:460-461`
and `:605-606`). The proof fixtures had to invent a second arbitrary carrier to reach it
(`BLUR_SEAM_COMPLETE` = two duplicate `:root` blocks; `COLORIZATION_SEAM_COMPLETE` = a fabricated
`[data-theme-colorization][data-x]`). Planted control: adding a third legitimate `:root` blur carrier, with no
vocabulary edit anywhere, reds `css-family-ownership-health:mustPass[0..4]` with `runtime writer seam blur
matched 6 declarations, and its declared vocabulary requires exactly 4` plus three `mustFlag` count breaks.
Fix: derive the second factor from a declared carrier vocabulary for each seam, or retire the two
cardinalities as `fade: 12` was retired — and correct all three prose homes.

**The `css-hook-provenance` fact has three consumers, not five, in four prose homes (#2181).**
`lib/css-family-source-provenance.ts:14-16` ("this module now has FIVE consumers"),
`gates/css-family-ownership.ts:5-6` ("four sibling policies also consume"),
`gates/css-selector-has-a-writer.ts:6-7` ("four other policies in this family also consume") and the
`Core-Enforcement-Active-Gates.md` `css-family-ownership` row ("one collector serves all five family members")
all overstate the sharing. `ast-grep --lang ts --pattern 'ctx.fact(cssHookProvenanceFact)'` finds three call
sites; both `-health` modules declare `facts: []` (`css-family-ownership-health.ts:52`,
`css-selector-has-a-writer-health.ts:70`) and never read it. §5b item 5 asks the header to record the decision
truthfully; the deviation's own cost arithmetic uses three and is correct, so this is prose only. Fix: say
three in all four homes.

**The Base UI retirement should cite the OPEN #2297 rather than claim closure (#2182).**
`css-selector-has-a-writer-health.ts:19-27` retires the manifest↔installed reconciliation on the ground that
`baseui-surface-manifest#identity()` is "STRICTLY STRONGER" because it compares per PART and now carries
`state`. The mechanism claim is CONFIRMED — cutting `|${part.state.join(",")}` from `identity()` reds
`baseui-surface-manifest:mustFlag[2]` alone, both diff directions exist, and the policy drives exit 0 clean on
the real tree. But open #2297 measures `diffParts`'s vanished-PART and `diffSurface`'s vanished-COMPONENT and
VERSION arms as UNENFORCED by any proof row, and the vanished directions are the direct analogue of the
retired `baseUiManifestOnly` arm. #2297 names no CSS item, so there is no collision and nothing is caught by
nobody; the successor's proof for that direction is simply no stronger than the arm it replaced. Fix: add the
\#2297 reference to the retirement paragraph so the dependency is visible when #2297's rows are drained.

**The reviewed-grant table's determinism assertion is RED on main, inherited (not this conversion).**
`tests/tooling/verify/lib/reviewed-grants.test.ts:47` (`expect(keys).toEqual([...keys].toSorted())`) fails: 1
failed / 34 passed. Key order extracted per revision shows the same first divergence at index 2
(`bus-payload-allowlist` where `bus-channel-primitive` belongs) at `9104f718f^` (216 rows) and at
`9104f718f` / `3c685ce6a` / `HEAD` (219 rows); `seed-theme-ink-contrast` and `selection-store-via-factory` are
also transposed. The three `css-family-direct-client-mechanism` rows sit at actual index 26..28 = sorted index
26..28, so this conversion placed its rows correctly. A scoped `tests/tooling/**` red is never baseline, and
this one is unobserved because that tree is `--full`-only (#1842). Fix: re-sort the table and find the commit
that transposed those rows.

## Final state

```
$ git -C <wt> status --short
(empty)
$ git -C <wt> diff --stat HEAD
(empty)
$ git -C <wt> rev-parse HEAD
3c685ce6a6ec03b8a8348362c1ab9a94487c642b
```

Every probe restored and verified: `css-family-source-provenance.ts` md5 back to `421100a72d9c55452c9c1b3f73d02257`,
`Core-Enforcement-Active-Gates.md` md5 back to `a2a1d9a75d8d0dc1d1825bb7d4157212`, and every other patched file
byte-identical to `3c685ce6a` per `git diff --stat HEAD`. This report is the only untracked file I created
under `docs/`.

## Integration provenance (appended 2026-09-13)

The original verifier report above this heading is preserved with repository formatting normalized. Its six ledger rows map forward as follows:

- Rows 1, 2, 4, and 5 were repaired by `dd98eb356`; residual cardinality prose was corrected by `f56e83d52`. Independent source review accepted the repairs. The current-main artifact `reports/runs/test/main-4128511-2026-09-13T05-44-47-564Z/test-report.json` passed 11/11 tests across `static-class-collection.int.test.ts`, `static-class-consumers.int.test.ts`, and `css-hook-provenance-family.suite.test.ts`. Final B re-lens remains pending, so these rows are FIXED awaiting final review rather than closed.
- Row 3 remains open under #2297. The successor mechanism is stronger, but the vanished-part and vanished-component proof dependency is not closed by this fold.
- Row 6 closed separately under #2306: `78ec56ea6` preserved each grant record while restoring lexical order; the focused suite passed 3/3, its sort-predicate red swap produced 1 failed / 2 passed, and restoration passed 3/3.
- \#2309 remains pending; #2310's refusal-pin work remains active in B. Neither is resolved or reclassified here.

The four repaired verifier rows do not close the CSS-family wave until the final B re-lens is recorded.
