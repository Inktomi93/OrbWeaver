---
kind: review
status: active
updated: 2026-09-06
---

# Schema fact family checkpoint for #1584

## Checkpoint state

The original lane stopped before conversion. The integrated branch now owns a first-class Drizzle provider,
one hard health policy, and the first relational-integrity policy wave. Historical SHAs below remain review
receipts; the current branch tip and the latest receipts in this document are the resume authority.

The boundary is `contract/schema-fact.ts` plus `lib/schema-fact.ts` and
`lib/schema-fact-value.ts`. It consumes only the already-loaded `SourceFile[]`, `relativePath`, and lazy
checker supplied by a policy invocation. It constructs no Project, owns no cross-run cache, reads no raw
filesystem/resource path, and executes no authored code. JSON and other non-code inputs remain outside this
boundary and may enter policy evaluation only through typed resource facts.

The owner ruled during this lane that final AST/source populations are `.ts` and `.tsx` only. The query
refuses every other extension, including `.mts`, `.cts`, `.mjs`, and `.cjs`; it does not widen the compiler's
candidate set.

## Closed consumer census

Structural import scans covered 5,643 TypeScript files and 1,377 TSX files with zero skipped files. They
found 13 production importers of `_shared/schema-read.ts` and one test importer:

- `tooling/src/ast/lib/columns.ts`;
- `table-scoping-class`, `schema-banned-shapes`, `ownerid-registry`,
  `nullable-column-inequality`, `asset-refs-fk-coverage`, `schema-branding`,
  `table-explicit-primary-key`, `json-column-write-parity`, `fk-columns-indexed`,
  `lifecycle-portability`, `fk-ondelete-stated`, and `no-untyped-soft-ref`;
- `tests/tooling/_shared/schema-read.test.ts`.

The same scan proved zero default, namespace, side-effect, dynamic, require/destructured, re-export, alias,
or TSX imports. Literal `rg` corroborated the set. A separate assigned-surface scan covered 258 TS and three
TSX files, zero skipped, and found the non-importing semantic duplicates:

- `table-scoping-class` re-parses table calls despite using the old reader for population;
- `contract-derives-not-respells` and `own-tables-only` independently derive exported table identity;
- `open-json-column-key-parity` independently derives table/JSON-column identity;
- `fk-ondelete-stated` independently walks reference options;
- `asset-refs-fk-coverage`, `schema-banned-shapes`, `schema-branding`, `lifecycle-portability`, and the JSON
  parity gates retain private table or descendant scans.

This is the closed migration manifest for the family, not a production registry.

## Implemented fact contract

`createSchemaQuery` eagerly derives one immutable fact for one policy invocation and exposes `schema()`,
`table(node)`, and `column(node)`. Missing, empty, unresolved, and ready are explicit outcomes; no lookup uses
`undefined` as absence. Ready facts retain canonical declaration/source identities and source anchors for:

- Drizzle SQLite tables and effective last-write column members;
- column builder provenance, SQL names, primary-key/unique/not-null operations;
- foreign keys, explicit/implicit `onDelete`, and selected-file external parent identity;
- indexes, unique indexes, composite primary keys, column terms, and expression terms;
- JSON columns with open, closed-key, and scalar shapes.

Alias, namespace, re-export, destructure, computed-static key, shadow, write, cycle, dynamic, unresolved,
missing, and empty controls are committed in `tests/tooling/verify/lib/schema-fact.test.ts`. The owner extension
control admits `.ts`/`.tsx` and refuses non-TS source identities.

## Cold review and repairs

The first cold verifier refuted `ccce9950b` with three concrete defects:

1. two distinct selected-file parents imported as `./users.ts` received the same external FK key;
2. named interfaces with a string index signature were misclassified as closed JSON;
3. `{ ...base, id: replacement }` emitted duplicate canonical column identities.

