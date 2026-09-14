---
kind: review
status: active
updated: 2026-09-13
---

# cb-adj-authority-design — the #2320 enforcement shape and the #1922/#2147 authority train

Lane `cb-adj-authority-design`, claude-b's READ-ONLY design planner. Every number below came out of a run
produced in this session, in this lane's own worktree. No tracked file was modified at any point, and no
patch was written.

## 1. Base and census

| | |
| - | - |
| worktree | `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-ad9a858d3d636eab0` |
| HEAD | `fb2deeb98` (branch `wt/agent-ad9a858d3d636eab0`), clean at start and at end |
| predecessor report | `.claude/worktrees/agent-a38a067eb4df68d82/docs/reviews/gate-runtime/adj-authority-cohort-2026-09-13.md`, taken at `1ea2c2a0e` |

### The run that anchors everything below

`pnpm check:structure --check policy-legacy-imports` on `fb2deeb98`:

```
✗ policy-legacy-imports (5)  ·  final hard/error · population 309 source · 0 resource
final policies: 1 ran · raw 5 = waived 0 + granted 0 + effective 5 (5 error, 0 warning)
                · 0 alarm(s) · 0 tool error(s) · 0 withheld
```

exit 1, slot `agent-ad9a858d3d636eab0-536281-2026-09-13T07-17-34-499Z`. The five findings are
`depcruise-grant-liveness:30:46`, `domain-freshness-plane:70:35`, `eslint-grant-liveness:10:37`,
`lifecycle-portability:54:51`, `runner-config-path-liveness:78:46`, all `"../contract/gate.ts"`. The run is
its own positive control (the recognizer fires; `0 withheld`, `0 tool error(s)`), and it INDEPENDENTLY
REPRODUCES the predecessor's 5-at-`1ea2c2a0e` on a different sha. The invocation printed
`SELECTED RUN … this is NOT a whole-corpus verdict`, so the 5 is a per-policy number.

### The `ExemptionTable` / `ExemptionRow` census, BOTH methods

**Method 1 — `pnpm ast refs` (symbol-aware; ignores comments and string contents).**

| symbol | hits | files | scanned | status |
| - | -: | -: | -: | - |
| `ExemptionTable` | 73 | 29 | 7,589 (`ts:6179, tsx:1405, dts:4, mts:1`) | complete |
| `ExemptionRow` | 15 | 7 | 7,589 | complete |

**Method 2 — literal `rg` over `tooling/src` + `tests`.** `ExemptionTable`: **115 matches in 46 files**;
`ExemptionRow`: 13 files. The two methods DISAGREE by design and the gap is the whole hazard: `rg` finds
`ExemptionTable` in **13 FINAL modules**, the resolver finds it in **5**. The other eight
(`biome-grant-liveness`, `no-raw-color-in-css`, `ownerid-registry`, `persisted-store-registry`,
`policy-legacy-imports` itself at 17 matches, `seed-theme-ink-contrast`, `test-layout`,
`test-presence-client`) carry the word only in header prose, a `fix` string, or a proof fixture. **Grep
LOCATES; the resolver DECIDES**, and the 5 the resolver names are exactly the 5 the gate reports.

**The partition (`export const gate = defineGate(` present, over the 45 files either method admits):**

| class | count | notes |
| - | -: | - |
| FINAL modules holding a real `ExemptionTable`/`ExemptionRow` reference | **5** | the gate's 5 findings |
| FINAL modules mentioning the word in prose/fixtures only | 8 | not findings, and not work |
| LEGACY gate modules holding one | **19** | `contract-verb-presence` · `css-var-defined` · `dangling-refs` · `db-structure` · `dialog-via-composite` · `duplicate-action-doors` · `json-column-write-parity` · `knob-wire-coverage` · `no-arbitrary-tw-values` · `no-floorless-control-in-wrap` · `no-manual-memo` · `no-pointer-variants-in-features` · `no-raw-z-index` · `open-json-column-key-parity` · `query-freshness-coverage` · `tooling-slot-template` · `ui-size-via-variant` · `ui-skin-fragment-purity` · `wire-schema-vocab-one-home` — authority migrates AT CONVERSION, explicitly OUT of this train |
| `lib/` modules typed on it | **5** | `contract-derives-not-respells.ts:32` · `raw-spacing-tier.ts:22` · `raw-typography-tier.ts:21` (three TABLES) + `grant-liveness.ts:29,78,208` · `sanctioned-home.ts:7,18,36,68` (two PARAMETER-TYPE readers) |
| the type home + the barrel + the scaffold | 3 | `contract/gate.ts:28,37` · `index.ts:25,26` (a re-export) · `ops/new-gate.ts` (prose) |

**Two `lib/` sites the predecessor report did not name, and both change the design:**

- **`lib/grant-liveness.ts`** types `LivenessInput.exempt` and `PatternLivenessInput.ratified` as
  `ExemptionTable<GrantExemption>` (`:78`, `:208`). It is imported by **seven** gate modules including the
  two CONVERTED exemplars (`biome-grant-liveness:84`, `tsconfig-entry-liveness:55`). It holds no table —
  the table is the caller's argument — and `biome-grant-liveness` passes `ratified: {}`.
- **`lib/sanctioned-home.ts`** takes `homes: ExemptionTable` as a parameter on three exported functions and
  is imported by seven gates, four of them FINAL.

**The fourth relocated table is already RETYPED, not relocated.**
`lib/injected-op-caller-param.ts:30-37` declares its OWN `interface CallerFreeOpRow { op; why }` and
`export const CALLER_FREE_OP_ROWS: readonly CallerFreeOpRow[]`. It appears in NEITHER `ast refs` census.
The table is intact and gate-imported at `injected-op-caller-param-health.ts:22` and reached by
`injected-op-caller-param.ts:25` through `callerFreeOps`.

### Live waiver census for the four `ordinary` policies whose authority this train changes

`rg '@orb-waive (no-raw-spacing-in-features|no-raw-typography-in-features|contract-derives-not-respells|injected-op-caller-param)\('`
over `packages tests tooling scripts` → **7 matches, all four inside the gate modules themselves** (a `fix`
string plus each module's §4.2 proof fixture; read line by line). **Positive control in the same
invocation: 1,713 `@orb-waive ` markers across 721 files.** So an authority flip on these four orphans
**zero live product-tree markers**.

---

## 2. The #2320 enforcement shape

### 2.1 The refutation that decides the design: #2320's arm (b) is INERT as written

The row's own fix text offers *"or widen the population to the relocation target"*. **Read against the
code, that arm changes nothing.** `policy-legacy-imports.ts`'s `evaluate` is:

```ts
for (const sourceFile of ctx.files) {
  const path = ctx.relativePath(sourceFile);
  if (finalRegistrationOf(sourceFile) !== undefined) {
    judgeModule(ctx, doors.get(sourceFile) ?? []);
  } else if (path === SELF) {
    throw new Error(BLIND);
  }
}
```

The SUBJECT test is `finalRegistrationOf(sourceFile) !== undefined`. A `lib/` module registers nothing, so
adding `tooling/src/verify/lib/**` to `under` admits 174 more files that are then all skipped — **the
population grows and the finding count stays at 5.** Arm (b) needs a whole second visitor with a different
subject; at that point it is a second policy, not a widened population. A lane briefed on the row's literal
text lands a no-op that reads as a fix. Ledger row L1.

**And a widened population is affirmatively WRONG even with that second visitor**, because the honest
`lib/` uses are indistinguishable from the dishonest ones by type identity alone: `lib/grant-liveness.ts`
and `lib/sanctioned-home.ts` use `ExemptionTable` as a **parameter type on a shared reader** — the shape
§12.3 wants — while `lib/raw-spacing-tier.ts` uses it as a **declared table**. Any arm that reds the
declaration site reds `grant-liveness.ts` too, and `grant-liveness.ts` is what `biome-grant-liveness`, the
program's own migration exemplar, imports.

### 2.2 The cut: ONE new arm on the IMPORTED BINDING'S DECLARATION, no population change

**ARM D — a final module imports a BINDING whose declaration is an exemption TABLE, wherever that
declaration sits.** The finding anchors at the gate's own import specifier (inside the existing
population, so `ctx.relativePath` never throws) and the message names both ends, exactly like `laundered`.

The machinery already exists. `judgeDoor` resolves the target `SourceFile`; `launderedThrough` already
walks `shim.getExportDeclarations()` looking for a forbidden home one hop in. ARM D asks the same target
one question more, over a different node kind:

> for each NAMED BINDING this door imports, resolve it in the target and ask whether its declared type
> resolves to `contract/gate.ts#ExemptionTable` or `#ExemptionRow`.

`analysis: "types"` is already declared, so `ctx.checker()` is available. **Nothing about the population,
the subject test, the candidacy sets or the blindness tripwire moves.** That is the whole reason this arm
is cheap: #2201 already paid for "resolve the target and interrogate it".

**Cut direction and the controls the arm owes** (§4.1 — a narrowing owes a row that dies without it):

| control | arm | expected |
| - | - | - |
| a final module importing `SANCTIONED_HOMES` from a planted `lib/x.ts` that declares `export const SANCTIONED_HOMES: ExemptionTable = {…}` off a planted `contract/gate.ts` | `mustFlag` | **1**, token `"../lib/x.ts"`, `messageIncludes` naming both the binding and the table home |
| a final module importing a FUNCTION from a planted `lib/x.ts` whose PARAMETER is `ExemptionTable`-typed (the `grant-liveness.ts` shape) | `mustPass` | silent — the arm judges the imported binding's own declared type, never the module's type imports |
| a final module importing a `lib/x.ts` that declares a table typed by a LOCAL `interface Row { why: string }` (the `CallerFreeOpRow` shape) | `mustPass`, with its `why` stating the LIMIT | silent — see §5 counterexample C1; this is the arm's declared blind spot, and it owes a row that says so rather than a pretence |
| an already-migrated module (`biome-grant-liveness`'s shape: imports `patternLivenessFindings`, passes `ratified: {}`) | `mustPass` | silent |
| a re-export chain `gate → lib/shim.ts → lib/table.ts` where the table lives at the far end | `mustFlag` | 1 — the visited-set walk must reach the DECLARATION, not stop at the first hop |

The last row is the one a lane will skip. `launderedThrough` currently terminates on a forbidden HOME; ARM
D terminates on a forbidden DECLARATION, and the two walks must share the visited set or a two-hop
relocation is a second free escape.

### 2.3 Why the alternatives lose

| alternative | verdict |
| - | - |
| **(a) alone, keyed on the type name** as #2320 words it ("an `ExemptionTable`-typed export anywhere under `verify/lib`") | **incomplete but necessary.** It is the right arm; the wording is wrong twice — it must be keyed on IDENTITY (`contract/gate.ts`'s declaration), not the spelling, and it must be anchored at the IMPORTING module, not at `verify/lib`, or it reds `grant-liveness.ts`. |
| **(b) widen the population to the relocation target** | **REFUTED — inert.** §2.1. Ledger row L1. |
| **(c) retire the `ExemptionTable` type once the last table migrates** | **correct destination, unavailable now.** 19 LEGACY gate modules plus two `lib/` readers plus the `index.ts` barrel still reference it, and read-first §2 puts the corpus at 44 legacy modules on 2026-09-13. (c) is a CUTOVER task, and its enforcer is the deletion itself — once `contract/gate.ts` is gone, the false clean cannot exist. Recording it as the end state is right; scheduling it into this train is not. |
| **(d) a `-health` sibling that censuses `lib/**` for exemption declarations** | loses to (a): a census sibling reports on modules the arm cannot repair from, and a table in `lib/` that NO gate imports is dead code for `knip`, not a §12.5 violation. §12.5's property is *"gate modules RECEIVE neither grant tables nor marker parsers"* — the predicate is RECEIPT, so the finding belongs at the receiving door. |

**Recommended: (a) as ARM D, exactly as specced in §2.2, with (c) recorded in the header as the end state
and its trigger named (the day `contract/gate.ts` deletes).**

### 2.4 Coupled sites of the ARM D change itself

| site | what it owes |
| - | - |
| `docs/architecture/core/Core-Enforcement-Active-Gates.md` | the `policy-legacy-imports` row gains ARM D's sentence. **No count-line edit** — ARM D adds no module. |
| `policy-legacy-imports.ts`'s `FIX` string | its ARM B clause today reads *"debt data with one owner (a deferral list) moves to `contract/` or `lib/` the same way"*, which is the sentence that AUTHORIZED the four relocations. It must be narrowed to say a ROW TYPE may move and a TABLE may not. |
| the module header's ARM list | three arms today (A/B/C by the header's lettering, plus laundering); ARM D joins with its own paragraph and its own `DoorVerdict` kind. |
| `gate-runtime-standardization.md` §12.5 | one sentence: the property is enforced at the receiving import, and relocation is not discharge. |
| `docs/reviews/gate-runtime/v-authority-census-2026-09-12.md` §5 C2 | still names a directory-vs-file grant-key ruling as its prerequisite; §12.5 + `bus-payload-allowlist:credential-id` answered it. (Carried from the predecessor report; still true at `fb2deeb98`.) |

---

## 3. Remaining subjects

Five FINAL modules and four relocated tables. Every row read in full.

