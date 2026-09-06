---
kind: review
status: active
updated: 2026-09-05
---

# Schema fact family checkpoint for #1584

## Checkpoint state

This lane stopped on the owner checkpoint before any gate conversion began. The useful completed artifact is
the invocation-scoped Drizzle schema fact/query boundary at `10b367434`. It is based on
`d42e89e51` from `codex/gate-tsmorph-standardization`; that source branch advanced independently after this
worktree was created, so integration must use the exact commits named below rather than assuming branch-tip
ancestry.

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

The merged local-main provider run is ready over 30 files: 97 tables, 850 columns, 162 foreign keys, 178 indexes, 72 JSON columns, 25 open JSON columns, and 1,287 total members. The column/member increase is the merged `refinery` schema change. Provider timing was 19.28 s with 25.88 s process wall and 2.69 GB peak RSS; fact and policy tool errors were zero. Fourteen focused schema tests plus the 47-test core pass suite are green. No schema policy conversion is credited by this provider-only change.

## Conversion eligibility at checkpoint

The following six policies were proven self-contained after the schema fact is cold-stable:

- `fk-columns-indexed`;
- `fk-ondelete-stated`;
- `table-explicit-primary-key`;
- `schema-branding`;
- `asset-refs-fk-coverage`;
- `schema-banned-shapes`.

`ownerid-registry` is detector-ready, and its 27 ownership rows are authoritative classification data rather
than grants. Its final family is coupled to blocked `no-untyped-soft-ref`, so the checkpoint leaves it
unconverted rather than creating temporary family churn.

The six conversions were expected to reduce `gate:contract` from 1,447 to 1,419. Including
`ownerid-registry` would reduce it to 1,413. These are expected census deltas only; no conversion or post-change
measurement was performed.

## Explicit blockers

- `nullable-column-inequality`: needs the central ordinary-marker migration plus canonical Drizzle
  call/column/null-guard facts; one live product marker is out of this lane's edit scope.
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