The implementation was amended to `10b367434`: external FK keys now use the resolved canonical source path
while retaining the authored module specifier, any string-index type is open JSON, and schema column objects
apply effective last-write semantics. Each defect has a committed regression. A second fresh cold verification
was started against the amended commit but was stopped by the owner checkpoint; its final verdict is therefore
not part of this checkpoint unless appended by a later resume.

## Verification already observed

- Focused schema-fact behavior: 10 tests passed, zero type errors.
- Focused production TS7: exit 0.
- Scoped Biome and ESLint: exit 0.
- Scoped dependency-cruiser: 12 modules, 45 dependencies, zero violations.
- Live loaded schema exercise: `ready`; 30 source files, 97 tables, 849 columns, 162 foreign keys,
  178 indexes, 72 JSON columns, 25 open JSON columns, and 1,286 total fact members.
- Pre-conversion `gate:contract`: 1,447 findings across 255 gate modules.
- First cold review also confirmed invocation isolation and no production Project, cross-run cache,
  arbitrary execution, `getProject`, `getSourceFiles`, or `forEachDescendant` use.

No broad structure, Knip, graph typecheck, full test battery, global baseline/catalog regeneration, main
merge, push, or board transition ran in this lane.

## First-class provider integration

Commit `0caf7dac2` moves production schema discovery into `drizzleSchemaFact`, a first-class provider over the exact `packages/db/src/schema/**` TS/TSX population. The dispatcher now feeds top-level `VariableDeclaration` nodes once; the provider finishes the canonical table/column/FK/index/JSON model before policies evaluate. The prior `schemaTableCalls(files)` descendant sweep remains only behind the direct unit-query helper and is not used by production policies. It retires when the schema policy family fully consumes the provider.

The merged local-main provider run is ready over 30 files: 97 tables, 850 columns, 162 foreign keys, 178 indexes, 72 JSON columns, 25 open JSON columns, and 1,287 total members. The column/member increase is the merged `refinery` schema change. The provider-only receipt measured 19.28 s with 25.88 s process wall and 2.69 GB peak RSS; fact and policy tool errors were zero. Fourteen focused schema tests plus the 47-test core pass suite are green.

## Family shape

One provider owns canonical schema discovery. Policies keep separate ids when they have distinct fixes,
authority, or suppression decisions. Consolidation removes duplicate parsing and traversal; it does not
collapse unrelated findings into one mega-policy.

- fact health: missing, empty, mutated, dynamic, ambiguous, or unresolved schema identity;
- relational integrity: explicit primary keys, explicit FK deletion policies, and leading child indexes;
- identity integrity: schema brands and exact FK parent/child brand agreement;
- ownership and scope: direct ownership plus provider/producer-derived ownership through canonical FKs;
- shape policy: ledger bans, JSON shape/write parity, enum derivation, and typed soft references;
- external registries: schema-produced obligations reconciled against independently receipted registries.

The installed Drizzle runtime is an independent oracle, not the source scanner. `getTableConfig` can compare
the live schema's table, column, FK, index, and deletion metadata with the static provider. `drizzle-kit/api`
continues to own generated-schema/baseline parity. Runtime metadata cannot replace ts-morph for source
anchors, authored-shape refusal, comments, or erased TypeScript brands.

## First relational policy wave

The first wave converts `fk-columns-indexed`, `fk-ondelete-stated`, and
`table-explicit-primary-key`, and adds `schema-fact-health`. All four consume the same
`drizzleSchemaFact`; no policy walks source files or recognizes Drizzle by text. Impostor or unresolved
builders are instrument-health failures, while complete facts feed the three semantic policies.

Focused final-policy conformance is green. A real-project final pass loaded 7,130 project sources, selected
the exact 30 schema files, derived 1,287 members once, and produced zero findings, policy errors, fact errors,
authority errors, or authority alarms. The provider cost 23.08 s; the complete process took 30.18 s and
peaked at 2,655,060 KiB RSS with zero swap and zero major page faults. The three policy evaluations together
cost 23.14 ms. Performance remains a family-level acceptance item.