| module / table | what it still holds | the permissions it encodes | live? | target shape |
| - | - | - | - | - |
| `gates/runner-config-path-liveness.ts` | `ExemptionTable, Finding` import `:78`; `EXEMPT: ExemptionTable<GrantExemption> = {}` `:106` | **NONE — the table is empty** | — | **DELETE.** Not one line: `EXEMPT` is read at `:283` (`exempt: EXEMPT`), `:293` (`EXEMPT[row.path] === undefined`) and `:382` (`Object.values(EXEMPT).map(row => row.cite)` feeding the `authored-path` demand). All three collapse. The `Finding` import survives only for `reportLiveness`'s local alias and becomes `ctx.report.file`. Authority stays `hard`. No grant minted. |
| `gates/depcruise-grant-liveness.ts` | `ExemptionTable, Finding` `:30`; `EXEMPT = {}` `:52`; `RATIFIED: ExemptionTable<GrantExemption>` `:74` (**3 rows**); **`BACKREF_BUDGET = 16`** `:61` | `EXEMPT`: none. `RATIFIED`: `(^\|/)__g_` (cite `GATE-AUTHORING.md`) · `^packages/[^/]+/dist/` (cite `.gitignore`) · `^@jitl/quickjs-ng-wasmfile-release-sync/wasm\?url$` (cite `ui-guest.worker.ts`) | all 3 live | **3 reviewed-grant rows**, subject = the pattern source, operation = `depcruise-pattern-grant`. `EXEMPT` deletes. **`BACKREF_BUDGET` is a COUNT RATCHET §12.5 bans outright and no arm sees it — ledger row L2.** |
| `gates/eslint-grant-liveness.ts` | `ExemptionTable` `:10`; `RATIFIED: ExemptionTable<RatifiedRow>` `:21` (**7 rows**) | `config[0].ignores[0,1,3,4,5,6,7]` → `**/node_modules/**` · `**/dist/**` · `**/__g_*` · `.stryker-tmp/**` · `**/.cache/**` · `**/.claude/worktrees/**` · `scripts/probes/st-goldens/sillytavern-runtime/**` | all 7 live (rows 6–7 added 2026-09-13 BECAUSE the gate caught them) | **7 reviewed-grant rows keyed on the selector VALUE, never the position.** The table is keyed `config[0].ignores[N]` and the module's own `:56-60` comment says an insert above silently re-points every row, caught only by `sameValue`. A grant carries no `value` field, so a position-keyed subject LOSES that check; a value-keyed subject makes it unnecessary. operation = `eslint-selector-grant`. |
| `gates/domain-freshness-plane.ts` | `ExemptionRow` `:70`, used at `:90` (`RoomReach`), `:95` (`FreshnessRow extends`), `:367` (`UNSEATABLE_SCHEMA`) | **NOT a grant table** — `ExemptionRow` is `{ why: string }` used as a structural mixin; `DOMAIN_FRESHNESS` is a TOTAL domain roster and `UNSEATABLE_SCHEMA` is a TOTAL classification (unrowed = RED, unreferenced row = RED) | n/a | **ROW-TYPE re-home, no grant.** Declare the `{ why }` row in `tooling/src/verify/contract/` and drop the `contract/gate.ts` import. Precedent on the tree: `contract/tenancy-scope.ts#ScopingRow`, whose header states the distinction verbatim. See §5 C3. |
| `gates/lifecycle-portability.ts` | `ExemptionRow, ExemptionTable` `:54`; `NonPortableRow extends ExemptionRow` `:82`; `NON_PORTABLE_CANON: ExemptionTable<NonPortableRow>` `:114` | **NOT a grant table** — a TOTAL classification over owner-stamped tables, two-sided by construction (`:406`, `:423`), paired with `PORTABLE_CANON_TABLES` which §4's own `countFrom` ruling already names a MODULE-LEVEL REGISTRY | n/a | **Same remedy as `domain-freshness-plane`.** `NonPortableRow` gains `classification` + `why` in a `contract/`-homed declaration. No grant. See §5 C3. |
| `lib/raw-spacing-tier.ts:22` `SANCTIONED_HOMES` | `ExemptionTable`, 2 rows | `packages/ui/src/layout/` · `packages/ui/src/markdown/` | both live | **2 reviewed-grant rows**, subject = the home path, operation = `raw-spacing-home`. Requires `no-raw-spacing-in-features` to STOP skipping and instead report ONE aggregate finding per home (§12.5's 1:1 shape; `biome-grant-liveness#reportCandidates` is the code to copy). Its population is `["@client","@ui"]`, so the homes ARE in scope and the finding is producible. |
| `lib/raw-typography-tier.ts:21` `SANCTIONED_HOMES` | `ExemptionTable`, 2 rows | same two paths, typography reasons | both live | same, operation = `raw-typography-home`. **The two files stay separate** (their headers argue it) and become two grant rows per policy. |
| `lib/contract-derives-not-respells.ts:32` `ALLOWLIST` | `ExemptionTable`, 2 rows | `…/discovery/contract/results.ts::ThemeRow` (HOMONYM) · `…/stats/contract/views.ts::ModelStatRow` (AGGREGATE) | both live | **2 reviewed-grant rows**, subject = the `<path>::<Shape>` key already used, operation = `contract-respell`. |
| `lib/injected-op-caller-param.ts:37` `CALLER_FREE_OP_ROWS` | **RETYPED** to a local `CallerFreeOpRow`, so invisible to any `ExemptionTable` arm | ≥4 rows: `ReapAssetsOp` · `ListCharacterSpriteAssetsOp` · `ResolveAssetHashOp` · `LoadAssetBytesOp` (read the full list before authoring) | all live | **N reviewed-grant rows**, subject = the op name, operation = `caller-free-op`. **`ListCharacterSpriteAssetsOp`'s own `why` says it is UNWIRED — check before granting; an op no contract declares is a DELETION, not a grant.** #1922's scope-extension comment (2026-09-11) names this table in scope. |

**Authority consequences, measured.** `no-raw-spacing-in-features`, `no-raw-typography-in-features`,
`contract-derives-not-respells` and `injected-op-caller-param` are all `authority: "ordinary"` today; a
reviewed grant may only be consumed by a `reviewed-grant` policy, so all four FLIP, losing their
`@orb-waive` door (zero live markers — §1) and owing a §4.3 grant-identity arm in place of their §4.2
identity arm. `eslint-grant-liveness` and `depcruise-grant-liveness` flip `hard` → `reviewed-grant`, which
is the biome precedent exactly.

**Two `-health` siblings become EMPTY and delete.** `spacing-tier-home-health` and
`typography-tier-home-health` have exactly one arm each — `unresolvedSanctionedHomeKeys(...)` over
`SANCTIONED_HOMES` (`spacing-tier-home-health.ts:58`), the rename tripwire. §12.5's central
`stale-reviewed-grant` alarm subsumes it and is STRICTLY STRONGER: the tripwire reds when the home resolves
to zero FILES, the central alarm reds when the grant is consumed zero TIMES, which also catches a home that
still exists but no longer spells the raw utility — the exact end condition both rows' `why` already
declares. **That is a behavioural delta and it is a §4.6 differential line, not a silent improvement.**

---

## 4. Train plan

Three commits. Each is lane-sized and each leaves the tree in a coherent state. **Commit 1 is the
prerequisite for 2 and 3** — landing the migration first would take the arm to 0 red while the escape stays
open, which is precisely #2320.

### Commit 1 — ARM D on `policy-legacy-imports`, plus the two zero-cost deletions

**Files:** `tooling/src/verify/gates/policy-legacy-imports.ts` (ARM D + its rows + the narrowed `FIX`) ·
`tooling/src/verify/gates/runner-config-path-liveness.ts` (delete `EXEMPT` and its three read sites, drop
both type imports) · `tooling/src/verify/gates/depcruise-grant-liveness.ts` (delete the EMPTY `EXEMPT` only;
`RATIFIED` and the `contract/gate.ts` import stay for commit 2) ·
`docs/architecture/core/Core-Enforcement-Active-Gates.md` (the `policy-legacy-imports` row's ARM D sentence,
**no count-line edit**).

**Proof obligations.**

1. **RED FIRST.** Before ARM D exists, run the five §2.2 controls as scratch fixtures against the UNMODIFIED
   module and show the relocation control returns **0**. That is the receipt that the escape is real, and
   it must be produced before the fix (`.claude/rules/lane-standing-facts.md`).
2. Five `mustFlag`/`mustPass` rows per §2.2, each with `expect` carrying `count` + `token` +
   `messageIncludes` (§4.1). The `CallerFreeOpRow` control lands as a `mustPass` whose `why` STATES the
   declared blind spot — an honest limit, never an invented row (§4.1's fourth outcome).
3. **The `?query` cache trap and the one-scratch-module-per-cut rule** if a §4.1 cut harness is used: one
   scratch module per cut, serial in the name.
4. Named floor: `pnpm test:scoped tests/tooling/verify/gates/policy-soundness-family.test.ts` (or whichever
   file the `policy-soundness` family test resolves to at claim time — re-derive, do not trust this name),
   `pnpm check:policy-conformance` whole, and `pnpm check:structure --check policy-legacy-imports`
   before/after with both numbers stated.
5. **Barrier:** the arm's finding count must go **5 → 9** on this commit (5 existing + the four
   `lib/`-relocated tables at `no-raw-spacing-in-features:34`, `no-raw-typography-in-features:51`,
   `contract-derives-not-respells:54`, `injected-op-caller-param-health:22`) — MINUS whatever
   `runner-config-path-liveness` and the empty `EXEMPT` remove. **State the expected arithmetic in the
   commit message and reconcile it**; a lane that lands ARM D and reports "still 5" has shipped a dead arm.
   `injected-op-caller-param-health` will NOT appear (retyped) and the commit says so.

### Commit 2 — the two config-registry migrations (`eslint`, `depcruise`) + the count ratchet

**Files:** `gates/eslint-grant-liveness.ts` · `gates/depcruise-grant-liveness.ts` ·
`lib/reviewed-grants.ts` (+10 rows) · `tests/tooling/verify/gates/grant-liveness-family.test.ts` ·
`docs/architecture/core/Core-Enforcement-Active-Gates.md` (count line, IF a `-health` split lands).

**Proof obligations.**

1. **`tests/tooling/verify/gates/grant-liveness-family.test.ts:74-81` REDS BY CONSTRUCTION.** It is a
   `toEqual` over the exact `[id, family, authority]` triples and its own comment calls itself the tripwire
   on both halves. Update it in the same commit; do not treat the red as noise.
2. **Grant identity, four pins each** (§4.3, copy `home-client-family.test.ts:259-305`): the intended row
   consumed exactly once · a wrong `operation` stays effective · a renamed subject stales or withholds ·
   `authorityAlarms` empty. A `runPass` module row CANNOT prove grant consumption (`reviewedGrants: []`), so
   this lives in the family test.
3. **The `cite` dead-arm loss is stated PER ROW, never absorbed** (owner ruling on #2147;
   `biome-grant-liveness`'s header at `:24-36` is the shape, including its own retraction of a wrong
   successor claim). Ten rows, ten sentences.
4. **`depcruise` almost certainly SPLITS.** It carries `MSG_NO_ROWS` (a blindness tripwire) and
   `BACKREF_BUDGET` in the same module; per the biome precedent — *"a tripwire that refuses a false clean
   must not itself be suppressible by the door this policy's findings carry"* — both move to a `hard`
   `depcruise-grant-liveness-health`. **A SPLIT adds a module and reds
   `tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts` plus the
   `(309 registered gates)` line at `Core-Enforcement-Active-Gates.md:387`** — no id-grep finds that suite
   (§8.8); bump the count in the same commit.
5. **`BACKREF_BUDGET`'s own disposition must be RULED, not carried** (ledger row L2). It is a count ratchet
   §12.5 bans in one sentence. It is not a reviewed grant (a count is not a `(subject, operation)`
   identity). The two honest arms are: express the sixteen backreference rows as sixteen grant rows keyed
   on the rule pair, or delete the budget arm and record what it stops holding. **Fork for the root.**
6. Named floor: `grant-liveness-family.test.ts`, `tests/tooling/verify/ops/eslint.int.test.ts` (its
   `:227` comment names `eslint-grant-liveness`'s RATIFIED row as the `#2213` coupled site and its
   assertions pin the real config), `biome-grant-liveness.int.test.ts`,
   `tsconfig-entry-liveness.int.test.ts`, `enforcement-registry-parity.int.test.ts` if split,
   `pnpm check:policy-conformance` whole, and `pnpm check:structure --check` for each touched policy.

### Commit 3 — the four relocated tables and the two `-health` deletions

**Files:** `lib/raw-spacing-tier.ts` · `lib/raw-typography-tier.ts` · `lib/contract-derives-not-respells.ts`
· `lib/injected-op-caller-param.ts` · the four occurrence gates (`ordinary` → `reviewed-grant`, skip →
aggregate report) · DELETE `gates/spacing-tier-home-health.ts` and `gates/typography-tier-home-health.ts` ·
`lib/sanctioned-home.ts` (drop `unresolvedSanctionedHomeKeys` if it loses its last caller — check
`no-raw-z-index`, `no-pointer-variants-in-features`, `ui-skin-fragment-purity` first) ·
`lib/reviewed-grants.ts` · `Core-Enforcement-Active-Gates.md` (count line −2, table rows removed).

**Proof obligations.**

1. **The predecessor's hazard, confirmed and sharpened:**
   `tests/tooling/verify/gates/tier-home-health-family.int.test.ts:200-206` pins that
   `lib/sanctioned-home.ts` *"changed only ADDITIVELY since BASE"* and rewrites the
   `from "../lib/sanctioned-home.ts"` specifier. **`homeFiles`/`reportUnresolvedHomes` CANNOT be deleted in
   this commit** — their consumers `no-pointer-variants-in-features:14`, `no-raw-z-index:20` and
   `ui-skin-fragment-purity:20` are all still LEGACY (`defineGate` count 0, verified per module). Say so in
   the commit; a half-delete is worse than no delete.
2. **`tests/tooling/verify/gates/injected-op-caller-param-split.test.ts` breaks two ways**, and only one is
   the one the predecessor named: `:43` imports `CALLER_FREE_OP_ROWS` **by symbol** and `:54` builds
   `CALLER_FREE_NAMES` from the live rows, AND `:68` carries `STALE_RE = /CALLER_FREE_OPS names "…"/u`
   against the MESSAGE TEXT. Retarget both.
3. **Each occurrence gate's §4.2 identity arm is REPLACED, not deleted** — the `mustPass` marker fixture
   becomes a §4.3 grant arm in the family test. The four in-module `@orb-waive` fixtures (§1) go with it,
   and the `fix` strings that promise the marker spelling must be rewritten or the policy tells its user to
   do something it no longer supports (§5b item 3).
4. **The aggregate-finding change is the substance, and it owes a `mustFlag`.** Today
   `no-raw-spacing-in-features:76` SKIPS a sanctioned file. After the migration it must REPORT one
   aggregate finding per home with `subject`/`operation`, or the grant is consumed zero times on day one
   and the central `stale-reviewed-grant` alarm reds immediately. Pin the aggregate cardinality
   (`count: 1` per home, not per site) — that is what makes the grant 1:1 (§12.5).
5. **§4.6 differential, all three axes named separately** (findings · populations · tool errors), plus the
   §12.5 delta for the deleted `-health` pair: the central alarm's red condition is STRICTLY WIDER than the
   rename tripwire's. Say which of §4.6's vacuity shapes the record is.
6. Named floor: `tier-home-health-family.int.test.ts`, `injected-op-caller-param-split.test.ts`,
   `contract-shape-wave-1.test.ts` (`:34` names the `CALLER_FREE_OPS` staleness claim),
   `home-server-family.test.ts` (`:16`/`:202`/`:232` assert the family's reviewed-grant set and the rename
   arm — a new sanctioned-home policy joining the grant table touches it), `enforcement-registry-parity`,
   `pnpm check:policy-conformance` whole, `pnpm check:structure --check policy-legacy-imports` expecting
   **0**.
7. **The success condition is TWO receipts, not one.** ARM D landing in commit 1 is what makes the first
   receipt honest: `--check policy-legacy-imports` → 0 AND
   `rg ': ExemptionTable' tooling/src/verify/lib/` → nothing for the four family files. Without commit 1
   the first receipt is satisfiable by relocation and proves nothing.

---

## 5. Counterexamples and rulings preserved

**C1 — `lib/injected-op-caller-param.ts#CallerFreeOpRow`: a shape-keyed arm CANNOT see it, and this is a
declared limit, not a gap to paper over.** The table is already retyped to a local one-field interface, so
ARM D's identity test (`declared type resolves to contract/gate.ts#ExemptionTable/#ExemptionRow`) returns
false. A structural arm keyed on "an exported `Record<string, { why: string }>`" would red
`lib/registry-triggers.ts#StageTrigger`, `lib/ct-view.ts#SweepTrigger` and
`contract/tenancy-scope.ts#ScopingRow`, none of which is a grant. **The honest output is a `mustPass` row
whose `why` names the limit** (§4.1's fourth outcome, and its bar: say which construction you attempted).
The retype escape is closed by the MIGRATION (commit 3), not by the arm.

**C2 — `lib/grant-liveness.ts` and `lib/sanctioned-home.ts` must NOT be migrated or reded.** They type
FUNCTION PARAMETERS with `ExemptionTable`; they hold no rows and grant nothing. `grant-liveness.ts` is
imported by the two converted exemplars. Their `ExemptionTable` reference retires with the type at cutover
(alternative (c)), by re-homing the row shape — not by a grant.

**C3 — `NON_PORTABLE_CANON`, `PORTABLE_CANON_TABLES`, `DOMAIN_FRESHNESS` and `UNSEATABLE_SCHEMA` are
POPULATION FACTS, and migrating them to reviewed grants is WRONG.** Three independent authorities agree:
(i) §4's `countFrom` ruling (#2001) names `PORTABLE_CANON_TABLES` and the domain roster as MODULE-LEVEL
REGISTRIES the fixture cannot control, and `lifecycle-portability:557,568` already carries live
`countFrom` rows against it; (ii) each table is TOTAL and two-sided — an unrowed subject is RED, which is
the opposite of a grant (a grant SUPPRESSES a finding; these MANUFACTURE one by absence); (iii)
`contract/tenancy-scope.ts:23-25`'s header states the distinction as law: *"Deliberately not a reusable
'exemption' shape … this decides whether a table's scope predicate IS what the row says, never whether an
existing finding is suppressed."* Their remedy is a `contract/`-homed row declaration.

**C4 — `runner-config-path-liveness`'s `EXEMPT` mints nothing.** It is `{}`. Chunk C1 emptied it and stopped
one line short. Deleting it is a DELETION, never a grant — and it is three read sites, not one.

**C5 — a `cite` path has no successor under a grant, per row.** Preserved verbatim in substance from #2147's
owner/orchestrator ruling: *"`eslint`/`depcruise`'s RATIFIED rows carry `cite` paths whose dead-cite arm has
NO successor under a grant — state it per row, never absorb it."* `biome-grant-liveness`'s header records
its own retraction of a wrong successor claim (`dangling-refs` does not look) and is the shape to copy.

### Owner and orchestrator rulings this design is held against

- **#1922:** one lane owns the ENTIRE `sanctioned-home` family at once, never pair-by-pair (owner,
  2026-09-11); scope extended to `ALLOWLIST` and `CALLER_FREE_OPS` (verifier wave 3, 2026-09-11);
  **re-derive the table population at claim time, do NOT work the recorded 97-of-319** (2026-09-11) — §1 is
  that re-derivation; the row's OPEN QUESTION (per-file enumeration vs a directory operator) is **answered
  by neither arm**: §12.5's aggregate-finding shape plus `bus-payload-allowlist:credential-id` is the
  answer, and §12.4's "OPEN, proposal only" operator paragraph defaults to **ARM B (no operator)**.
- **#2147:** the gate is `hard`/`error` by orchestrator ruling 2026-09-12; **until landed, the arm's reds
  are the honest state of the tree, not a lane's defect**; `runner-config-path-liveness`'s `EXEMPT` is
  EMPTY (C1 — delete, no grant); the `cite` dead-arm loss is stated per row; split by MODULE.
- **#2320:** the fix text's arm (b) is refuted here (§2.1); arm (a) survives with two corrections.
- **read-first §0.1:** nothing gets to refuse to convert; a lane ASKS and keeps working; a recorded refusal
  is a snapshot; a "superseded" ruling owes a tree read and a planted control.
- **§12.5:** a reviewed grant is strictly 1:1; a class-level allowance migrates by the POLICY reporting ONE
  aggregate finding per class; no gate-specific exemption grammar and **no count ratchet**.

### One semantically stale reference

**#2147's issue body names NINE modules; the tree carries FIVE.** A lane briefed off the body's list will
go looking for `contract-derives-not-respells`, `injected-op-caller-param`, `no-raw-spacing-in-features` and
`no-raw-typography-in-features` in the gate's output and find them absent — and the absence is the DEFECT
(#2320), not the fix. The 2026-09-13 adjudication comment on the row says so; brief the comment, not the
body.

---

## LEDGER ROWS (2 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `policy-legacy-imports` | cb-adj-authority-design L1 · `tooling/src/verify/gates/policy-legacy-imports.ts:358-366` (the `evaluate` subject test) and board row #2320's fix text | **#2320's OWN remedy arm (b) — "widen the population to the relocation target" — is INERT and a lane implementing it as written lands a no-op that reads as a fix.** `evaluate` judges a file only where `finalRegistrationOf(sourceFile) !== undefined`; a `tooling/src/verify/lib/**` module registers nothing, so adding it to `under` admits 174 more files and skips every one. The finding count is unchanged at 5. Arm (b) needs a second visitor with a different subject, at which point it is a second policy, not a widened population — and a declaration-site arm over `lib/**` is affirmatively WRONG because `lib/grant-liveness.ts:78,208` and `lib/sanctioned-home.ts:18,36,68` use `ExemptionTable` as a PARAMETER type on shared readers that the converted exemplar `biome-grant-liveness:84` imports | other (a board row's stated fix is a no-op) | **OPEN** (board #2320) | `pnpm check:structure --check policy-legacy-imports` on `fb2deeb98`: **5 findings · 0 tool error(s) · 0 withheld**, slot `agent-ad9a858d3d636eab0-536281-2026-09-13T07-17-34-499Z` (the invocation's own positive control). Population reported as **309 source**. `ls tooling/src/verify/lib/*.ts` = **174** files, none of which registers a gate. `lib/grant-liveness.ts` importers, measured: `biome-grant-liveness:84`, `tsconfig-entry-liveness:55`, `depcruise-grant-liveness:35,36`, `eslint-grant-liveness:13`, `runner-config-path-liveness:83,84`, `no-blanket-suppression:50`, plus three non-gate readers · FIX: land ARM D at the RECEIVING import instead (§2.2) — resolve the imported BINDING in the already-resolved target and judge its declared type's identity against `contract/gate.ts#ExemptionTable`/`#ExemptionRow`; no population change, and the `#2201` `launderedThrough` walk is the machinery |
| `depcruise-grant-liveness` | cb-adj-authority-design L2 · `tooling/src/verify/gates/depcruise-grant-liveness.ts:61` (`BACKREF_BUDGET = 16`) with `lib/grant-liveness.ts#irreducibleBudgetFindings` | **A FINAL policy carries a live COUNT RATCHET, which §12.5 bans in one sentence ("No gate-specific exemption grammar and no count ratchet"), and NO arm of any policy sees it.** `policy-legacy-imports` judges import ORIGIN and reds this module for `ExemptionTable` — a defect that will be repaired in the authority migration, at which point the module goes green while the ratchet survives. The budget is two-sided by hand (`budgetMoved` names growth AND uncommitted shrink), which is exactly the "current-population declaration count / every-file manifest" family §12.5 says RETIRES. It is not migratable as a grant: a COUNT is not a `(subject, operation)` identity | other (a §12.5-forbidden mechanism held by nothing, in a final module) | **OPEN** (needs a ruling; route with #2147) | Read in full at `fb2deeb98`: `:56-61` declares `BACKREF_RE = /\$\d/u` and `const BACKREF_BUDGET = 16`, `:63-66` declares the `BUDGET_ANCHOR` real-tree guard, and `PATTERN_MESSAGES.budgetMoved` (`:118`, inside the table opened at `:100`) is the two-sided message; the arm runs at `:277` (`irreducibleBudgetFindings(CONFIG_REL, irreducibleCount, BACKREF_BUDGET, …)`) behind the `:319` anchor. `irreducibleBudgetFindings` is imported at `:36` and, measured across `tooling/src/verify`, has exactly ONE importer — this module. `pnpm check:structure --check policy-legacy-imports` reports this module for its `contract/gate.ts` import at `:30:46` and says nothing about the budget · FIX: fork for the owner — express the sixteen backreference rows as sixteen reviewed-grant rows keyed on the rule pair, or delete the budget arm and record in the header what it stops holding. Either way it lands with commit 2 of the train, never carried silently through the authority migration |

**ledger rows OWED: 2**

Not counted above because they are re-statements, not new defects: cb-adj-authority's ledger row 1 (the
relocation escape itself) stands unchanged and is REPRODUCED here on a second sha; the
`v-authority-census-2026-09-12.md` §5 C2 stale prerequisite is still open and still one line of prose.

---

## WHAT I DID NOT COVER

- **No whole-tree run.** No `pnpm check`, no bare `check:structure`, no `check:policy-conformance`, no
  `gate:contract`, no tests — the brief's load fence. The single bounded `--check policy-legacy-imports`
  printed `SELECTED RUN … this is NOT a whole-corpus verdict and reports/check-structure.json was NOT
  republished`, so its 5 is a per-policy number. **I therefore have no corpus-wide final/legacy partition
  of my own**; where §1 partitions modules it uses a `defineGate(` presence test per file, which is a
  weaker instrument than `pnpm check:policy-conformance` (read-first §2 says the roster is that command,
  never a grep, and that a bare `defineGate` grep overcounts by two).
- **I did not run ARM D.** It does not exist. Every claim about what ARM D would catch is a claim about the
  code I read (`judgeDoor`, `launderedThrough`, `evaluate`), not a measurement. The red-first control in
  commit 1's floor is exactly the measurement I could not take.
- **I did not run any test.** `grant-liveness-family.test.ts:74-81`, `injected-op-caller-param-split.test.ts`
  and `tier-home-health-family.int.test.ts:200-206` are read receipts, not run receipts. My claim that they
  RED under the migration is derived from their assertion text, and a lane owes the actual run.
- **My ast-grep control returned nothing and I am reporting that as a non-result.** The pattern
  `export const $N = { $$$ }` over `tooling/src/verify/lib` (174 `.ts` files) matched no `why:`-bearing
  const, which is a pattern-shape failure (typed consts do not match a bare object pattern), not evidence.
  The "other row shapes in `lib/`" sweep in §5 C1 rests on the `rg 'readonly why\s*:'` census alone —
  **one method, no second**, and it LOCATES rather than decides.
- **I did not read the four relocated tables' full row sets for `CALLER_FREE_OP_ROWS`.** I read four rows at
  `lib/injected-op-caller-param.ts:37-70`; the array continues past line 70 and the authoring lane must
  count and read every row, including the liveness question on `ListCharacterSpriteAssetsOp`.
- **I did not read `Core-Enforcement-Active-Gates.md` in full** (385 KB) — only the
  `enforcement-registry-parity` row (`:188`) and the count line (`:387`), per the read-first on-demand rule.
- **I did not verify the `policy-soundness` family test's filename.** Commit 1's floor names it as a
  re-derive-at-claim-time item for that reason.
- **I did not touch Project 1, and I proposed no lifecycle transition.** Every routing statement above is a
  proposal for the root.

---

# Revision after root review — 2026-09-13

Root read the 431 lines above and returned REQUEST CHANGES with five points plus an addendum. **This
section is ADDITIVE and AUTHORITATIVE where it conflicts with §1–§5 above**; nothing above was rewritten,
and §R10 lists every earlier claim this leg corrects so a reader can see what moved. **Root implements
nothing from the first proposal — §R9 is the complete replacement train plan.** Still read-only: no
tracked file was modified in this leg either, and no `cp`-backed source probe was taken.

## R0. The instrument this leg built, and its positive control

The revision turns on numbers §1–§5 did not have, so the instrument comes first.

**`cb-adj-armd-enumerate.mjs`** (scratchpad, read-only, no tracked file touched) loads the real
`tooling/tsconfig.json` program through ts-morph and asks ARM D's exact question over the real corpus.
**Its credential is that it reproduces ARM A's live answer exactly before it is allowed to publish an
unknown one** — the `css-length-tokens` lesson (an enumeration that re-implements a walk under-reports
silently, in the direction that looks like success).

```
project source files: 2892
gates/ modules (non-_proof): 309
FINAL (canonical defineGate): 267

ARM A REPRODUCTION CONTROL (expect exactly 5 modules): 5 module(s), 5 door(s)
  depcruise-grant-liveness · domain-freshness-plane · eslint-grant-liveness
  lifecycle-portability · runner-config-path-liveness      ← all "../contract/gate.ts"

ARM D PREDICTED FINDING SET: 6 module(s), 6 door(s)

FUNNEL: {"valueNamedImports":1630,"resolvedToDecl":1630,"variableDecls":262,
         "withTypeNode":38,"typeReference":27,"tableNamed":6,"gateContractIdentity":6}
ACQUITTED type-annotated value doors NOT a table type: 21
```

**The control matches the production dispatcher module-for-module** — the same five ids
`pnpm check:structure --check policy-legacy-imports` printed on `fb2deeb98`. That is what makes the ARM D
number evidence rather than a guess. It is still MY prototype's answer, not a run of a design root
approved; §R11 states exactly what it does not cover.

**And the funnel is the finding that re-prices point 1.** Of 1,630 named value imports into the 267 final
policies, **262 resolve to a variable declaration, only 38 carry a type annotation at all, 27 of those are
a TypeReference, and exactly 6 name a table type — all 6 resolving to `contract/gate.ts`.** So ARM D's
visibility is **6 of 262** value doors. **224 untyped variable doors are structurally invisible to any
type-identity arm**, and 21 more are typed with something else.

## R1. Point 1 — ARM D's closure claim was overstated. Corrected, and the structural alternative priced and REJECTED.

### R1.1 What §2.2 claimed, and why it was wrong

§2.3 said retiring `contract/gate.ts` means *"the false clean cannot exist."* **That is false and I withdraw
it.** Deleting the type eliminates the TYPE, not the CLASS: a gate can declare
`interface Row { why: string }` locally and keep the identical table, which is not a hypothetical — it is
**already on the tree** at `lib/injected-op-caller-param.ts:30-37`, landed as a #2147 remedy, and ARM D
correctly returns nothing for it (§R0's set omits `injected-op-caller-param-health` by construction).

**ARM D repairs the current corpus; it does not prevent reintroduction.** Both halves must be said in the
same breath, and the header must say it too.

### R1.2 The structural use-provenance arm, priced

The arm root asked me to price: *detect, at the USE site, that a gate consults a private per-subject allow
table of any local type.* The detectable signature has three parts, and every one of them costs:

| part | what it needs | measured cost on this tree |
| - | - | - |
| **the collection** | a module-level `const` keyed by, or membership-tested against, a subject | **262 variable doors from `lib/` alone**, plus every in-module collection. `policy-legacy-imports.ts:85` `FORBIDDEN_IMPORT_HOMES` and `:96` `FORBIDDEN_BASENAMES: ReadonlySet<string>` are exactly this shape |
| **the subject link** | the tested key is derived from the node under judgment | resolvable syntactically in the easy cases (`T[rel]`, `S.has(name)`), not in the general one (`Object.keys(T).find(k => covers(k, rel))` — `lib/sanctioned-home.ts:19`, the actual live shape) |
| **the suppression link** | the membership test REACHES the absence of a `ctx.report.*` call | **a control-flow property.** Constitution §2.2 makes enforcement a LADDER and read-first §3 states plainly that a control-flow-dependent property is routinely held by a behavioural suite BY DESIGN. This is the part that cannot be a gate |

**The arm is REJECTED, and the decisive receipt is self-reference.** `policy-legacy-imports.ts:102` is
`return FORBIDDEN_BASENAMES.has(basenameOf(specifier));` — a module-level per-subject collection consulted
to decide whether a node is reported. **Any structural ban on that shape reds the enforcer itself**, and
the same is true of `PORTABLE_CANON_TABLES`, `DOMAIN_FRESHNESS`, `RETIRED_MARKER_OPENERS` and every
declared vocabulary in the corpus. The 21 acquitted typed doors are the visible edge of that population —
`external-id-writer.ts:27` `EXTERNAL_ID_CLAIM_CALLERS: ReadonlySet<string>`, `EDITOR_FORM_FACTORIES`,
`FIXTURE_NAMES`, `RESERVED_PORT_NUMBERS`, `ARTIFACT_FILERS` — and most of them are POPULATION FACTS of §5
C3's class, not grants. **A shape-only arm cannot tell a roster from an allowlist without inferring
intent, which root forbade and which I agree is not buildable here.** Separating them needs the
suppression link, which is the tier that cannot hold it.

Two weaker structural variants, also rejected, so the arms are on the record rather than unconsidered:
banning `why`-bearing row types outright (root forbade it; it would red `contract/tenancy-scope.ts#ScopingRow`
and every honest cited vocabulary), and requiring every module-level collection in a final policy to arrive
through a fact or resource (reds `FORBIDDEN_IMPORT_HOMES`, i.e. the enforcer, again).

### R1.3 RECOMMENDED: bounded migration + ARM D + a DECLARED CHECKER LIMIT with a named holder

**The exact property ARM D enforces, and nothing more:**

> A FINAL policy module may not RECEIVE, through any import door, a value whose declared type resolves to
> `tooling/src/verify/contract/gate.ts#ExemptionTable` or `#ExemptionRow`, wherever that value is declared.

That is a real, permanent, non-negotiable property with no relocation escape: the 2026-09-11/12
`3420a81e9`/`d9d1e3524` move becomes a finding rather than a discharge, and any FUTURE relocation of a
`contract/gate.ts`-typed table is caught the day it lands.

**What it does NOT enforce, stated as a DECLARED LIMIT in the module header** (§4.1's fourth outcome; the
bar is naming the construction attempted, which §R1.2 does):

> ARM D is a TYPE-IDENTITY arm. A gate that declares its own row interface locally and keeps the same
> per-subject table is INVISIBLE to it — the live example is
> `lib/injected-op-caller-param.ts#CallerFreeOpRow`, retyped rather than relocated. Distinguishing such a
> table from a legitimate declared vocabulary requires linking a membership test to the absence of a
> report, which is control flow, and no arm of this policy attempts it.

**Where the residual class IS held — a real tier, not a shrug.** §5b PRISTINE item 7 already carries it
verbatim: *"Nothing forbidden survives behind the contract — no private reader, walk, cache, exemption
table, scope predicate or filesystem read, and none smuggled into a `lib/` helper that only this module
calls. A private reader wearing a shared reader's clothes is the same rot with a better address."* §5b also
says in terms that measuring it is a READING task audited by `verifier`-class lanes at family granularity
with a per-module verdict line. **So the assignment exists; what is missing is the question and the
denominator, and this leg supplies both.**

**BACKSLIDE DETECTION — three concrete receipts the train owes, none of them intent inference:**

1. **ARM D itself** is the detector for the type-identity half, permanently, with a `mustFlag` fixture.
2. **A committed CENSUS, not a verdict.** Land `cb-adj-armd-enumerate.mjs`'s funnel as a pin under
   `tests/tooling/verify/gates/` asserting the CURRENT partition —
   `variableDecls 262 · withTypeNode 38 · typeReference 27 · tableNamed 6 → 0 after the train`. It reds when
   the *typed* population moves, which is the cheap half, and its `why` says explicitly that the 224
   untyped doors are unmeasured. A census that nobody reads is nothing, so this one is a TEST.
   **Its honest limit: it cannot see a retype, because a retype has a type.** Say so in the pin.
3. **The §5b item-7 question, written down so the audit is repeatable:** *"does this module consult a
   module-level per-subject collection to SKIP a report, and if so is the collection a two-sided declared
   vocabulary (unrowed subject RED) or a one-sided allowance (unrowed subject SILENT)?"* **That predicate
   is the honest discriminator** — it is the same test §5 C3 used to separate `NON_PORTABLE_CANON` from a
   grant, it needs no intent inference, and a human can answer it per module in seconds. Add it to the
   §5b.7 audit checklist with this leg's denominator (262 doors, 21 typed non-table, `CallerFreeOpRow`
   as the worked positive).

**So the honest closure statement for #2320, which is what the row should be closed on:** ARM D closes the
RELOCATION escape completely and permanently. It does not close the RETYPE escape; the retype escape is
closed for the CURRENT corpus by commit 3's migration, and for the future by §5b item 7's hand audit
carrying the written predicate above plus the census pin. **#2320 is closable; "no private per-subject
allowance can ever be reintroduced" is not a claim this design supports and must not appear in the closing
comment.**

## R2. Point 2 + addendum (a) — the NAMED SETS, measured

§4's "5 → 9" was count prose and it was wrong. Root's restatement (5 + 3 − 1 = 7) is closer and is also
wrong, for one reason: **the finding is per IMPORT DOOR, and each of the three typed tables has TWO
registering gate importers — the occurrence policy and its `-health` sibling.** Three tables produce six
doors.

**Set A — the five legacy refs the gate flags TODAY** (measured, `pnpm check:structure --check
policy-legacy-imports`, exit 1, `raw 5 = waived 0 + granted 0 + effective 5`, `0 tool error(s)`,
`0 withheld`, slot `agent-ad9a858d3d636eab0-536281-2026-09-13T07-17-34-499Z`; independently reproduced by
the §R0 enumerator, 5/5, same ids):

`depcruise-grant-liveness` · `domain-freshness-plane` · `eslint-grant-liveness` ·
`lifecycle-portability` · `runner-config-path-liveness` — every one at `"../contract/gate.ts"`.

**Set B — the three RELOCATED tables that retain the forbidden type**, with their gate importers:

| table | gate importers (both FINAL) |
| - | - |
| `lib/raw-spacing-tier.ts:22` `SANCTIONED_HOMES: ExemptionTable` | `no-raw-spacing-in-features:34` · `spacing-tier-home-health:32` |
| `lib/raw-typography-tier.ts:21` `SANCTIONED_HOMES: ExemptionTable` | `no-raw-typography-in-features:51` · `typography-tier-home-health:26` |
| `lib/contract-derives-not-respells.ts:32` `ALLOWLIST: ExemptionTable` | `contract-derives-not-respells:54` · `contract-derives-not-respells-health:29` |

**Set C — the one RETYPED table, EXCLUDED from any type-shape arm.**
`lib/injected-op-caller-param.ts:37` `CALLER_FREE_OP_ROWS: readonly CallerFreeOpRow[]`, imported by
`injected-op-caller-param-health:22` and reached by `injected-op-caller-param:25`. It appears in NEITHER
`pnpm ast refs ExemptionTable` nor `refs ExemptionRow`, and the §R0 enumerator does not flag it.
**ARM D will never see it; only commit 3's migration removes it.**

**Set D — ARM D's predicted finding set = Set B expanded to doors (measured, §R0):**

`contract-derives-not-respells` · `contract-derives-not-respells-health` · `no-raw-spacing-in-features` ·
`no-raw-typography-in-features` · `spacing-tier-home-health` · `typography-tier-home-health` — **6 modules,
6 doors.**

**THE EXPECTED POST-COMMIT-1 FINDING SET — the union, named:**

| after commit 1 | modules | why |
| - | -: | - |
| ARM A survivors | **4** — `depcruise-grant-liveness` · `domain-freshness-plane` · `eslint-grant-liveness` · `lifecycle-portability` | `runner-config-path-liveness` loses its whole import line (`ExemptionTable, Finding` on one declaration = one finding), so **−1**. `depcruise` keeps its finding: commit 1 deletes only its EMPTY `EXEMPT`, while `RATIFIED` and `Finding` stay on the same `:30` declaration |
| ARM D | **6** — Set D | 3 tables × 2 registering importers |
| **TOTAL** | **10 findings across 10 distinct modules** | no module appears in both arms |

**`5 − 1 + 6 = 10`, and every one of the ten is named.** The commit message states this set and reconciles
against the run; a lane that lands ARM D and reports a different set has either a broken arm or a stale
tree, and either way the set — not the count — is what says which.

**End state:** ARM D → 0 requires commit 3 (the three tables gone); ARM A → 0 requires commit 2
(`depcruise`, `eslint`) AND the row-type re-home (`domain-freshness-plane`, `lifecycle-portability`). No
single commit reaches 0, and no commit should claim to.

## R3. Point 3 + addendum (b) — `CALLER_FREE_OP_ROWS`, all seven rows read

§3 admitted reading four rows while §3's table implied the set. **The whole array is
`lib/injected-op-caller-param.ts:37-85`: SEVEN rows.** Read in full this leg.

**Liveness, MEASURED, not assumed:** `pnpm check:structure --check injected-op-caller-param-health` on
`fb2deeb98` → **exit 0 · `raw 0 = waived 0 + granted 0 + effective 0` · 0 alarm(s) · 0 tool error(s) ·
0 withheld · population 1596 source.** That gate's stated arms are (i) a row naming an op no contract
declares is RED and (ii) an empty entity-id vocabulary is a blindness refusal. Zero findings with zero
withholding therefore certifies **all seven rows name an op a live contract declares**, and the run is not
vacuous (the blindness arm did not fire).

| # | `op` | the permission it encodes | disposition |
| -: | - | - | - |
| 1 | `ReapAssetsOp` | authority is STRUCTURAL not the caller's — `reapIfOrphan` purges only when the asset-ref registry holds no reference; un-principal by design (D20) | **GRANT.** subject `ReapAssetsOp`, operation `caller-free-op`. `endsWhen` = the row's own: the reap stops consulting the reference registry first |
| 2 | `ListCharacterSpriteAssetsOp` | expressions-design/01 §8 — **OPTIONAL and currently UNWIRED** (no compose root supplies it); a read of assetIds the caller already proved it owns | **GRANT, with the wiring condition carried verbatim.** It is DECLARED (the health gate is green), so it is not a deletion — §3's "check before granting; an op no contract declares is a DELETION" resolves to GRANT here, measured. `endsWhen` = the expressions leaf lands and the wiring must carry the caller |
| 3 | `ResolveAssetHashOp` | un-principal indexer/assembly read (D20) — returns a CAS hash, assetId from already-authorized canon | **GRANT.** `endsWhen` = it ever returns owner-identifying fields |
| 4 | `LoadAssetBytesOp` | D20 un-principal blob read for databank INGEST, after the enqueue authority check | **GRANT.** `endsWhen` = ingest ever runs on caller-supplied ids |
| 5 | `LoadAssetBytes` | the embeddings twin of #4 — the indexer sweeps ids IT enumerated (D20) | **GRANT.** `endsWhen` = the indexer starts taking ids from a request |
| 6 | `LoadAssetMime` | embeddings mime probe over indexer-enumerated ids; returns a mime string, no row data | **GRANT.** `endsWhen` = with `LoadAssetBytes` (a row whose end condition is another row's — keep the cross-reference in the `why`, it is real) |
| 7 | `LoadCardText` | embeddings/admin card-text read over ids from `listEmbeddableCharacterIds` — D20, bulk corpus sweep | **GRANT.** `endsWhen` = a request-supplied characterId ever reaches it |

**Seven grant rows, no deletions, no unread rows.** Two authoring notes the lane owes: the reader
`callerFreeOps()` (`:88`) builds a `Map` so *both* policies key on one object — the migration must preserve
that single-answer property by having both read the grant set through one helper, not two lookups; and
rows 5/6's paired end condition means a stale sweep will surface them together, which is correct and should
be said in the `why` rather than discovered.

## R4. Addendum (c) — the legacy helper consumers, and what happens to their signatures

Root is right that §2/§5 asserted these helpers must be preserved without saying what preservation MEANS
when the type moves or retires. Full caller census, measured this leg.

### `lib/grant-liveness.ts`

`ExemptionTable<GrantExemption>` appears in **parameter positions only**: `LivenessInput.exempt` (`:78`) and
`PatternLivenessInput.ratified` (`:208`). No table is declared here.

| caller | passes today | after the train |
| - | - | - |
| `biome-grant-liveness:133` | `ratified: {}` | unchanged — already migrated |
| `depcruise-grant-liveness:277` (+`livenessFindings`) | `EXEMPT` (empty) and `RATIFIED` (3 rows) | `{}` after commit 2 |
| `eslint-grant-liveness` | reads `GrantExemption` as a TYPE only (`:13`); its `RATIFIED` never reaches this reader | type import only |
| `runner-config-path-liveness:283` | `exempt: EXEMPT` (empty) | field dropped at the call after commit 1 |
| `tsconfig-entry-liveness:55`, `no-blanket-suppression:50` | import functions only, no table | unchanged |

**Prescription — and it is a fork the lane must NOT decide silently.** After commit 2 every caller passes
`{}` or omits the field, so `exempt`/`ratified` and the `exemptionArms` half of `livenessFindings` become
dead parameters. Two arms: **(i) DELETE them in the same commit that migrates the last caller** — no
half-migration, and the retired two-sided behaviour is stated as a §4.6 delta (the central
`stale-reviewed-grant` alarm is the successor for the STALE half; the **`cite` half has no successor**,
which is #2147's standing ruling and must be restated per row); or **(ii) KEEP them** for a future
non-migrating caller, in which case the type must re-home (below). **(i) is the arm consistent with the
constitution's ban on leaving the old structure beside the new; I recommend it and flag that it is a
deletion of live shared-reader behaviour, so it is root's call, not the lane's.**

**When the type moves or retires** (arm ii, or the cutover): the parameter type re-points to a
`contract/`-homed declaration — `contract/grant-liveness.ts` declaring `GrantExemption` **and** a
`GrantExemptionTable = Readonly<Record<string, GrantExemption>>`. Note `GrantExemption` (`:45`) is itself a
pure type contract sitting in `lib/`, which addendum (d) forbids; commit 2 touches these signatures anyway,
so the re-home rides along at near-zero marginal cost. **The signatures never lose their parameters to a
type retirement — they re-point.**

### `lib/sanctioned-home.ts`

`ExemptionTable` is a parameter on three exported functions (`:18`, `:36`, `:68`). Full caller set,
measured:

| helper | callers | after the train |
| - | - | - |
| `sanctionedHome(homes: ExemptionTable, rel)` | `no-raw-spacing-in-features:76` (FINAL) · `no-raw-typography-in-features:93` (FINAL) · `no-pointer-variants-in-features:101` (**LEGACY**) · `no-raw-z-index:85` (**LEGACY**) · `ui-skin-fragment-purity:76` (**LEGACY**) | **SIGNATURE PRESERVED VERBATIM.** The two FINAL callers stop calling it (they report an aggregate instead of skipping); the three LEGACY callers still pass their own in-module tables, so the parameter type stays `ExemptionTable` until the last of them converts |
| `unresolvedSanctionedHomeKeys(...)` | `spacing-tier-home-health:58` · `typography-tier-home-health:52` — **both FINAL, and nobody else** | **DELETABLE** in commit 3, together with the two `-health` modules it exists for. `coveredFiles` has no caller outside this module and goes with it |
| `homeFiles` / `reportUnresolvedHomes` | `no-pointer-variants-in-features:113` · `no-raw-z-index:100` · `ui-skin-fragment-purity:95` — all three **LEGACY** | **UNTOUCHED.** §4's hazard stands: `tier-home-health-family.int.test.ts:200-206` pins that this module *"changed only ADDITIVELY since BASE"*, so a deletion reds it. Deleting `unresolvedSanctionedHomeKeys`/`coveredFiles` is itself non-additive and reds that pin — **budget for updating it, and say in the commit that the legacy pair survives on purpose** |

**So the answer to (c) in one line: `sanctionedHome` keeps `ExemptionTable` and keeps its three legacy
consumers; `unresolvedSanctionedHomeKeys` + `coveredFiles` retire with the two `-health` siblings; the
`ExemptionTable` reference in this file is the LAST thing to go, at the cutover, and it re-points to a
`contract/`-homed table alias rather than losing its parameter.**

## R5. Point 4 + addendum (d) — type home is `contract/`, and the corrected lane floor

**§3 said the row shape for `domain-freshness-plane` and `lifecycle-portability` could go in
`tooling/src/verify/contract/` "(or the family's `lib/`)". The parenthetical is WITHDRAWN.** A pure type
contract lives in `contract/`, never `lib/`. The precedent already on the tree is
`contract/tenancy-scope.ts#ScopingRow`, whose header states the semantics too. This applies to every type
this train re-homes, including `GrantExemption` (§R4).

**The lane floor is corrected: no whole `pnpm check:policy-conformance` from a lane.** §4 named it in all
three commits; that was wrong. The lane runs SCOPED work and root schedules the barrier:

| tier | who | what |
| - | - | - |
| **lane, per commit** | the implementing lane | the named family tests via `pnpm test:scoped <paths>` · `pnpm check:structure --check <policy>` for each touched policy id · `pnpm exec biome check <touched files> --diagnostic-level=error` · `pnpm exec eslint <touched files>` · `pnpm typecheck --config tooling/tsconfig.json` (add root `tsconfig.json` if a contract type moves) |
| **root, at the barrier** | orchestrator | whole `pnpm check:policy-conformance` · serialized `pnpm check:structure` before/after · `pnpm check:structure-delta` · the four planting suites |

## R6. Point 5 + addendum (f) — no invented taxonomy in the re-homed row types

§3's cell said `NonPortableRow` *"gains `classification` + `why`"*, which reads as an invention. **It gains
nothing.** The shape exists at `lifecycle-portability.ts:82` and MOVES VERBATIM:

- `NonPortableClass` — the five arms `RULED-OUT` · `DERIVED` · `RUNTIME` · `DEFERRED` · `ACCEPTED-LOSSY`,
  each carrying a domain ruling in its JSDoc (`:69-80`), move byte-identical. **No arm is added, renamed,
  merged or reinterpreted, and no arm is mapped onto a grant vocabulary.**
- `NonPortableRow` becomes `{ classification: NonPortableClass; why: string }` declared in `contract/` —
  the `extends ExemptionRow` is replaced by the inlined `why`, which is the ONLY field `ExemptionRow`
  contributes (`contract/gate.ts:28-31`). **A pure de-aliasing, not a redesign.**
- Same discipline for `domain-freshness-plane`: `RoomReach`'s three arms (`bridge` / `seated-exempt` /
  `none`) and `FreshnessRow`'s `{ plane, roomReach, why }` move unchanged; `UNSEATABLE_SCHEMA` stays a
  `Readonly<Record<string, { why: string }>>` against the `contract/`-homed row.

**These are exclusion CLASSIFICATIONS with real domain semantics, migrated as data, never mechanically
converted into grants** — §5 C3's ruling, restated here because it is the thing most likely to be lost in
implementation.

## R7. Addendum (e) — two UNRULED owner forks. Arms and prices. NO recommendation.

Both are §12.5's *"no count ratchet"* family; both are OPEN and need an owner word. **I am not choosing,
and §4/§5's earlier "fork for the root" wording that leaned toward retirement is withdrawn.**

### #2324 — `depcruise-grant-liveness.ts:61` `BACKREF_BUDGET = 16`

Sixteen `$1`-backreference dep-cruiser rows whose member set the tool binds at cruise time, so no static
reader can test them. Two-sided today (`PATTERN_MESSAGES.budgetMoved:118`: growth AND uncommitted shrink),
armed at `:277` behind the `:319` real-tree anchor. One consumer of `irreducibleBudgetFindings` corpus-wide.

| arm | price | what is lost / gained |
| - | - | - |
| **A — enumerate as 16 reviewed grants**, keyed on the rule pair | 16 rows × (`why` + `endsWhen`) authored from the config; the subject must be a stable identity for a rule PAIR, which the config may not give without a naming convention | GAINED: central staleness, 1:1, no count. LOST: the *growth* signal — 17 rules is 17 grants, each individually reviewed, and nothing reds on cardinality |
| **B — delete the budget arm**, record what stops being held | one deletion + a header paragraph | LOST: the only thing preventing silent growth of an unreviewable population. This is the arm §12.5's letter implies and it is a real reduction in coverage |
| **C — keep it, and RULE the exception** | zero code; a §12.5 carve-out row naming this as the one sanctioned cardinality guard | LOST: §12.5's absoluteness. GAINED: honesty — the alternative arms both weaken a live guard |

### #2230 — `lib/css-family-census.ts:82` `EXPECTED_DIRECT_THEME_DECLARATIONS = 203`

A hand-copied literal compared at `lib/css-family-policy.ts:478` against a parsed count, presented as
generated-output parity. The ledger row (`refutation-ledger-2026-09-12.md:701`) measured it **DERIVABLE**:
`tokens.build.ts#renderThemeCss` emits one line per `placement === "theme"` entry, measured at 203, and the
committed `theme.css` is byte-identical to the generator's output. The module's own header (`:76-81`) says
its survival *"is not an endorsement"* and that the question is escalated. Also consumed by
`lib/css-family-proof-fixtures.ts:40-41` to build the parity/one-short proof fixtures.

| arm | price | what is lost / gained |
| - | - | - |
| **A — DERIVE it** from the generator's input | the policy must read the token source through a declared resource; `token-contract` is the shipped kind | GAINED: the literal cannot go stale. LOST: the fixtures at `:40-41` currently derive FROM the literal, so a derived value makes the proof self-referential and needs a planted control instead |
| **B — keep the literal, rename the claim** | header-only | GAINED: honesty about what it is. LOST: nothing new — but it stays the shape the same day's ruling retired three of under a different word |
| **C — delete the comparison** | one deletion | LOST: the only check that the committed `theme.css` matches the generator's cardinality |

**Both belong in the same owner batch** — they are one question (may a final policy hold a cardinality
guard, and if so under what name) asked twice, and answering them separately is how the corpus ends up with
two answers. Presented, not decided.

## R8. #2302 — the real-config value/index proof, folded into the train

`refutation-ledger-2026-09-12.md:916` (w12a R4, board **#2302**, **OPEN**): the scoped floor does not pin
every `eslint-grant-liveness` RATIFIED positional key to the value at that index in the REAL
`eslint.config.js`; inserting an ignore above index 5 re-points the table while the fixture proofs and the
runnability arm stay green. The wave's planted index-shift receipt is the proof spec.

**This is the same defect §3 derived independently from the module's own `:56-60` comment, and the #2147
train OWNS it the moment grants become value-keyed.** The interaction, stated precisely:

- Value-keying the grant subject (`**/node_modules/**` rather than `config[0].ignores[0]`) **DISSOLVES
  \#2302's defect** — there is no index left to shift, and `sameValue` becomes unnecessary.
- **A dissolved exception must land as an ASSERTION, not an absence** (§4's ruling: *"when a repair RETIRES
  an exception, land it as an ASSERTION, not an absence … the `mustPass` that admitted the exception
  becomes a `mustFlag` on the SAME fixture shape"*). So commit 2 owes a pin that **an ignore inserted above
  an existing index does NOT change which grant is consumed** — the planted index-shift from w12a, re-run
  against the value-keyed table, asserting the same grant id is consumed before and after.
- **Until that pin lands, #2302 stays OPEN**, and it must not be closed as "no longer applicable". It is
  closed by the assertion, and the assertion is commit 2's.

## R9. THE REVISED TRAIN — complete, and it replaces §4

Three commits. Scope, files, arms, floor and barrier per commit. **§4 above is superseded in full.**

### Commit 1 — ARM D + the two zero-cost deletions

**Files.** `gates/policy-legacy-imports.ts` (ARM D: a fifth `DoorVerdict` kind, the named-binding
declaration read inside the already-resolved target, its message, its rows, the DECLARED LIMIT paragraph
of §R1.3, and the narrowed `FIX` — its ARM B clause currently authorizes the very move ARM D forbids) ·
`gates/runner-config-path-liveness.ts` (delete `EXEMPT` `:106` and its three read sites `:283`, `:293`,
`:382`; drop the `ExemptionTable, Finding` import; the `:382` `cites` array collapses, so the
`authored-path` demand loses one input — verify the demand still names ≥1 selector or the resource refuses)
· `gates/depcruise-grant-liveness.ts` (delete the EMPTY `EXEMPT` `:52` ONLY) ·
`Core-Enforcement-Active-Gates.md` (the `policy-legacy-imports` row gains ARM D's sentence; **no count-line
edit — no module is added or removed**).

**Proof obligations.**

1. **RED FIRST.** Before ARM D exists, run the six Set-D doors as scratch fixtures against the UNMODIFIED
   module and show each returns **0**. That receipt is what proves the escape was real.
2. Rows: a `mustFlag` for the one-hop relocated table; a `mustFlag` for a TWO-hop shim chain
   (`gate → lib/shim.ts → lib/table.ts`) — **`getExportedDeclarations()` follows re-exports, but I did not
   test it (§R11), so this row is the lane's to prove**; a `mustPass` for a function-exporting `lib/` reader
   whose PARAMETER is table-typed (the `grant-liveness.ts` shape — **note this acquittal is currently
   STRUCTURAL, not a type decision: the enumerator never reaches the type test because the export is a
   function, so the row must be built deliberately**); a `mustPass` for the `CallerFreeOpRow` retype whose
   `why` states the declared limit; a `mustPass` for the already-migrated `biome-grant-liveness` shape.
3. **The census pin of §R1.3(2)** under `tests/tooling/verify/gates/`, asserting the funnel partition with
   its stated blind spot.
4. **Floor (lane):** `pnpm test:scoped` on the `policy-soundness` family test (re-derive its filename at
   claim time — I did not verify it) · `pnpm check:structure --check policy-legacy-imports` ·
   `pnpm check:structure --check runner-config-path-liveness` · biome + eslint on touched files ·
   `pnpm typecheck --config tooling/tsconfig.json`.
5. **Barrier (root):** the expected finding set is **§R2's ten named modules**. The commit message states
   the set; root reconciles against it.

### Commit 2 — the two config registries, value-keyed

**Files.** `gates/eslint-grant-liveness.ts` (7 RATIFIED rows out; `hard` → `reviewed-grant`) ·
`gates/depcruise-grant-liveness.ts` (3 RATIFIED rows out; `hard` → `reviewed-grant`; **probable SPLIT** of
`MSG_NO_ROWS` + the budget arm into a `hard` `-health` sibling, per the biome precedent) ·
`lib/reviewed-grants.ts` (+10 rows) · `lib/grant-liveness.ts` (the §R4 fork, once root rules it) ·
`tests/tooling/verify/gates/grant-liveness-family.test.ts` · `Core-Enforcement-Active-Gates.md` (count line
+1 **only if** the split lands).

**Proof obligations.**

1. **`grant-liveness-family.test.ts:74-81` reds by construction** — a `toEqual` over the exact
   `[id, family, authority]` triples, which its own comment calls the tripwire on both halves. Update in
   the same commit.
2. **Subjects are VALUE-KEYED, never position-keyed** (§R8) — and the #2302 index-shift assertion lands
   with them.
3. §4.3 grant identity, four pins per policy (copy `home-client-family.test.ts:259-305`): consumed exactly
   once · wrong `operation` stays effective · renamed subject stales or withholds · `authorityAlarms` empty.
   A `runPass` module row cannot prove consumption (`reviewedGrants: []`), so these live in the family test.
4. **The `cite` dead-arm loss is stated PER ROW, ten times** (#2147's standing ruling;
   `biome-grant-liveness:24-36` is the shape, including its own retraction of a wrong successor claim).
5. **#2324 is NOT decided by this lane** — the budget moves to the `-health` sibling unchanged, or stays,
   pending root's word. **A lane that deletes it has taken an owner decision.**
6. **A SPLIT reds `enforcement-registry-parity.int.test.ts` and the `(309 registered gates)` line at
   `Core-Enforcement-Active-Gates.md:387`** — no id-grep finds that suite (§8.8).
7. **Floor (lane):** `grant-liveness-family.test.ts` · `eslint-grant-liveness.int.test.ts` ·
   `biome-grant-liveness.int.test.ts` · `tsconfig-entry-liveness.int.test.ts` ·
   `tests/tooling/verify/ops/eslint.int.test.ts` (its `:227` names this exact RATIFIED row as the #2213
   coupled site) · `enforcement-registry-parity.int.test.ts` if split · `--check` per touched policy ·
   biome/eslint/typecheck as above. **Barrier (root):** whole conformance + structure delta.

### Commit 3 — the three relocated tables, the retyped table, and the two `-health` deletions

**Files.** `lib/raw-spacing-tier.ts` · `lib/raw-typography-tier.ts` · `lib/contract-derives-not-respells.ts`
· `lib/injected-op-caller-param.ts` · the four occurrence gates (`ordinary` → `reviewed-grant`; skip →
one aggregate finding per subject) · their three `-health` siblings · **DELETE**
`gates/spacing-tier-home-health.ts` + `gates/typography-tier-home-health.ts` · `lib/sanctioned-home.ts`
(remove `unresolvedSanctionedHomeKeys` + `coveredFiles`; **keep `sanctionedHome`, `homeFiles`,
`reportUnresolvedHomes` and the `ExemptionTable` parameter** — §R4) · new `contract/` row-type homes for
`domain-freshness-plane` and `lifecycle-portability` (§R6) · `lib/reviewed-grants.ts` (+2+2+7 rows) ·
`Core-Enforcement-Active-Gates.md` (count line −2, table rows removed).

**Proof obligations.**

1. **The aggregate finding is the substance.** `no-raw-spacing-in-features:76` currently SKIPS; it must
   REPORT one finding per sanctioned home with `subject`/`operation`, or the grant is consumed zero times
   on day one and the central alarm reds immediately. Pin the cardinality as one-per-home, not per-site —
   that is what makes the grant 1:1 (§12.5). `biome-grant-liveness#reportCandidates` is the code to copy.
2. **Seven `caller-free-op` grants per §R3, all seven rows, no deletions** — and both policies must read
   them through ONE helper, preserving `callerFreeOps()`'s single-answer property.
3. **`injected-op-caller-param-split.test.ts` breaks THREE ways:** `:43` imports `CALLER_FREE_OP_ROWS` by
   symbol, `:54` builds `CALLER_FREE_NAMES` from the live rows, `:68` regexes the message text
   (`/CALLER_FREE_OPS names "…"/u`). Retarget all three.
4. **Each occurrence gate's §4.2 identity arm is REPLACED by a §4.3 grant arm**, and the `fix` strings
   promising the `@orb-waive` spelling are rewritten — otherwise the policy instructs its user to use a
   door it no longer has (§5b item 3). Zero live product-tree markers are orphaned (measured, §1).
5. **Deleting `unresolvedSanctionedHomeKeys`/`coveredFiles` is NON-ADDITIVE and reds
   `tier-home-health-family.int.test.ts:200-206`.** Budget for it. **The legacy pair
   (`homeFiles`/`reportUnresolvedHomes`) survives on purpose — say so in the commit**, with its three
   LEGACY consumers named.
6. **§4.6 differential, all three axes named separately** (findings · populations · tool errors), plus the
   deleted-`-health` delta: the central `stale-reviewed-grant` alarm's red condition is STRICTLY WIDER than
   the rename tripwire's (it also fires when a home still exists but stops spelling the utility — which is
   the end condition both rows' `why` already declares). Name which §4.6 vacuity shape the record is.
7. **Floor (lane):** `tier-home-health-family.int.test.ts` · `injected-op-caller-param-split.test.ts` ·
   `contract-shape-wave-1.test.ts` · `home-server-family.test.ts` · `enforcement-registry-parity.int.test.ts`
   · `--check policy-legacy-imports` expecting **0** and `--check` per touched policy · biome/eslint ·
   `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` (a contract type moves).
   **Barrier (root):** whole conformance, structure before/after, structure-delta.
8. **TWO receipts, not one.** `--check policy-legacy-imports` → 0 **and** the three tables gone. Without
   commit 1 the first receipt is satisfiable by relocation and proves nothing — which is the whole of
   \#2320.

## R10. What this leg CORRECTS in §1–§5 above

| where | claim | correction |
| - | - | - |
| §2.3, §4 commit 1 | retiring `contract/gate.ts` means "the false clean cannot exist" | **WITHDRAWN.** It retires the TYPE, not the CLASS; a local retype survives it (§R1.1) |
| §4 commit 1 | "5 → 9" | **WRONG.** The measured set is **10 named modules** (§R2); the finding is per DOOR and each table has two gate importers |
| §4 commit 1 | "`injected-op-caller-param-health` will NOT appear" | correct, and now MEASURED rather than reasoned (§R0) |
| §3 (two rows) | row shape may go in `contract/` "or the family's `lib/`" | **`contract/` ONLY** (§R5) |
| §3 | `NonPortableRow` "gains `classification` + `why`" | **gains nothing** — the shape exists and moves verbatim (§R6) |
| §3 | `ListCharacterSpriteAssetsOp` "check before granting … may be a DELETION" | **resolved: GRANT.** The health gate is green, so all seven ops are contract-declared (§R3) |
| §3, §4, §5 | `CALLER_FREE_OP_ROWS` "≥4 rows … read the full list" | **SEVEN rows, all read** (§R3) |
| §4 (all three commits) | lane floor includes whole `pnpm check:policy-conformance` | **removed** — scoped for the lane, barrier for root (§R5) |
| §4 commit 2, ledger L2 | "the two honest arms are … or delete the budget arm" | **three arms, priced, undecided** (§R7); the earlier phrasing leaned toward retirement without an owner word |
| §2.2 controls table | the `grant-liveness.ts` acquittal presented as a type decision | it is currently STRUCTURAL (function export, never reaches the type test) — the row must be built deliberately (§R9 commit 1) |
| §5 C2 | "their `ExemptionTable` reference retires with the type at cutover" | true but incomplete — §R4 states what happens to each signature, and `sanctionedHome` keeps its parameter for three legacy consumers |

## R11. What this leg did NOT measure

- **ARM D does not exist.** §R2's ten is my prototype's prediction, credentialed by an exact ARM-A
  reproduction (5/5, same ids as the production dispatcher) and nothing stronger. A real ARM D could differ
  wherever its binding resolution differs from mine.
- **I did not test the two-hop shim chain.** `getExportedDeclarations()` is documented to follow
  re-exports, but no fixture in this leg exercised it, so §R9 commit 1 carries it as the lane's row to
  prove. If it does NOT follow chains, ARM D needs the visited-set walk `launderedThrough` already has.
- **My enumerator's `finals` test is `imports defineGate from contract/policy.ts`, not
  `isCanonicalDefineGate`.** It found 267 of 309; read-first §2 puts the corpus at 261 final on 2026-09-13
  by `pnpm check:policy-conformance`, which is the roster. **The 6-module gap is unexplained** and is a
  reason to trust the production run over my enumerator on membership questions — though it cannot change
  Set D, whose six members I verified individually by reading their imports.
- **No cp-backed source probe was taken**, so the 10 is unmeasured through the production dispatcher.
- **The 224 untyped variable doors are unexamined.** I counted them; I did not read them. Whether any is a
  private per-subject allowance is exactly the §5b item-7 question §R1.3 hands to the audit, with this
  number as its denominator.
- **The 21 acquitted typed doors were not adjudicated.** I read one (`EXTERNAL_ID_CLAIM_CALLERS`) far
  enough to see it is a two-element `ReadonlySet` of capability names. Calling them "mostly population
  facts" is my inference from their names and shapes, not a per-module read.
- **I ran no test.** Every family-test breakage claim is read from assertion text. Both `--check` runs are
  real (`policy-legacy-imports` exit 1 / 5 findings; `injected-op-caller-param-health` exit 0 / 0 findings,
  population 1596, 0 tool errors, 0 withheld).
- **#2324 and #2230 are presented, not decided**, and I did not read `tokens.build.ts#renderThemeCss`
  myself — #2230's derivability is the ledger's measurement (`:701`), quoted.
- **Board status fields unread**; every lifecycle statement remains a proposal for root.

---

# Revision 2 (security review) — 2026-09-13

Root's security review of the seven `CALLER_FREE_OP_ROWS` rights
(`/tmp/codex-caller-free-authority-review.md`, read in full) **accepts the seven rights as traced and
defensible and REJECTS the successor design I wrote for them.** This section is APPEND-ONLY and
**AUTHORITATIVE over §R9's commit-3 obligation 2 and over the closing sentence of §R3**, which are the two
places the rejected design lives. Commits 2 and 3 remain **UNAUTHORIZED**; this is design only. Read-only
again: no tracked file was modified, no source probe taken.

## R2.0 The blocker — conceded in full, and independently re-verified

The review's citation is my report's **lines 877-878** (§R9, commit 3, obligation 2):
*"Seven `caller-free-op` grants per §R3, all seven rows, no deletions — and both policies must read them
through ONE helper, preserving `callerFreeOps()`'s single-answer property."* **That design is withdrawn.**

I re-read every line the review cites rather than relaying it, and every one holds on `fb2deeb98`:

| claim | my own receipt |
| - | - |
| the occurrence policy consults its permission table before reporting | `injected-op-caller-param.ts:121-123` — `if (callerFreeOps().has(name)) { continue; }`, sitting directly above the report at `:125` |
| the health sibling iterates the table | `injected-op-caller-param-health.ts:116-120` — `for (const { op } of CALLER_FREE_OP_ROWS) { if (!seenOps.has(op)) … STALE(op) }` |
| reading the grant table from a gate is already mechanically forbidden | `policy-legacy-imports.ts:89` carries `/tooling/src/verify/lib/reviewed-grants.ts` in `FORBIDDEN_IMPORT_HOMES`, with its own `mustFlag` row whose `why` reads *"a module that reads its own grants decides its own exemptions"*, and the #2201 shim chase closes the one-hop route |
| the failure scenario's arithmetic | correct. With the skip intact, the seven aliases never reach `ctx.report.node`, so a `reviewed-grant` flip yields **raw 0** for them → seven grants consumed zero → **seven `stale-reviewed-grant` alarms on day one**, and the migration does not preserve today's clean effective verdict |

**This was my error and it was avoidable.** §R1.3 of this same report quotes §12.5's *"gate modules receive
neither grant tables nor marker parsers"* as the property ARM D exists to defend, and §5 C2 lists
`lib/reviewed-grants.ts` as an ARM A forbidden home. **I designed a successor that violates the exact
property the arm I was designing enforces, one section later.** The general lesson, which belongs in the
train's brief: *a migration's successor design is subject to the same gate as its subject — run the
proposed shape past the arm before writing it down.*

## R2.1 The corrected successor — CENTRAL-ONLY, exactly as ruled

1. **The occurrence detector is GRANT-BLIND.** `injected-op-caller-param` becomes
   `authority: "reviewed-grant"` / `severity: "error"` and reports EVERY Promise-returning contract alias
   that takes a derived entity id and lacks a caller/scope parameter — **without consulting any grant,
   coordinator, or grant-derived name set.** It may not import `REVIEWED_GRANTS`, `reviewedGrantsFor`,
   `lib/gate-authority.ts`, or any helper that derives an allowlist from them, directly or through a shim.
2. **It aggregates ONCE per stable op name.** One raw finding per `(subject: <op name>,
   operation: "caller-free-op")`, with **every** matching alias-node coordinate retained in the message.
   Never one candidate per alias node (that would make a valid row over-broad and license nothing), and
   never a skip for an alias whose name happens to be granted.
3. **Exactly SEVEN rows in `lib/reviewed-grants.ts`**, ids `injected-op-caller-param:<kebab-op>`, one per
   right in §R2.2.
4. **The central coordinator is the SOLE consumer.** It alone matches the seven aggregate findings to the
   seven grants; §12.5's 1:1 rule is satisfied by the aggregation in (2), not by anything the gate does.
5. **The local permission machinery is DELETED** from `lib/injected-op-caller-param.ts`:
   `CALLER_FREE_OP_ROWS`, the `CallerFreeOpRow` interface, and `callerFreeOps()`. **`IDS_MODULE` and
   `deriveEntityIdTypes` STAY** — they are the neutral entity-id vocabulary reader, the only thing the two
   siblings may share, and they carry no permission.
6. **`-health` keeps its hard BLIND arm and loses its table-stale arm.** `injected-op-caller-param-health`
   stays `authority: "hard"` / `severity: "error"` for the derived-id BLIND condition ALONE
   (`:107-109` — an empty `TypeIdOf` vocabulary must red independently of grant reconciliation). The
   private per-row STALE arm (`:116-120`) is deleted; the central `stale-reviewed-grant` alarm is its
   successor and is strictly wider (it also fires on a renamed alias, a newly caller-scoped op, and an op
   that stops taking an entity id).

**Preserved unchanged, and the lane must be told so explicitly:** `population: ["@server", "@kit"]` ·
`analysis: "syntax"` · `execution: "entire-population"` · `severity: "error"`. **The only authority change
is `ordinary` → `reviewed-grant`.** No server-domain contract, caller, composition binding or
authorization predicate changes in this governance-only migration. The occurrence policy's `@orb-waive`
instructions are DELETED from its `fix` (`:59`) — a reviewed-grant policy has no inline waiver door — and
the `fix` instead routes a genuinely un-principal op to the central reviewed-grant process and an ordinary
one to carrying caller scope.

### R2.1a Four implementation facts the review did not state, measured this leg

- **THE CANDIDATE PREDICATE MUST NOT GAIN AN EXPORT TEST, or one of the seven silently stales on day one.**
  `candidateAliases`' predicate (`injected-op-caller-param.ts:94`) is
  `TypeAliasDeclaration && CONTRACT_RE.test(path) && isOpFunctionType(node)` — **no export check.** That is
  load-bearing: `ReapAssetsOp` is exported (`character/contract/service.ts:53`) and
  **`ListCharacterSpriteAssetsOp` is NOT** (`:67`, a bare `type`, surfaced only through the optional field
  at `:113`). A lane that "tidies" the predicate to exported aliases drops one of the seven, its grant is
  consumed zero times, and the run alarms. **State this as a preservation invariant with both receipts.**
- **The report call changes SHAPE, and that is a §4.6 category-6 ANCHOR MOVE.** Today it is
  `ctx.report.node(alias, { token: name, offset: … })` (`:125`) — per alias node, carrying **no `subject`
  and no `operation`**. Aggregation moves the anchor to one node per op (the first site) and puts the rest
  in the message. §4.6 says an anchor move owes a receipt that no positioned waiver orphans; here that is
  free, because §1 measured **zero live `@orb-waive injected-op-caller-param` markers** — but the receipt
  is owed and stated, not assumed.
- **Both `-health` proof rows compute their `expect.count` FROM the deleted binding.**
  `injected-op-caller-param-health.ts:132` is `expect: { count: CALLER_FREE_OP_ROWS.length }` (the STALE
  row — deleted with its arm) and `:142` is `expect: { count: CALLER_FREE_OP_ROWS.length + 1 }` (the BLIND
  row — **becomes `count: 1`**). Deleting the symbol without touching these is a tsc error, which is the
  good kind of breakage, but the BLIND row's count is a real edit and its `why` (which explains "rows+1")
  must be rewritten.
- **In the BLIND case the union is preserved but its CLASS changes, and a count reader will misread it.**
  Legacy blind run = 1 BLIND finding + 7 STALE **findings** (8). New blind run = 1 BLIND finding + 7
  `stale-reviewed-grant` **alarms**. Both block — `gate-authority.ts:404` is
  `blocking = errors + alarmErrors + (failOnWarnings ? warnings : 0)` — but anyone comparing FINDING counts
  sees 8 → 1 and reads coverage loss. The review's item 9 makes this point for the granted case; **this is
  its blind twin and the differential owes it separately.**

## R2.2 Per-right `endsWhen` — the review's, superseding §R3's

§R3's table took each `endsWhen` off the module's own `why` prose. **The review derived them from the
contract, the composition binding and the caller chain, and two of mine were wrong or thin.** The review's
are authoritative; §R3's are superseded.

| grant subject | required `endsWhen` (review), and the delta from §R3 |
| - | - |
| `ReapAssetsOp` | Ends if **either** the whole-registry preflight **or** the atomic delete-time reference predicate ceases to guard byte deletion. **§R3 was INSUFFICIENT** — it named only *"the reap stops consulting the reference registry first"*, which describes one belt; `asset-refs.ts:295-340`'s relation-bound `DELETE … id + ownerId + NOT(anyReference)` is the second, race-safety belt and must be named |
| `ListCharacterSpriteAssetsOp` | Ends when **any production composition root supplies `listCharacterSpriteAssets`**; that wiring must add caller/owner scope before or with the binding. **NOT executable by central grant liveness** — the grant stays consumed by the declaration alone, so the expressions-leaf change is an **auth-boundary review**, not a routine wire. §R3's "carried verbatim" survives; the non-executability is new and load-bearing |
| `ResolveAssetHashOp` | Ends if it returns owner-identifying fields or bytes, **or** any request-controlled asset id reaches it without an upstream ownership/membership gate. §R3 had only the first clause |
| `LoadAssetBytesOp` | Ends if ingest accepts a request-supplied asset id **or** a document id reaches the runner without the owning workload/owner check |
| `LoadAssetBytes` | Ends if either path accepts request-supplied ids without canon enumeration / event provenance, **or** bytes gain a user-facing egress |
| `LoadAssetMime` | Ends with `LoadAssetBytes`'s event-provenance condition, **or** if the return expands beyond non-identifying MIME metadata |
| `LoadCardText` | Ends if a request-supplied character id reaches the embeddings op without an upstream owner/admin gate, **or** the text is exposed outside the trusted derived-data path |

**And the review's methodological correction, which I owe:** *"The health policy's green result establishes
only that a declaration with each name still exists and takes a branded entity id. I did not use that as
permission justification."* §R3 leaned on my green `--check injected-op-caller-param-health` run as the
liveness receipt. **That run proves DECLARATION liveness and nothing about the rights** — the rights are
justified by the review's contract/wiring/caller trace, not by my run.

## R2.3 The 10-case proof matrix, folded into the train

Every one is a commit-3 obligation. Annotated where it couples to something measured in this report.

1. **All seven real grants, real identities** — a fixture declaring all seven op shapes yields 7 raw
   aggregate findings · 7 granted · 0 effective · 0 authority alarms · consumption count 1 per row.
2. **One-at-a-time absence** — omit each grant in turn; its op stays an effective error while the other six
   stay granted. **This is the row that proves no local allowlist skip survived**, and it is the direct
   falsifier of the rejected design.
3. **Wrong identity** — a wrong `subject` and a wrong `operation` each leave the real finding effective and
   stale the mismatched row after a complete run.
4. **End-condition liveness** — per granted op, separately: delete/rename the alias · add a valid caller
   parameter · remove its entity-id parameter. Each yields zero candidates and a central
   `stale-reviewed-grant` alarm. **The caller-added case is the important one: it proves a repaired op
   retires its grant.**
5. **Stable-subject cardinality** — the same op name at multiple alias nodes produces ONE aggregate finding
   listing all sites, consumed once. Prevents an accidental per-node conversion making every valid row
   over-broad. **This is the row §R2.1a's anchor-move note is about.**
6. **New ungranted op** — a new entity-id Promise op without scope is effective and blocking, and an
   `@orb-waive injected-op-caller-param(…)` marker **cannot** suppress it under reviewed-grant authority.
7. **Incomplete / fail-closed** — an unresolved, empty or incomplete owner run neither grants nor declares
   grant liveness; it withholds or tool-errors per the coordinator contract. A COMPLETE run is required
   before zero consumption may be called stale.
8. **BLIND parity** — an empty `TypeIdOf` derivation still produces the hard BLIND finding, and the seven
   grants also stale because no trigger can consume them, preserving the legacy union. **Plus §R2.1a's
   twin: assert the CLASS split (1 finding + 7 alarms), not a finding count, or the row passes while
   reading like coverage loss.**
9. **Intentional differential** — the authority-only raw delta: the seven live rows go from
   detector-skipped (`raw 0`) to detector-reported-then-centrally-granted (`raw 7`, `granted 7`), effective
   stays 0; populations and tool-error sets equal. Classify the old hard STALE arm as **replaced by the
   wider central alarm**; the hard BLIND arm is byte-equivalent in effect.
10. **Coupled test repair** — retarget all three `injected-op-caller-param-split.test.ts` dependencies
    (`:43` symbol import · `:54` live-name derivation · `:68` stale-message regex). **The rewritten
    differential must drive central grants, never reconstruct a private permission list** — the same
    error as the rejected design, one file over.

## R2.4 Real-tree receipts owed before authorization/landing

**The review's six:**

1. Seven and only seven declaration subjects resolve, each with ≥1 alias-node coordinate in the aggregate
   report.
2. The reviewed pass shows **7 raw = 7 granted + 0 effective**, no authority alarms, no tool/fact errors,
   no withholding.
3. `policy-legacy-imports` reports **zero for both siblings** — neither reaches the grant table or the
   coordinator, directly or through a shim.
4. A source census confirms **zero live `@orb-waive injected-op-caller-param` markers** before the
   authority flip.
5. A source census confirms `listCharacterSpriteAssets` **remains unwired in production**. If a wire
   appears before landing, **STOP** — its grant rationale has ended and the contract must carry
   caller/owner scope.
6. The differential separately compares effective findings, populations, tool errors and the classified
   health-arm replacement. **A green declaration-health run alone is not evidence for any of the seven
   permissions.**

**Two of the six I already MEASURED this session, so the lane inherits them as a baseline rather than a
task** (both must be re-taken at landing, on the landing tree):

- **(4) — MEASURED, zero.** `rg '@orb-waive injected-op-caller-param\('` over `packages tests tooling
  scripts` returns 2 matches, both inside the gate module itself (`:59` the `fix` string, `:210` the §4.2
  proof fixture). **Positive control in the same invocation: 1,713 `@orb-waive ` markers across 721
  files.** Zero live product-tree markers.
- **(5) — MEASURED, unwired, with a positive control.** `rg 'listCharacterSpriteAssets|ListCharacterSpriteAssetsOp'`
  over `packages/server/src` + `packages/contracts/src` returns exactly five hits: the type at
  `character/contract/service.ts:67`, the optional field at `:113`, two guarded call sites
  (`verbs/remove.ts:34`, `verbs/bulk-remove.ts:36`) and one comment (`remove.ts:11`). **No
  `entry/compose` assignment.** The control: the wired sibling `resolveAssetHash` DOES resolve at
  `entry/compose/chat.ts:1299`, so the census instrument sees a wire when one exists.

**And one receipt of my own the review's list does not cover, because it cannot:**

7. **The table's disappearance is proven by a SOURCE CENSUS, never by `policy-legacy-imports`.** Receipt (3)
   is necessary but not sufficient here: `injected-op-caller-param-health:22`'s import of
   `CALLER_FREE_OP_ROWS` is **ARM-D-invisible** (a locally-typed `CallerFreeOpRow`, §R2 Set C), so the gate
   reports zero for that sibling both before and after the migration. The second receipt is
   `rg 'CALLER_FREE_OP_ROWS|CallerFreeOpRow|callerFreeOps' tooling/src` returning nothing. **This is the
   \#2320 lesson applied to its own remedy: a gate's zero is a verdict only about what the gate can see.**

## R2.5 Security assumptions requiring human sign-off (relayed unmodified)

These are OWNER items, not lane items, and **commit 3 cannot land without them**:

- A CAS content hash remains classified as non-secret / non-owner-identifying. If hashes become fetch
  capabilities or owner-correlating identifiers, `ResolveAssetHashOp` cannot remain caller-free.
- Domain events and `caller: null` workload starts remain trusted in-process system triggers; no transport
  or plugin surface can inject an arbitrary `asset.created`, `character.updated`, or singular workload row.
- The `ListCharacterSpriteAssetsOp` grant is accepted **only for today's unwired state**; its prose
  `endsWhen` is not executable by central grant liveness, so the expressions-leaf change must be reviewed
  as an auth-boundary change.
- The asset reference registry and `deleteAssetRowIfUnreferenced` remain complete over all retaining
  relations. A new asset reference home must join those belts before it can rely on `ReapAssetsOp`.

## R2.6 Reconciliation — everything in §R that assumed the rejected design

| where | what it said | status |
| - | - | - |
| §R9 commit 3, obligation 2 (lines 877-878) | "both policies must read them through ONE helper, preserving `callerFreeOps()`'s single-answer property" | **DELETED.** Replaced by §R2.1 points 1–6 |
| §R3, closing note | "both policies must read them through one helper, preserving `callerFreeOps()`'s single-answer property" | **DELETED**, same reason. The single-answer property is preserved by there being ONE grant table and ONE coordinator, not by a shared gate helper |
| §R3, the seven-row table's `endsWhen` column | derived from the module's own `why` prose | **SUPERSEDED by §R2.2.** `ReapAssetsOp`'s was insufficient (one belt, not two); `ListCharacterSpriteAssetsOp`'s missed the non-executability |
| §R3, liveness receipt | the green `--check injected-op-caller-param-health` run | **narrowed:** it proves DECLARATION liveness only. The rights rest on the review's contract/wiring trace |
| §R9 commit 3, files list | "`lib/injected-op-caller-param.ts`" (unspecified change) | **specified:** delete `CALLER_FREE_OP_ROWS` + `CallerFreeOpRow` + `callerFreeOps()`; KEEP `IDS_MODULE` + `deriveEntityIdTypes` |
| §R9 commit 3, obligation 4 | "each occurrence gate's §4.2 identity arm is REPLACED by a §4.3 grant arm, and the `fix` strings … rewritten" | **survives and is now specific for this pair:** the `@orb-waive` clause at `injected-op-caller-param.ts:59` goes, the `:210` marker fixture goes with the §4.2 row |
| §R9 commit 3, obligation 3 | the three `injected-op-caller-param-split.test.ts` breakages | **survives, plus the review's item 10 constraint:** the rewritten differential drives central grants and must not rebuild a private list |
| §R2 Set C / §R1.3 | `CALLER_FREE_OP_ROWS` as the live worked example of the retype bypass | **still true today, but it EXPIRES with commit 3** — see §R2.7 |
| §R1 (ARM D) · §R2 (the ten-module set) · §R4 · §R5 · §R6 · §R7 · §R8 · §R9 commits 1 and 2 | — | **UNAFFECTED.** ARM D never sees this pair (Set C is retyped), so neither the arm's design nor the ten-module prediction moves |

## R2.7 The remaining unheld residual, restated honestly

1. **The RETYPE class is still unheld by any gate**, and §R1.3's declared limit stands unchanged.
2. **And commit 3 makes the audit WORSE before it makes it better, in one specific way that must be
   compensated.** After this migration `lib/injected-op-caller-param.ts` holds no permission at all, so the
   corpus loses its one live worked example of the retype bypass — the very example §R1.3 hands to the
   §5b item-7 audit as its positive control. **Prescription: keep the retype shape as a `mustPass` FIXTURE
   in ARM D's rows** (fixtures are population coordinates, not tree state, so it survives the migration
   permanently) and cite that fixture from the §5b.7 checklist. Without it the audit's only worked positive
   is a git-history reference.
3. **`ListCharacterSpriteAssetsOp`'s `endsWhen` is not machine-checkable.** Central grant liveness keeps
   the row consumed as long as the declaration exists; it cannot see a composition root appearing. Held by
   human review at the expressions leaf, and by receipt (5) at landing — nothing else.
4. **The `-health` STALE arm's successor is wider but differently classed** (findings → alarms, §R2.1a).
   Both block; a count-only reader is misled.
5. **The seven rights themselves rest on four assumptions no gate holds** (§R2.5) — owner sign-off, not
   enforcement.

## R2.8 Authorization status

**Commits 2 and 3 remain UNAUTHORIZED.** Commit 1 (ARM D + the two zero-cost deletions) is untouched by
this review and unaffected by it. Commit 3 additionally requires the four §R2.5 sign-offs before it may be
briefed, and its floor now carries the ten-case matrix of §R2.3 and the seven receipts of §R2.4.

**What this leg did NOT do:** I did not re-trace the seven rights independently — the review's
contract/wiring/caller trace is relayed, and I verified only the four source claims its BLOCKER rests on
plus the four facts in §R2.1a. I ran no test. I did not run the reviewed pass (it does not exist). The two
receipts I marked MEASURED were taken on `fb2deeb98` and must be re-taken on the landing tree.

### R2.5 correction — 2026-09-13

**Appended at the file's end rather than inserted above §R2.6, so the append-only property of every leg
stays provable by a prefix diff. It is authoritative over §R2.5, over §R2.7 item 5, and over §R2.8's
sign-off clause.**

**The source document changed between my read and this correction, and that is the receipt.** When I wrote
§R2.5 the review file was **98 lines** and its final section was headed *"Security assumptions requiring
human sign-off"*. It is now **100 lines**, that heading reads **"Existing architectural premises and future
review triggers"**, and a preamble paragraph has been inserted at `:91` that did not exist before. **The
four bullets themselves are byte-identical**; only their STATUS changed. So §R2.5's framing was faithful to
the text I read and is wrong about the text that now stands — the honest description is a superseded read,
not a misreading, and the line count is what distinguishes them.

**The corrected verdict, relayed verbatim in substance** (`:91`): *no concrete unresolved current source
path defeats preservation, and no new owner decision is required for these seven unchanged rights. The
premises below are already embodied in the current contracts and callers; the `endsWhen` clauses identify
future changes that must reopen the relevant grant review.* This is consistent with the Verdict section,
which was unchanged throughout and already said *"I found no current caller path that invalidates the seven
permissions after tracing the declarations, composition bindings, and consumers."*

**WITHDRAWN:**

| where | the withdrawn framing |
| - | - |
| §R2.5 heading and preamble | *"Security assumptions requiring human sign-off … These are OWNER items, not lane items, and commit 3 cannot land without them."* **Withdrawn in full.** They are neither owner items nor a landing gate |
| §R2.7 item 5 | *"The seven rights themselves rest on four assumptions no gate holds — owner sign-off, not enforcement."* **Withdrawn.** The premises are already embodied in the current contracts and callers; nothing is pending on them |
| §R2.8 | *"Commit 3 additionally requires the four §R2.5 sign-offs before it may be briefed."* **Withdrawn.** No owner sign-off is owed for the seven unchanged rights |

**WHAT THE FOUR BULLETS ARE, correctly:** existing architectural premises of the CURRENT system, plus the
future-change triggers that must reopen a grant review. They are the standing conditions the seven
`endsWhen` clauses in §R2.2 already encode, restated at the premise level — not open questions, and not a
gate on this train.

**WHAT STILL HOLDS, unchanged by this correction:**

1. **No server-domain contract, caller, composition binding or authorization predicate changes in this
   migration.** That was never a sign-off condition; it is the scope fence, stated in the review's own
   Verdict (`:9`) and in §R2.1's preservation paragraph. **Domain/caller changes remain UNAUTHORIZED.**
2. **Commits 2 and 3 remain held — for ROOT'S REVIEW OF REVISION 2, not for owner permission.** §R2.8's
   first sentence stands on that basis alone.
3. **`ListCharacterSpriteAssetsOp`'s `endsWhen` is still not executable by central grant liveness**
   (§R2.2, §R2.7 item 3). It is a future review trigger rather than a sign-off item, and landing receipt
   (5) in §R2.4 still applies unchanged: if a production composition root supplies
   `listCharacterSpriteAssets` before landing, **STOP** — the grant rationale has ended and the contract
   must carry caller/owner scope. That is a tree condition the lane checks, not a permission it requests.
4. **Every other §R2 obligation is untouched** — the central-only architecture (§R2.1), the four
   implementation facts (§R2.1a), the per-right `endsWhen` (§R2.2), the ten-case matrix (§R2.3) and the
   seven landing receipts (§R2.4) all stand exactly as written.
