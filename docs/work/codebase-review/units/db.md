# Unit: db

Band S. Path: `packages/db/` incl. migrations (78 tracked files: 4.3K TS lines, 11 migrations
/ 2K SQL, 135K JSON of drizzle meta snapshots). Governing law read in full: `.claude/rules/db.md`;
ADR 0132 clause-E adjacency (default identity) noted in the contracts unit.

## Sweeps

- Deps: `@libsql/client`, `@orb/contracts`, `@orb/kit`, `drizzle-orm`, `zod` — matches the tier
  rule (db: contracts, kit) and the import graph.
- **db.transaction ban**: zero live calls repo-wide — every `.transaction(` grep hit is a comment
  teaching the ban (the `:memory:` connection-replacement trap). The atomic unit is
  `batchMany`/`db.batch`; `query/batch.ts` is the one sanctioned cast bridge (it exists to kill
  ~59 inline `as BatchItem` casts) and carries a first-class drizzle/libsql transaction-mode
  analysis: drizzle 0.45.2 cannot pass `mode`, every batch rides `BEGIN DEFERRED`, the
  `SQLITE_BUSY_SNAPSHOT` read-before-write window is proven unreachable by a 2026-08-02 sweep,
  and the empty-batch contract was MEASURED and corrected in place ("the fix is to make the
  stated contract true rather than to narrow the runtime"). The law's "bans a SELECT ahead of
  writes" is prose-discipline with that measured-sweep receipt; re-verification of all 54
  `batchMany` call sites belongs to the server units (static approximation: no inline `select(`
  inside literal `batchMany([...])` arrays).
- Migrations law: journal entries 0-10 contiguous and matching the SQL files; every SELECT in
  every migration is inside an INSERT/UPDATE (no row-returning statement, zero RETURNING
  anywhere); `0000_baseline.sql` untouched since 2026-06-28 while forward migrations began
  2026-10-10 (0001) — the regenerate era ended before the forward era, and the baseline has been
  frozen ever since; rule 6 (body lands with its number) and the boot hash-compare are drizzle
  journal checksums, and `runMigrations` passes no force/catch hatch. Boot story is fail-fast by
  design: pre-migrate backup or abort (partial copy removed), FKs suspended during migrate,
  `PRAGMA foreign_key_check` gate right after (with the exact drizzle rebuild FK-drop bug it
  catches named in the doc), backup GC deliberately narrow because it deletes from a live dir.
- Tenancy law ("new table needs a TABLE_SCOPING row"): the registry is typed
  `satisfies TableScopingRegistry` over `SchemaTableName` derived from the schema barrel — a
  missing, stale or class-contradicting row is a **tsc error**; ~100 rows each carry the D- ruling
  and the authorization reasoning; `tests/db/tenancy/index.test.ts` checks what columns cannot
  show (per-class required FK counts: junction 2, parent 1), with a `.test-d.ts` twin. This is the
  strongest total-registry door in the repo so far.
- Closed-vocabulary door (the sweep's signature-crime FIX already exists here):
  `tests/db/schema/enum-tuples.suite.test.ts` dynamically imports EVERY public subpath of
  contracts+kit, collects every string-array export, and demands every db enum column be
  member-equal to a canonical tuple (or a reviewed local storage tuple) — plus the native
  `orb/db-enum-from-tuple` lint rule fencing the spelling. "Generate the list, diff it" is
  shipped law (D34) in this package.
- Stats CHECK law: the only CHECK constraints in the tree are vocabulary checks (assets kind,
  message_variants provenance/finish_reason, workload kind) — zero CHECKs on stats counter
  columns; `schema/stats.ts` carries the matching delta-accumulation reasoning and a
  load-bearing `NOT NULL DEFAULT '(unknown)'` justified by SQLite NULL-distinct upsert semantics.
- ASSET_REFS law: registry header is fail-closed ("a reference this file cannot read refuses the
  whole sweep"); registered RETAINING refs match the asset-bearing schema columns audited by hand
  (characters/personas avatars, gallery, imagery, messageAssets, messageReactions emoji,
  documents source, plugin bundle/fetch links, admin distribution); the unregistered asset FKs
  (image_analyses, image_embeddings, image_index_skips) are cascade/can-die references explained
  at their schema headers (imagery.ts states its registry posture outright). Deep read of the
  collector is the assets-domain unit's.
- JSON open types (`Record<string, unknown>`/`unknown` columns vs the close-the-type law): every
  site examined carries its WHY — `residualData` "genuinely-UNKNOWN vendor keys only", workloads
  `params` "the runner re-parses against its Zod schema at the read seam" (the closure lives one
  seam down, by design), audit `metadata` "parsed at the read seam if ever surfaced" under D24.
  No bare offenders found.
- Escape hatches: one suppression (namespace-import for drizzle's `typeof schema`, canonical
  pattern, reason on the line). Zero `any`, zero `@ts-`, zero TODO/FIXME in 4.3K lines.
- Tests: 19 files — per-migration regression tests (`*.repo.int.test.ts` for freeze-provenance,
  canon-renumber, retired-task-strip, workload-funding, rebuild-index-kind), native-ownership
  control tests, check-list, fetch-owned type test, table-integrity + module-structure suites.

## Findings

- \[P3] D141 archaeology cluster (cross-cutting, extends kit/contracts counts): 15 files carry
  dates ("measured 2026-08-02", "the owner ruling 2026-07-01" inside a TABLE_SCOPING `why`),
  25 files / 66 lines cite issue numbers (`#67`, `#802`, `#1377 item 3`, `#266 D-1`). Same
  tree-wide sweep candidate; db's density is far lower than contracts'.

## Verdict

reviewed (1: one P3 archaeology count; zero fixes needed). The cleanest unit of the sweep — the S
band earns its shape. Every law in `.claude/rules/db.md` that can be mechanically checked verifies
TRUE, and several are not prose at all but doors: totality by `satisfies`, enum vocabularies
diffed against a dynamic census of the vocabulary packages, FK floors tested per scoping class.
The package also hands the sweep its own answer twice over: batch.ts shows what a measured
prose-claim looks like (it caught and fixed its own false contract), and enum-tuples proves the
"generate the list, diff it" fix shape I've been carrying toward triage — the proposal should
generalize THIS door, not invent a new one.