`gate:contract` moved from 1,414 findings across 256 modules to 1,403 findings across 257 modules: the three
legacy descriptors retired eleven authoring violations, while the new health policy adds a registered module.
The production structure front door remains legacy until atomic cutover and correctly refuses final policy
descriptors; no compatibility adapter is planned.

## Identity integrity

`schema-branding` now consumes the same schema fact. A column `.$type<T>()` carries its compiler `Type`,
authored display, and the literal phantom value of the canonical `packages/kit/src/ids/index.ts` `[brand]`
property. A same-spelled local alias or arbitrary `$type<string>()` therefore supplies no id brand. The
policy requires a primary-key `id` to carry a canonical brand and requires every FK to a branded parent to
carry the exact same brand value. This strengthens the legacy presence-only string check: a `UserId` child
cannot satisfy a `ChatId` parent merely because both are strings.

The final ordinary waiver is the one `@orb-waive <policy>(<position>): <reason>` grammar, attached to the
exact column occurrence. The legacy `plain-id:` spelling is retired; no live product marker used it. Policy
proofs explicitly provide their kit-id declaration rather than loading undeclared live-tree files. A real
30-file schema pass derived all 1,287 members and produced zero missing-brand or mismatched-brand findings,
with no policy, fact, authority, or waiver alarms.

The owner expanded this slice to the wider identity-flow family rather than leaving follow-up debt. Next
consumers are `brand-in-name-position`, `no-raw-id`, `no-mint-via-cast`, `no-loose-id-cast`, and
`no-fake-disabled-id`. Their final policies must share canonical kit brand/call facts and the central waiver
plane; they must not preserve `@foreign-id-ok`, textual `castId` recognition, or gate-local stale tables.

## Conversion eligibility at checkpoint

Both policies this checkpoint listed for the next slice are now resolved, in different directions:
`asset-refs-fk-coverage` is RETIRED into a Drizzle-runtime stage and `schema-banned-shapes` is SPLIT by
evidence plane. `ownerid-registry` is converted too: its 27 ownership rows are authoritative classification
data rather than grants, and nothing in that judgement waits on `no-untyped-soft-ref` — the coupling was to
a shared *family* name, which the singleton-family rule makes unnecessary. See the slice below.

The original six-policy estimate was based on the earlier 1,447 census. Current measured deltas supersede
that estimate; future slices must record their own before/after counts.

## Second conversion slice: obligations, ledger bans, ownership, enums, nullability

Five items, one lane (`cb-schema-family`). Four became final policies on `drizzleSchemaFact`; one left the
gate corpus entirely. Base for every count below is `0dd6f17c6`.

### `asset-refs-fk-coverage` retires into `structure:asset-refs`

The AST gate is deleted. `compareAssetRefsCoverage`
(`tooling/src/verify/ops/asset-refs-coverage.ts`) reconciles the registry against the LIVE schema through
`getTableConfig`, with two callers in the `compareSchemaBaseline` shape: the new `pnpm check:asset-refs`
stage (`structure:asset-refs`, static tier, no `scopedArgv`) and
`tests/server/domain/assets/persistence/asset-refs.int.test.ts`. The registry reaches the comparator through
the assets FRONT DOOR — `ASSET_REFS`/`DERIVED_ASSET_COLUMNS` are now exported from
`packages/server/src/domain/assets/index.ts`, because the server exports map is `"./*": "./src/*/index.ts"`
and no deeper path resolves.

Equal-or-better, measured rather than asserted:

- **population.** The runtime enumerates every table exported from `@orb/db/schema` (97 tables), so an
  authoring shape the old reader could not parse cannot shrink the denominator; `db-structure` separately
  enforces that every schema file is re-exported from that barrel. The AST gate saw only `sqliteTable(`
  calls it could parse.
- **findings.** Legacy replay over the same 7,135-file harness workspace: 0 findings, 13.8 s. New command:
  0 findings, **1.92 s wall / 438 MB peak RSS**. With the registry emptied as a positive control BOTH
  produce the SAME 12 columns — an exact population equality, not an assumed one.
