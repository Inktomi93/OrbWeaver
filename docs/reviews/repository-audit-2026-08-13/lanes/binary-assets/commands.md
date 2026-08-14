# Binary-assets command receipt

All commands ran from the repository root. Durations are wall-clock values returned by the command runner.

| Command / method | Exit | Duration | Result |
| - | -: | -: | - |
| `sha256sum` + `stat` + `file --mime-type` over every path in `assignment.txt` | 0 | 0.6s | Read all 92 assigned paths; 83 owned assets were 69 `image/png` + 14 `image/jpeg`. |
| Assignment-vs-current `stat`/`sha256sum` reconciliation | 0 | 1.9s | All 83 owned files stayed at 24,110,272 bytes and matched snapshot hashes. One shared drift: `scripts/codemods/ast.ts`, 223,111 → 246,175 bytes and 4,099 → 4,495 lines. |
| Fresh SHA-256 receipt generation | 0 | 6.9s | Wrote `read-receipt.tsv`: 92/92 assignment paths, 83 owned binary rows with `N/A` lines. |
| `pnpm ast` (bare) | 0 | 1.2s | Read tool usage and scan-ledger contract before targeted lenses. |
| `identify` decode/dimension/channel pass over 83 owned assets | 0 | 1.1s | 83/83 decoded; dimensions, depth, and channels recorded in terminal output. ImageMagick warned that this installed version lacks `%[profiles]`; its exit was 0, and metadata was rechecked with ExifTool. |
| `exiftool` metadata pass + ImageMagick decoded-pixel signature grouping + magic/extension reconciliation | 0 | 3.4s | 83 images read; no decoded-pixel duplicate groups; no extension/magic mismatches. Four JPEGs carry only normal-orientation EXIF; one PNG has a CreateDate. |
| `pnpm ast ident seedAssets`, `pnpm ast ident backgrounds` | 0 | 46.0s | Two complete syntactic scans, each 4,812 files (`dts:2, ts:3,769, tsx:1,041`); `seedAssets` 0, `backgrounds` 21. The former is not a negative claim about string paths because `ident` excludes strings. |
| Literal asset-root consumer sweep (`rg -n -F`) | 0 | 46.0s | Located public URL, icon, seed-reader, and documentation consumers; literal strings use `rg`, not the structural tool. |
| Per-owned-basename literal sweep (`rg -l -F`) and tracked-file cross-check (`git grep -I -l -F`) | 0 | 7.2s | 47/83 assets have no individual filename mention outside their file; both engines agree. `docs/design/mocks/README.md:24-26` intentionally describes those as grouped design-reference sets. |
| `pnpm ast importers ../boot/seed-assets/index.ts` | 0 | 24.3s | Complete 4,812-file scan; 2 structural importers. |
| `pnpm ast refs readSeedAvatar` | 0 | 24.3s | Complete typed 4,922-file scan (`dts:2, mts:1, ts:3,877, tsx:1,042`); 13 refs, including live composition reads and integration tests. |
| `pnpm ast refs listSeededBackgrounds` (first attempt) | 1 | 0.0s after preceding 24.3s process | **Transient tool failure:** uncaught `DirectoryNotFoundError` for concurrently absent `packages/ui/src/__dc`; no verdict taken. |
| `pnpm ast refs listSeededBackgrounds` (retry) | 0 | 26.1s | Complete typed 4,922-file scan; 13 refs, including client pickers and server automation composition. |
| `pnpm ast refs resolveSeededBackgroundUrl` | 0 | 22.7s | Complete typed 4,922-file scan; 5 refs, including client render-time resolution. |
| `pnpm exec vitest run --project integration --project integration-serial` on the two seed-asset suites | 0 | 3.8s | 2 files, 13 assertions passed using actual bundled avatar bytes. |
| `pnpm exec vitest run --project contract tests/server/domain/character/seeder/cards.contract.test.ts` | 0 | 2.1s | 1 file, 52 assertions passed; every default-card seeded background slug is in the catalog. |
| `pnpm exec vitest run --project unit tests/server/entry/http/spa.test.ts` | 0 | 3.8s | 1 file, 12 assertions passed, including name-stable public static files. |
| `pnpm --filter @orb/client build` | 0 | 26.1s | Vite transformed 3,084 modules and completed. It emitted two non-fatal existing chunk/plugin warnings. |
| Source-to-`dist` public-image SHA reconciliation | 0 | 0.3s | `backgrounds`: 14 source / 14 dist / 0 hash mismatches; `icons`: 6 / 6 / 0. |
| `node scripts/docs/format-md.ts --check` on the two Markdown artifacts (first pass) | 1 | 0.4s | Both newly written artifacts needed formatting; no content or source defect inferred. |
| `node scripts/docs/format-md.ts --write` then scoped `--check` | 0 | 1.2s | Formatted 2 / 2 and confirmed both are compliant. |

## Exclusions and limits

- The assignment has 83 owned binary files and nine shared text prerequisites. `SNAPSHOT-POLICY.md` was also read as directed but is not an `assignment.txt` row, so it is not part of the 92-path receipt denominator.
- The 50 design mocks and two review contact sheets are documentation/reference assets, not built or served product files; their grouped documentation references are assessed separately from runtime consumer claims.
- No browser/live-server test fetched the actual generated public images. The current Vite build byte-copy reconciliation and the SPA static-serving test are build/integration evidence, not a deployed-runtime receipt.
