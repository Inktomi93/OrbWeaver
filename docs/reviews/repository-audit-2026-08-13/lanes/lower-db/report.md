## Lane identity

- Lane: `lower-db`
- Semantic scope: `@orb/db`: libSQL/Drizzle client and lifecycle, migration baseline, schema declarations, db-kit primitives, 26 assigned db integration tests, and one test-support module.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: current dirty working-tree bytes. None of the 71 owned paths differed in SHA-256 from the assignment snapshot. The shared audit controls drifted during the lane and were reread: README `315544…2669e` → `738833…062b`; RUBRIC `20afbc…ea218` → `04d081…4ac3`.
- Assigned files read: 71 / 71 (100%).
- Assigned lines read: 22,285 / 22,285 logical text lines (100%).
- Assigned bytes read: 955,322 / 955,322 (100%).
- Dirty assigned paths: 0.
- Structural scan coverage: 4,903 workspace source files in the completed `apisurface db` run; the native tool reports an aggregate rather than TS/TSX split. No binary assignment rows; no structural exclusions were claimed.
- Commands with tool failure: 1 unneeded `aliases` scan was not run after an earlier compound command yielded; no completed AST command failed. One broad `pnpm test` invocation was an invalid targeted-test attempt and has no verdict.
- Exclusions: no server, client, gate, or test-support source outside the assignment was read; server consumers are represented only by native AST output.

## Read receipt

`read-receipt.tsv` covers all 71 OWNED and all 9 SHARED assignment rows. Every row is marked `full-read`; no owned hash drift was found, and the two changed shared controls are recorded as drift.

## Architecture observed

`@orb/db` is the cake's persistence layer: its manifest admits only `@orb/kit` and `@orb/contracts` workspace dependencies ([packages/db/package.json](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/package.json:16), R3 resolve-time boundary). Its public barrel exposes the client lifecycle, vector codec, and the schema surface, while deliberately requiring db primitives to use `@orb/db/kit` ([packages/db/src/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/index.ts:16), [packages/db/src/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/index.ts:31), R2).

`createDb` constructs the libSQL client, enables and reads back FK enforcement, applies connection tuning, verifies WAL for file URLs, and binds the complete schema namespace to Drizzle ([packages/db/src/client/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/client/index.ts:130), R2). The schema barrel enumerates 28 leaf schema modules plus its barrel, and describes why a missing re-export would remove a table from migration and relational-query registration ([packages/db/src/schema/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/schema/index.ts:1), [packages/db/src/schema/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/schema/index.ts:11), R2).

Resolved structural evidence shows 1,123 `@orb/db` importer hits across 722 files, including server persistence/composition and integration-test consumers (`pnpm ast importers @orb/db --files`, R3); this establishes downstream use but does not substitute for reading sibling-owned server code.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Client, migrations, and database lifecycle (449-line client) | 4 | 4 | 4 | 3 | 3 | high | [client](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/client/index.ts:130), [client test](/home/inktomi/inktomi-stack/development/orbweaver/tests/db/client.int.test.ts:29), current direct integration receipt (20/20 tests) |
| Schema registry and 28 schema leaf files | 4 | 4 | 4 | 3 | 2 | high | [schema barrel](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/schema/index.ts:1), [baseline](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/migrations/0000_baseline.sql:1), current direct integration receipt (24 files / 251 tests) |
| db-kit primitives | 3 | 3 | 4 | 2 | 2 | high | [constraint classifier](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/kit/db-errors.ts:67), [kit integration test](/home/inktomi/inktomi-stack/development/orbweaver/tests/db/kit/db-errors.int.test.ts:10), current direct integration receipt (3/3 tests) |

The scores are independent and bounded to assigned files. Scores of 4 have two receipts: source behavior and the current direct 26-file / 274-test integration receipt. The test result is R5 evidence for these assigned integration files; it is not a claim of live-runtime recovery proof.

## Findings

### LOWER-DB-01 — Four schema modules lack a directly mirrored schema integration test

