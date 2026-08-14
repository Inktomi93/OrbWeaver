## Lane identity

- Lane: `server-content-domains`
- Semantic scope: server asset storage/GC and portability, databank ingestion/retrieval, imagery generation, and profile import, with their 87 mirrored tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`
- Working-tree basis: working-tree bytes; all 216 assigned hashes match `assignment.txt`.
- Assigned files read: 216 / 216 (100%; 129 source + 87 tests)
- Assigned lines read: 21,414 / 21,414 (100%)
- Assigned bytes read: 1,085,492 / 1,085,492 (100%)
- Dirty assigned paths: 0 (`git status --short -- <all owned paths>` produced no rows)
- Exclusions: none inside the assigned set; router/client composition is an explicitly reported cross-lane edge.

## Read receipt

`read-receipt.tsv` has 216 data rows totaling 21,414 lines and 1,085,492 bytes, equal to `assignment.txt`; every checksum currently matches its snapshot assignment. The full-read barrier included all source, all mirrored tests, shared law, and `scripts/codemods/ast.ts` before structural work.

## Architecture observed

The four domains use the same contract → persistence/substrate/verbs → service shape: the service collects verb factories, then server entry composition consumes it. Resolution-aware AST receipts establish live entry consumers for `createAssetsService` at `packages/server/src/entry/compose/assets-character.ts:34`, `createDatabankService` at `packages/server/src/entry/compose/databank.ts:12`, `createImageryService` at `packages/server/src/entry/compose/imagery.ts:32`, and `createImportService` at `packages/server/src/entry/compose/portability.ts:20` (R3, `pnpm ast apisurface …`). Asset persistence explicitly classifies retaining and derived asset references at `packages/server/src/domain/assets/persistence/asset-refs.ts:22` and `:38`; its current integration test introspects the live schema and rejects unclassified or phantom entries at `tests/server/domain/assets/persistence/asset-refs.int.test.ts:51` and `:61` (R5).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Assets (41 source, 32 tests) | 4 | 3 | 4 | 4 | 3 | high | `packages/server/src/domain/assets/persistence/asset-refs.ts:22`, `tests/server/domain/assets/persistence/asset-refs.int.test.ts:51`, compose consumer above; focused integration runner passed (R5). |
| Databank (34 source, 26 tests) | 4 | 3 | 4 | 2 | 3 | high | `packages/server/src/domain/databank/contract/service.ts:94`, `packages/server/src/domain/databank/service.ts:32`, compose consumer above; focused integration runner passed (R5). |
| Imagery (20 source, 13 tests) | 4 | 3 | 4 | 2 | 3 | high | `packages/server/src/domain/imagery/service.ts:13`, `packages/server/src/domain/imagery/verbs/generate-picture.ts:154`, compose consumer above; focused integration runner passed (R5). |
| Import (34 source, 16 tests) | 4 | 3 | 4 | 2 | 3 | high | `packages/server/src/domain/import/service.ts:20`, `packages/server/src/domain/import/loader/collect.ts:466`, portability consumer above; focused runner passed (R4–R5 by executed test tier). |

## Findings

### SCD-01 — imagery compatibility re-exports have no production consumer

- Severity: P3
- Class: architecture-drift
- Confidence: high
- Evidence rung: R4
- Scope denominator: 55 imagery own exports across 20 source files; 53 are internal, 2 test-only, 0 unused (`pnpm ast apisurface packages/server/src/domain/imagery --max 200`, 4,903 source files scanned).
- Receipts: `packages/server/src/domain/imagery/substrate/templates.ts:15`; `packages/server/src/domain/imagery/substrate/templates.ts:19`; `packages/server/src/domain/imagery/substrate/templates.ts:20`; `tests/server/domain/imagery/substrate/templates.test.ts:8`; `:16`; `pnpm ast testonly packages/server/src/domain/imagery --max 200`; literal cross-check recorded in `commands.md`.
- Established fact: the comment says these exports preserve “every existing consumer’s import path,” but both `PROMPT_TEMPLATES` and `CAPTION_INSTRUCTIONS` resolve as test-only; the assigned unit test is their only importing consumer. Production code consumes their `@orb/contracts/imagery` sources directly.
- User or system impact: no runtime defect demonstrated. The false compatibility story leaves two dead server exports and makes future maintainers believe the server path remains part of the shipped prompt surface.
- What remains unverified: externally run scripts outside tracked TypeScript source could import this deep server file; the declared workspace entry points and resolution-aware production graph found none.
- Suggested next check or fix: delete the re-exports and point the assertions at `@orb/contracts/imagery`, or retain them as a deliberate test seam but rewrite the comment to say that.

## Proven strengths

- **Asset-FK classification is a current R5 regression barrier.** `ASSET_REFS` and `DERIVED_ASSET_COLUMNS` encode the two GC outcomes (`packages/server/src/domain/assets/persistence/asset-refs.ts:24`, `:40`); the current integration test derives all `assets.id` FKs from the real schema and asserts complete, non-phantom, disjoint classification (`tests/server/domain/assets/persistence/asset-refs.int.test.ts:51`, `:61`, `:66`). It passed in the 83-file focused run.
- **All assigned runtime tests are currently green.** The corrected direct Vitest runner passed 83 owned unit/integration files and 472 tests in 19.89s (R5 for executed integration coverage; R4 for unit-only paths). Unit substrate paths and database-backed integration verbs are both represented; no assigned contract or integration-serial files exist.

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Asset reference registry | R5: current schema-introspection integration assertions | completed in lane scope |
| Asset service and portability verbs | R5: service/composition edges + focused integration suite | completed in lane scope |
| Databank ingest, query, scrape, attach, and service verbs | R5: composed service edge + focused integration tests | completed in lane scope |
| Imagery generation/edit/extraction service | R5: composed service edge + focused unit/integration tests | completed in lane scope |
| Profile import collection and import verbs | R4: portability composition edge + focused unit tests | completed in lane scope |
| `PROMPT_TEMPLATES` / `CAPTION_INSTRUCTIONS` compatibility exports | R4: test-only export evidence | declared compatibility is not wired in production (SCD-01) |

## Tests and gates

The direct behavioral command passed **83 files / 472 tests** across `unit` and `integration`. These include 32 assets, 26 databank, 13 imagery, and 16 import assigned test files. `pnpm check:tests-membership` passed (1,858 type-covered test files) and `pnpm check:tests-execution-membership` passed (1,689 execution-matched test files). No owned `integration-serial` or contract files were assigned. The failed first Vitest command was argument validation (`--runInBand` is not a Vitest 4 option), not a test failure; its canonical reports were inspected and were not attributed to the lane (details in `commands.md`).

## Cross-lane edges

`pnpm ast unwired` (369 procedures enumerated) reports five candidates whose routers/client consumers are outside this lane: `databank.attachToCharacter` and `databank.detachFromCharacter` at `packages/server/src/transport/trpc/routers/databank.ts:101` and `:107`; `imagery.editImage`, `imagery.extractPrompt`, and `imagery.readProvenance` at `packages/server/src/transport/trpc/routers/imagery.ts:34`, `:57`, and `:77`. This is a CANDIDATE structural lens, not a defect conclusion; transport/client owners must verify typed-proxy or non-source consumers.

## Tool receipts

Repository-native `pnpm ast` provided symbol resolution and workspace scan coverage: each `apisurface` scan covered 4,903 source files. Outputs: assets 92 internal / 1 test-only, databank 83 internal, imagery 53 internal / 2 test-only, import 94 internal; all four exact-scope orphan scans returned no result. A literal `rg` search cross-checked all three test-only symbols. See `commands.md` for commands, exits, durations, stale artifact handling, and exclusions.

## Lane verdict

All 216 assigned files were fully read and hash-reconciled; the direct owned behavioral suite is green (83 files, 472 tests). Assets carry a meaningful live-schema GC safety test, while all four domains show resolved service-to-entry composition edges. No owned orphaned exports were reported by the repository resolver. One P3 documentation/architecture-drift finding remains: imagery’s two server compatibility re-exports are test-only despite claiming production compatibility. The main remaining uncertainty sits outside this lane: five tRPC procedure candidates require router/client-owner verification.