- **behavior added.** Phantom rows (a key naming no live asset FK) and retaining/derived overlap were
  invisible to the gate; both are now verdicts, both proven on planted schemas.
- **failure honesty.** Zero tables, no `assets` table, zero FK→`assets.id`, or an unresolvable registry row
  are each exit 2. The legacy gate reported a silent zero.
- **actionable output.** Every row prints its `table.column` key and the FIX names the registry file.

Live verdict: `97 schema table(s), 12 asset-FK column(s), 10 retaining, 2 derived` — clean. Planted
positive controls on the real tree: dropping the `plugin_assets` row reds it unclassified (exit 1); adding a
phantom derived key reds it phantom (exit 1); the restore returns exit 0.

**Two identity defects were found in cold review and fixed with red-first controls.** Both are the same
class — a claim about IDENTITY tested by SPELLING:

1. the reader compared only `reference().foreignTable`, so an FK to ANY `assets` column counted. `columns`
   and `foreignColumns` are positionally paired; the pair is now zipped and only `assets.id` counts. An FK
   to a non-`id` assets column is ruled OUT OF SUBJECT (the GC live-set and the export bundle are keyed on
   `AssetId`), with a control asserting it owes no registry row.
2. the coverage key was built from the row's DECLARED table name, so
   `{ table: characters, column: personas.avatarAssetId }` read as coverage of `characters` while leaving
   `personas` silently uncovered. The key now derives from `column.table` — the column's own identity — and
   the incoherent pair is its own `mismatched` verdict.

Red-first receipt: with both reads reverted to their pre-fix form, exactly those two controls fail and the
other nine tests stay green.

### `schema-banned-shapes` splits by evidence plane; D12 moves to Biome

The old module judged three subjects at once. The rows move to one shared vocabulary
(`tooling/src/verify/lib/ledger-banned-shapes.ts`) partitioned by evidence plane, and two `hard`/`error`
policies import their own partition:

- **`schema-banned-shapes`** — the Drizzle fact. Tables by `sqlName`, columns by `identity.propertyName`.
  Findings anchor on the column (or table) declaration, replacing the legacy line-1 stub.
- **`contract-banned-shapes`** (new id, singleton family) — authored `@orb/contracts` declarations.
  `Principal.kind` (D60) and `appSettingsSchema.guidedActions` (D33), the latter read by walking the Zod
  builder chain for shape KEYS only, through `object`/`extend`/`merge` and past preserving operations.
- **D12** (`@orb/contracts/sessions`) is a plain module-specifier ban, which Biome's native
  `style/noRestrictedImports` owns completely (GATE-AUTHORING §10). It is a `patterns` row in `biome.json`,
  pinned hermetically by `tests/tooling/verify/lib/ledger-banned-shapes.int.test.ts`: the real binary over a
  copy of the real config, three planted importers proving reach into `packages/`, `tooling/` AND `tests/`,
  the singular `@orb/contracts/session` twin clean in the SAME invocation, and the D-cite asserted in the
  diagnostic. A `**/__probe*` path is useless here — it is gitignored, so Biome's `useIgnoreFile` never sees
  it (measured: "No files were processed in the specified paths").

Both policies are `hard`, so the three `@finding-overload-ok` markers in the old module DELETE rather than
translate; **the ordinary-waiver manifest's 24 authored `@finding-overload-ok` sites drop to 21.**

Population: `schema-banned-shapes` is byte-equal to the legacy admitted set (30 files).
`contract-banned-shapes` NARROWS to `@contracts` (105 files) from the legacy whole-project run — a recorded
delta, re-derived on the whole tree: `interface Principal` has exactly one declaration
(`packages/contracts/src/identity/index.ts:45`; ast-grep ts=1 hit, tsx=0 against 629 tsx interface
declarations as the positive control) and `appSettingsSchema =` exactly one
(`packages/contracts/src/settings/index.ts:364`). Both subjects' one home is `@orb/contracts` by the
type-home law, so a same-spelled declaration elsewhere is a DIFFERENT type. The narrowing is safe BECAUSE of
a two-sided arm the legacy gate lacked: a ruled subject that stops resolving in its declared home REDs
(both halves proven — subject renamed away, and home file gone entirely).