- Severity: P3
- Class: test-quality
- Confidence: high for the direct-mirror count; low for any broader coverage conclusion.
- Evidence rung: R2 for the four schema declarations; R4 for the 24 directly mirrored test files.
- Scope denominator: 28 non-barrel schema source files in this assignment; 24 matching `tests/db/schema/<name>.int.test.ts` files.
- Receipts: [schema barrel](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/schema/index.ts:11), `read-receipt.tsv` assignment-path comparison, and full reads of all 24 schema tests.
- Established fact: `imagery.ts`, `plugin.ts`, `regex.ts`, and `relations.ts` are registered schema leaves, but this lane's assigned test set has no same-name direct schema integration mirror. The barrel itself is exempt from a direct mirror.
- User or system impact: drift in those DDL declarations has no direct db-schema test in this lane; coverage may instead be transitive through their owning server-domain tests, which are outside this lane.
- What remains unverified: whether the server-domain integration suites assert each table's constraints and relation behavior.
- Suggested next check or fix: the schema/domain owner should map these four leaves to current domain integration assertions before deciding that new direct tests are warranted.

### LOWER-DB-02 — Fifteen persisted columns have write evidence but no discovered read

- Severity: P2
- Class: declared-not-wired
- Confidence: medium. The native column lens is structurally designed to avoid false "unwritten" findings, but it intentionally over-counts reads and marks raw SQL table-agnostic; a scoped consumer review would raise confidence.
- Evidence rung: R3 for the structural writes and absence of discovered reads; R0 for any claim about actual user-visible impact.
- Scope denominator: 748 columns across all 85 registered tables, scanned by `pnpm ast columns --max 200` in 152.9 seconds; 15 unexempted write-only candidates.
- Receipts: [automation schema](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/schema/automation.ts:145), [character schema](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/schema/character.ts:186), [regex schema](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/schema/regex.ts:91), [tag schema](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/schema/tag.ts:126), [world-info schema](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/schema/world-info.ts:140), and the completed `columns` receipt in `commands.md`.
- Established fact: the column lens reported 15 `created_at`-style junction fields as written but never read; 15 carry `raw?`, and 58 tables have opaque whole-row/spread writers, so no claim is made that a write is absent or that raw SQL proves a given table's consumption.
- User or system impact: if any timestamp is intended for ordering, audit, or presentation, that intention is not reached by the scanned reads; if it is intentionally write-only provenance, the schema lacks an explicit reason marker for the lens.
- What remains unverified: server-domain read paths and raw SQL attribution, both outside this lane's source ownership.
- Suggested next check or fix: the owners of automation, character/persona, regex, tag, and world-info should either add/locate a consuming read or document a deliberate provenance-only field with the lens's reasoned `@column-ok` marker.

## Proven strengths

- `createDb` refuses to proceed when FK readback is not enabled and verifies file-backed WAL before returning ([packages/db/src/client/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/client/index.ts:142), [packages/db/src/client/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/client/index.ts:152), R4 through [client tests](/home/inktomi/inktomi-stack/development/orbweaver/tests/db/client.int.test.ts:29)).
- Migration execution uses an async-disposable FK suspension and separately checks `foreign_key_check`; tests cover both restoration and a deliberately planted orphan ([packages/db/src/client/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/client/index.ts:309), [packages/db/src/client/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/client/index.ts:320), [tests](/home/inktomi/inktomi-stack/development/orbweaver/tests/db/client.int.test.ts:154), R4).
- The backup retention sweep restricts deletion to anchored basename-and-digits backup files and files-only traversal ([packages/db/src/client/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/client/index.ts:260), R4 through adversarial-neighbour coverage at [tests](/home/inktomi/inktomi-stack/development/orbweaver/tests/db/client.int.test.ts:269)).
- The unified constraint classifier walks wrapped causes and distinguishes concrete constraint kinds ([packages/db/src/kit/db-errors.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/src/kit/db-errors.ts:67), R4 via real CHECK and NOT NULL violations at [tests](/home/inktomi/inktomi-stack/development/orbweaver/tests/db/kit/db-errors.int.test.ts:10)).

## Declared versus completed

