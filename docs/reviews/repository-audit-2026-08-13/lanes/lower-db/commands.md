# lower-db command receipt

All commands ran in `/home/inktomi/inktomi-stack/development/orbweaver` against the current dirty working tree at `e777c47e5860a105c114e061dcf98bcab1baa952`. No command was intended to modify product, test, configuration, or audit-lane files. The harness command below did write its normal ignored `reports/test-report.json` output before timing out; this lane did not modify or remove it.

| Command | Result | Coverage / note |
| - | - | - |
| `sed -n '1,$p' <each owned path> > /dev/null` | exit 0 | Full-streamed all 71 owned files: 22,285 logical text lines and 955,322 bytes. |
| bounded `sed` reads of the audit controls and eight non-ast shared files | exit 0 | Full read; detailed hash receipt is in `read-receipt.tsv`. |
| bounded `sed` reads plus `sed -n '1,$p' scripts/codemods/ast.ts > /dev/null` | exit 0 | Full read of the 4,099-line native AST tool before structural work. |
| `pnpm ast` | exit 0 | Confirmed available lenses and their scope/error semantics. |
| `pnpm ast exports packages/db/src --files` | exit 0 | 119 exports in 35 files. |
| `pnpm ast importers @orb/db --files` | exit 0 | 1,123 resolved importer hits in 722 files; output showed server composition/persistence and integration-test consumers. |
| `pnpm ast importers @orb/db/schema --files` | exit 0, 11.9s | 2 importer hits in 2 files: one server persistence consumer and `tests/support/db.ts`. |
| `pnpm ast importers @orb/db/kit --files` | exit 0, 13.3s | 134 importer hits in 97 files, including server persistence and assigned db tests. |
| `pnpm ast cycles db` | exit 0 | No alias-resolved intra-package cycle. |
| `pnpm ast prodonly db` | exit 0, 50.6s | No result hits: every db source file is in production entry closure. |
| `pnpm ast orphans db` | exit 0, 95.8s | No orphan-export result hits. |
| `pnpm ast testonly db` | exit 0, 72.7s | No test-only-export result hits. |
| `pnpm ast columns --max 200` | exit 0, 152.9s | 748 columns / 85 tables: 732 read-write, 15 reported write-only, 1 exempt candidate; 58 tables have opaque writers. |
| `pnpm ast swallowed db --max 200` | exit 0, 26.1s | No result hits; one candidate was reasonedly exempt. |
| `pnpm ast apisurface db --max 200 --public` | exit 0, 29.4s | Scanned 4,903 source files; 119 db exports: 110 PUBLIC, 9 INTERNAL, 0 TESTONLY, 0 UNUSED. |
| `pnpm ast aliases packages/db --files` | no verdict | An earlier compound command reached an initial-yield boundary before this final command ran; it was not needed for a load-bearing claim and was not treated as evidence. |
| `pnpm test tests/db/client.int.test.ts tests/db/kit/db-errors.int.test.ts` | no verdict | The root `pnpm test` script ignored the requested node-test paths and began its full node suite; it did not complete before the ceiling. It had already reported an unrelated failure in `tests/server/infra/providers/backends/local-light/model-cache.int.test.ts`. This is neither a lower-db result nor evidence against its tests. |
| `node_modules/.bin/vitest run --project integration <all assigned tests/db/*.int.test.ts>` | exit 0, 7.35s | 26/26 files passed; 274/274 tests passed; 0 failed. Vitest project membership was read from `vitest.config.ts`: none of the assigned files appears in `SERIAL_INT`, so `integration-serial` was correctly excluded. The command evaluated the current dirty working tree; post-run receipt remains 71 files, 22,285 lines, 955,322 bytes, 0 owned hash drifts. |

### Direct integration selection

```text
tests/db/client.int.test.ts
tests/db/kit/db-errors.int.test.ts
tests/db/schema/assets.int.test.ts
tests/db/schema/audit.int.test.ts
tests/db/schema/automation.int.test.ts
tests/db/schema/character.int.test.ts
tests/db/schema/chat.int.test.ts
tests/db/schema/credentials.int.test.ts
tests/db/schema/databank.int.test.ts
tests/db/schema/discovery.int.test.ts
tests/db/schema/embeddings.int.test.ts
tests/db/schema/gallery.int.test.ts
tests/db/schema/notifications.int.test.ts
tests/db/schema/persona.int.test.ts
tests/db/schema/preset.int.test.ts
tests/db/schema/rate-limit.int.test.ts
tests/db/schema/refinery.int.test.ts
tests/db/schema/rpg.int.test.ts
tests/db/schema/sdk-session.int.test.ts
tests/db/schema/sessions.int.test.ts
tests/db/schema/settings.int.test.ts
tests/db/schema/stats.int.test.ts
tests/db/schema/tag.int.test.ts
tests/db/schema/users.int.test.ts
tests/db/schema/workloads.int.test.ts
tests/db/schema/world-info.int.test.ts
```

## Literal cross-checks

The direct schema-mirror count is a comparison of the fully read assignment paths: 24 schema `.int.test.ts` files against 28 non-barrel schema source files. It is explicitly not a claim that the four remaining schemas are untested elsewhere. No repository-wide negative code claim is made from this literal count.

## Protocol drift

After this lane began, the audit controls changed. I re-read them fully and regenerated `read-receipt.tsv`: README SHA-256 moved from `315544…2669e` to `738833…062b`, and RUBRIC moved from `20afbc…ea218` to `04d081…4ac3`. The later rules required five-minute/polled broad AST runs and elapsed-time receipts; the completed rows above apply that rule.