### `db-enum-from-tuple` (D34)

`hard` — `rg` found zero live `@orb-gate-ignore db-enum-from-tuple` markers across `packages/`, `tests/` and
`tooling/` (with a `packages/db` positive control proving the search reached). The config is read off the
resolved builder call rather than off every `enum:` property assignment, so a spread-reached inline array is
the same re-spelling. The legacy "outside the schema dir is not scanned" `mustPass` is retired: a `mustPass`
cannot prove a population in a virtual project, and the population equality below is the real receipt.

Cold review found the identifier arm accepted any name. It now has to EARN the pass through the shared
readers: a canonical `@orb/contracts` / `@orb/kit` origin (alias, namespace member and re-export included),
or a co-located `as const` array literal in the column's OWN file. A call result, a `let` binding, a plain
non-`as const` array, and a real `as const` tuple imported from a db-local module are all fail-closed
findings, each with its own control. Red-first: with the old "any named reference passes" rule restored,
exactly the four new counterfactuals fail.

The local arm is fenced to the column's own file deliberately — `resolveStableExpression` follows an import
to its declaration, so without the fence a `./local-vocab` tuple would pass.

**A COMPOSED TUPLE'S SPREAD SOURCE IS PROVEN, NOT TRUSTED.** `as const` freezes the ARRAY and says nothing
about where a spread's members came from, so an admitted frozen array has every element accounted for
recursively: each spread source must satisfy the same proof (a canonical-module origin, or another
co-located `as const` tuple), and each ordinary element must be an authored literal. Reproduced on the
committed logic before the fix: `[...getKinds(), "x"] as const` and `[...WIDENED_ARRAY, "x"] as const` both
PASSED — a frozen wrapper over an unknowable vocabulary, entering through the one shape D34 sanctions. Both
are now findings, with `[...LOCAL_AS_CONST, "x"] as const` as the green twin. Red-first receipt: with only
the proof logic reverted to its committed form, exactly those two rows fail.

The live composed shape
(`AUTOMATION_FIRE_STORAGE_OUTCOMES = [...AUTOMATION_FIRE_OUTCOMES, "reserved"] as const`) keeps its own
`mustPass` row and was re-measured on the real tree after the tightening — still zero findings, because its
spread source resolves to `@orb/contracts/automation`. Deriving from the one home and adding a storage-only
member is what D34 sanctions; composing over a source nobody can name is not.

### `nullable-column-inequality` (D124)

Nullability comes from the fact (composite primary-key terms included); the drizzle callee comes from the
shared module-origin reader, so an alias or namespace import is still SQL and a same-named local helper is
not. The block-window marker parser, the local stale/malformed/ambiguous arms, and the `isVocabularyHome`
fence are deleted — the fence became population algebra, because the central waiver engine derives its
marker universe from the effective population and a tool file mentioning the grammar is outside the policy.
Malformed / stale / over-broad markers are CENTRAL engine behaviors and are not re-proven per policy.

Two mechanisms this cost, both worth copying:

1. **`drizzle-orm`'s comparison operators are OVERLOADED.** `notInArray` has three declarations, so
   `resolveModuleMemberOrigin` correctly refuses it as `ambiguous` — and the live site therefore produced
   ZERO findings while its waiver read as unconsumed. `schema-fact-value.ts` had already solved this for the
   sqlite-core builders; the same trace-declaration door is now in this policy. The proof needed a PLANTED
   overloaded `node_modules/drizzle-orm/index.ts`, because the virtual conformance project otherwise
   resolves the module as an unloadable external door and never reaches the ambiguity.