| Declared surface | Strongest current evidence | Status |
| - | - | - |
| Complete registered Drizzle schema | R2: 29-module barrel and the 8,843-line snapshot / 1,362-line SQL baseline; R3: `createDb` supplies that namespace to Drizzle | implemented and registered in db; 24 direct schema suites now have a current R5 receipt |
| FK-safe migration lifecycle | R5: real migration, restoration, and orphan-check tests passed in the current direct run | implemented and meaningfully tested; live recovery remains excluded |
| File database backup lifecycle | R5: retention and adversarial filename tests passed in the current direct run | implemented and meaningfully tested; live backup/recovery path excluded |
| Read-only DB type / db-kit safety primitives | R2/R3 source and package boundary; R5 for constraint-classifier tests | implemented; complete consumer enforcement excluded |

## Tests and gates

The assigned suite comprises 26 integration tests (one 326-line client lifecycle suite, one db-errors suite, and 24 schema suites), with 0 unit, contract, CT, e2e, and type tests plus one schema support module. The client suite uses real `:memory:` or file libSQL and asserts both positive controls and failure paths, notably the orphan-FK planted control ([tests/db/client.int.test.ts](/home/inktomi/inktomi-stack/development/orbweaver/tests/db/client.int.test.ts:163), R4). The central testing law requires this real-db posture for integration tests ([docs/architecture/core/Spine-Testing.md](/home/inktomi/inktomi-stack/development/orbweaver/docs/architecture/core/Spine-Testing.md:52), law receipt).

The earlier root-wrapper attempt was not valid targeted evidence because it expanded to the entire node suite. The real direct Vitest integration run selected every assigned `.int.test.ts` file, excluded `integration-serial` after confirming none is in `SERIAL_INT`, and passed 26 files / 274 tests / 0 failures in 7.35 seconds on current working-tree bytes (R5; exact list and command in `commands.md`). The subsequently polled native AST lenses also completed: `prodonly db`, `orphans db`, and `testonly db` each reported no hits; `columns` scanned 748 columns/85 tables and reported 15 write-only candidates; `apisurface db` scanned 4,903 source files and reported 110 PUBLIC, 9 INTERNAL, 0 TESTONLY, and 0 UNUSED exports. The no-hit liveness results are structural evidence only. Package dependency declarations supply a resolve-time boundary ([packages/db/package.json](/home/inktomi/inktomi-stack/development/orbweaver/packages/db/package.json:16), R3); gate implementation/positive controls were excluded from the assignment.

## Cross-lane edges

- Server / integration owners should confirm whether the four direct-mirror gaps in LOWER-DB-01 have transitive domain coverage.
- Server / schema owners should triage the 15 write-only timestamp candidates in LOWER-DB-02; the completed lens is a candidate signal, not a deletion instruction.
- The `@orb/db` import graph has 1,123 resolved importer hits in 722 files; server-lane analysis owns whether those consumers preserve ownership/permission semantics.

## Tool receipts

`pnpm ast exports packages/db/src --files` found 119 exports in 35 files. `pnpm ast importers @orb/db --files` found 1,123 resolved importer hits in 722 files (R3). `pnpm ast cycles db` returned no result hits; its scope is the db package's alias-resolved import graph. Polled typed lenses completed as follows: `prodonly db` (50.6s, no hits), `orphans db` (95.8s, no hits), `testonly db` (72.7s, no hits), `columns` (152.9s, 15 candidates), `swallowed db` (26.1s, no hits and one reasoned exemption), and `apisurface db` (29.4s, 4,903 source files). See `commands.md` for exact commands and limitations.

## Lane verdict

The db package has a substantial implemented schema/client/lifecycle surface, package-boundary wiring, and a current R5 direct integration receipt: 26 files and 274 tests passed. FK enablement, migration restoration/integrity checking, and backup deletion blast radius have source-plus-test receipts. The package's 119 exports have no structural orphan/test-only/prod-unreachable hits, but 15 persisted columns are structurally write-only candidates requiring domain-owner review. Direct schema-test mirrors cover 24 of 28 non-barrel leaf schemas; that is a narrow coverage gap, not a claim that the other leaves have no domain tests. No live-runtime recovery or gate positive-control result is claimed.