2. **Resolving a canonical origin on every CallExpression in a 6,112-file population does not finish in ten
   minutes** (the id-brand lane's lesson, re-paid here). A per-file candidate index — the canonical names
   plus every local alias and namespace spelling the file's own drizzle imports bind — gates the expensive
   resolution, which still runs, so a shadowed local of a candidate name is refused exactly as before.

**CO-LOCATION IS NOT GUARDING.** Cold review refuted the "a guard anywhere in the same enclosing statement"
rule this document's brief carried: `choose(isNull(col), ne(col, "x"))` puts guard and predicate in one
statement AND one argument list while every NULL row still vanishes. The guard must PARTICIPATE IN THE
CONTROLLING BOOLEAN EXPRESSION: an inequality is guarded iff some drizzle `and`/`or` call is an ancestor of
both it and a guard on the SAME canonical column key. Nesting composes. This is an intentional strengthening
of the legacy semantics and it CHANGED the live verdict: the one product site now produces a raw finding
that its `@orb-waive` consumes, where before both the finding and the waiver were absent.

Population: legacy admitted 6,113 paths, `{ in: ["@packages", "@tests"], ext: ["ts","tsx"] }` admits 6,112.
The single dropped path is `packages/showcase-plugins/src/index.ts` — one file, ZERO `drizzle-orm`
references, and guest showcase code has no db reach through the plugin membrane to acquire one.

The one live `@nullable-cmp-ok` marker is translated to
`@orb-waive nullable-column-inequality(characters.avatarAssetId): …` at
`packages/server/src/domain/discovery/persistence/embed-store-reads.ts`.

### `ownerid-registry` (D23/D30/D21/D49)

`hard`. `OWNERID_ALLOWLIST` is renamed `OWNERID_CLASSIFICATIONS` and typed locally rather than through the
legacy `ExemptionTable` — that type intentionally conflates allowlists, sanctioned homes and deferred debt,
and the exception census rules these 27 rows authoritative D23 classification data. The stamp arm reports on
the column declaration; the stale arm reports on the schema barrel.

DECLARED LIMIT, recorded: the stale arm requires `packages/db/src/schema/index.ts` in the effective
population. Without that anchor a partial fileset would report all 27 rows as stale — the §4.5 misfire — and
the anchor is not any row's own path, so a table deleted outright is still judged (§4.4a mode B, proven).

Both arms key on the SQL table name, with counterfactuals in both directions for a JS binding whose
declaration name disagrees with the table it creates.

### Population equality, over one frozen 7,138-path candidate set

| Policy | Legacy admitted | Final admitted | Verdict |
| - | -: | -: | - |
| `schema-banned-shapes` | 30 | 30 | exact |
| `db-enum-from-tuple` | 30 | 30 | exact |
| `ownerid-registry` | 30 | 30 | exact |
| `nullable-column-inequality` | 6,113 | 6,112 | classified delta (one file, no subject) |
| `contract-banned-shapes` | 7,138 | 105 | deliberate narrowing (receipted above) |

### Real-tree final pass

`runPolicyPass` over `getWorkspace({ types: true })`, all five selected, the converted sibling ordinary
policies supplied as `knownPolicies` so their live waivers resolve as known-but-unselected:

- 7,145 loaded project sources; **2:16 wall, 4,885,808 KiB peak RSS, zero swap, zero major page faults**;
  117.1 s pass total (43.8 s fact, 44.9 s policy).
- `drizzleSchemaFact` ready over its exact 30 files: 1,287 members, zero unresolved.
- Owner status `success` for all five. Raw findings: 1 (the waived nullable site); every other policy 0.
- Waivers consumed 1/1, **effective findings 0**, verdict `{errors: 0, blocking: 0}`.
- Zero fact errors, zero policy tool errors, zero authority tool errors, **zero authority alarms**, nothing
  withheld.

Conformance: `schema-fact-wave-1.test.ts` (both waves) and `ledger-banned-shapes.test.ts` green; the
asset-refs suites 15/15 including the live reconciliation.

### `gate:contract` delta

1,373 findings across 257 modules at `0dd6f17c6` → **1,341 across 257**. The −32 is exactly these six
modules' prior contribution, and every one of them now reports zero:

| Module | Base | After |
| - | -: | -: |
| `schema-banned-shapes` | 6 | 0 |
| `db-enum-from-tuple` | 3 | 0 |
| `nullable-column-inequality` | 11 | 0 |
| `ownerid-registry` | 6 | 0 |
| `asset-refs-fk-coverage` | 6 | retired |
| `contract-banned-shapes` | — | 0 (born conformant) |

The module count is unchanged because one module retired and one was added.

### Two rulings recorded rather than silently taken

1. **A fail-closed finding does NOT also count `unresolved` in the receipt.** `policyReceiptFailures`
   refuses any receipt with `unresolved > 0` — unconditionally, not only behind a green — so declaring it
   turns every proof of the fail-closed arm into a tool error. GATE-AUTHORING §1 rules the same thing from
   the other side: a policy that already REPORTED the unreadable declaration rides the ordinary violation
   exit, because one cause must not produce both a violation and a "the checker is broken" verdict. These
   policies therefore report and do not declare `unresolved`; the denominator receipt is the shared fact's
   1,287 members. If the runtime should instead distinguish "reported-and-unresolved" from "the run is not a
   verdict", that is a runtime-contract change and belongs to the runtime owner.
2. **An ARRAY spread inside an `as const` tuple is a derive, not a re-spelling — PROVIDED ITS SOURCE IS
   ITSELF PROVEN.** Fail-closing on "a spread" outright would red `AUTOMATION_FIRE_STORAGE_OUTCOMES`, which
   composes the contracts tuple with one storage-only member — the shape D34 exists to encourage. So the
   admission is conditional and the condition is checked: the spread's source must resolve to a canonical
   module or another co-located `as const` tuple, recursively. A spread of a call result or of a widened
   array is a finding. The separately fail-closed spread case is the OBJECT spread that smuggles an inline
   array into a column config (`{ ...CONFIG }`), which has its own row.

## Explicit blockers

- `own-tables-only`: needs canonical table import/write provenance, exact central grants, invocation-local
  state, and separate reviewed-read, hard-write, and hard-health policies.
- `table-scoping-class`: its registry/helper surface has 13 importers plus four semantic duplicators; one
  canonical scoping fact and an authority ruling must land first.
- `json-column-write-parity`: still lacks shared writer-taint, helper-hop, SQL-write, and dominance facts;
  reviewed-grant and hard-health arms must split.
- `open-json-column-key-parity`: still lacks shared reader/writer/key provenance; permanent reviewed grant,
  issue-184 warning debt, and hard health must split.
- `lifecycle-portability`: still lacks shared carrier/door facts and policy splits; only `rosterPresets`
  has a valid issue number (#26), while the other deferred rows lack positive work-item identities.
- `no-untyped-soft-ref`: six semantic permissions lack a production central grant home and explicit
  `endsWhen` values.

## Exact resume procedure

1. Re-run a fresh cold verification of `10b367434`, including the three repaired regressions and all four
   excluded source extensions. Fix only confirmed schema-fact defects, then record the final SHA here.
2. Freeze one ordered compiler-derived `.ts`/`.tsx` manifest. On that same byte set, compare every selected
   legacy `scanRoot` with the final `PopulationExpr` and record equality or a deliberate delta.
3. Convert only the six self-contained policies above, split across non-overlapping owners. Run each legacy
   proof map and final proof map over the same fixture bytes, then diff normalized current-corpus findings.
4. Re-run `gate:contract` and require the exact per-policy census deltas before crediting conversion.
5. Decide whether to stage `ownerid-registry` under the final `schema-column-policy` family or leave it for
   the grant-complete `no-untyped-soft-ref` fold.
6. Update this report with conversion commits, population/finding differentials, second cold verdict, and
   remaining blockers. Parent integration owns broad structure/full batteries and shared catalog/baseline
   regeneration.
