# Binary assets lane report

## Lane identity

- Lane: `binary-assets`
- Semantic scope: 83 owned raster assets: 50 design mocks, two review contact sheets, 14 Vite-public backgrounds, six Vite-public/PWA icons, and 11 bundled seed avatars.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (`assignment.txt`).
- Working-tree basis: current bytes read during this lane; rolling audit per `SNAPSHOT-POLICY.md`.
- Assigned files read: 92 / 92 (83 owned binary + 9 shared) = 100%.
- Assigned lines read: 5,630 / 5,630 assigned text lines = 100%; owned binary lines are `N/A` only in [read-receipt.tsv](read-receipt.tsv).
- Assigned bytes read: 24,452,188 / 24,452,188 current assigned bytes = 100%; owned bytes are 24,110,272 / 24,110,272 = 100%.
- Dirty assigned paths: 0 owned asset paths. One shared prerequisite drifted from assignment before its full read: `scripts/codemods/ast.ts` is now 4,495 lines / 246,175 bytes / `7f8dd900…`, versus 4,099 / 223,111 / `3fb78753…`; no owned asset changed.
- Formats: 69 PNG + 14 JPEG = 83 / 83. ImageMagick decoded all 83; ExifTool read all 83; no magic/extension mismatch or decoded-pixel duplicate group. Exact dimensions and hashes are in [read-receipt.tsv](read-receipt.tsv) and the command receipt.
- Exclusions: `SNAPSHOT-POLICY.md` was read as required but is not an assignment row. Other lanes' source and tests were consulted only to trace these assets; they are not audited here.

## Read receipt

[read-receipt.tsv](read-receipt.tsv) has one current SHA-256 row for every `assignment.txt` path: 92 / 92 paths. Its 83 owned rows intentionally record `N/A` for lines; text prerequisite rows use current `wc -l` counts. Assignment-to-current reconciliation found no drift among the 83 owned files (83 / 83 hashes and 24,110,272 / 24,110,272 bytes match); only the shared AST tool drifted.

## Architecture observed

The 14 public backgrounds are a direct Vite `public/` surface: the shared catalog names every `/backgrounds/*.jpg` URL at `packages/contracts/src/theme/seeded-backgrounds.ts:21` and `:28`, lists it at `:41`, and resolves it at `:47`. Structural refs reached the client picker, room label, client render resolver, and server automation composition (13 hits / 4,922 typed files; `pnpm ast refs listSeededBackgrounds` and `resolveSeededBackgroundUrl`). The client HTML directly names three icons at `packages/client/index.html:18`, and the PWA manifest names the other three at `packages/client/public/manifest.webmanifest:11` (R3).

The 11 PNG avatars are filesystem payloads owned by entry boot: `readSeedAvatar()` constructs `avatars/<handle>.png` at `packages/server/src/entry/boot/seed-assets/index.ts:34`; live composition calls it at `packages/server/src/entry/compose/assets-character.ts:289`, `:303`, and `:373` (R3). The current integration suite reads actual bundle bytes, stores them, and checks the complete default-card bundle at `tests/server/entry/boot/seed-avatars.suite.int.test.ts:133` and `:140` (R5); the separate persona arm reads `persona-you` at `tests/server/entry/boot/seed-default-persona.int.test.ts:72` (R5).

The 52 documentation assets are intentionally neither bundled nor served. `docs/design/mocks/README.md:24`, `:25`, and `:26` register the Waystone set, OSRS set, and both RPG shell versions as grouped design references (R3). This explains the 47 / 83 individual basenames with no direct textual filename mention: `rg -l -F` and tracked-file `git grep -I -l -F` agreed across the same 83-asset denominator. It is not evidence that those files are dead product assets.

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Design/reference imagery (52 docs assets) | 4 | 3 | 1 | 0 | 3 | high | 52 / 52 decodable; grouped reference registration at `docs/design/mocks/README.md:24`; visual inspection of representative OSRS, Waystone, contact-sheet assets; no runtime claim. |
| Vite public surface (14 backgrounds + 6 icons) | 5 | 4 | 4 | 1 | 4 | high | 14 catalog URLs at `packages/contracts/src/theme/seeded-backgrounds.ts:21`; icon declarations at `packages/client/index.html:18` and `packages/client/public/manifest.webmanifest:11`; Vite copied 20 / 20 with 0 SHA mismatch. |
| Boot avatar payloads (11 PNGs) | 5 | 4 | 5 | 3 | 4 | high | Reader `packages/server/src/entry/boot/seed-assets/index.ts:34`; live calls `packages/server/src/entry/compose/assets-character.ts:289`; current 13-assertion integration run. |

The scores are scoped to binary assets only. `0` in the documentation-reference enforcement column means there is no asset-specific gate, not that a runtime system is absent.

## Findings

No P0–P3 defect is established in the 83 owned assets. The only failed command was a transient AST tool crash during concurrent tree churn; its retry completed with a non-zero 4,922-file denominator, so it is recorded as a tool failure in [commands.md](commands.md), not promoted to an `instrument-defect` finding.

## Proven strengths

### BA-PS-01 — complete seed-avatar bundle reaches real storage

- Class: `proven-strength`
- Evidence rung: R5
- Confidence: high
- Scope denominator: 11 / 11 avatar PNGs; 10 default-character handles plus `persona-you`.
- Receipts: `readSeedAvatar()` forms the exact handle-derived pathname at `packages/server/src/entry/boot/seed-assets/index.ts:34`; the default-card completeness assertion is at `tests/server/entry/boot/seed-avatars.suite.int.test.ts:133`; the current targeted run passed 13 integration assertions, including real PNG storage/linking; the persona path is exercised at `tests/server/entry/boot/seed-default-persona.int.test.ts:72`.
- Established fact: every assigned seed avatar decodes, is addressable by the boot reader, and is covered by a current behavior run that stores actual bytes with image magic enforcement.

### BA-PS-02 — public image declarations and build output agree

- Class: `proven-strength`
- Evidence rung: R4
- Confidence: high
- Scope denominator: 20 / 20 Vite-public owned images (14 backgrounds, 6 icons).
- Receipts: all 14 background URLs are declared at `packages/contracts/src/theme/seeded-backgrounds.ts:21`; the client resolves a selected seeded id at `packages/client/src/features/app-shell/lib/resolve-theme-background.ts:23`; favicon declarations appear at `packages/client/index.html:18`; PWA dimensions/purpose agree with parsed raster dimensions at `packages/client/public/manifest.webmanifest:11`; current Vite build copied 14 / 14 backgrounds and 6 / 6 icons to `dist` with zero SHA mismatches.
- Established fact: the catalog/HTML/manifest names refer to existing, correctly dimensioned source assets that current build output preserves byte-for-byte.

## Declared versus completed

| Declared surface | Count | Strongest current evidence | Status |
| - | -: | - | - |
| Design/reference mock collection | 50 | R3 grouped documentation registration; 83/83 decode pass; visual inspection sample | Completed as a non-runtime reference collection; individual links are intentionally group-level. |
| Review contact sheets | 2 | R3 history/review references; 83/83 decode pass; visual inspection of avatar v2 sheet | Completed as review artifacts. |
| Static seeded backgrounds | 14 | R4 catalog → client resolver + exact Vite output copy; 52 contract assertions include default-card/catalog coupling at `tests/server/domain/character/seeder/cards.contract.test.ts:67` | Completed within this asset scope. |
| Browser/PWA icons | 6 | R4 HTML/manifest declarations + parsed 16/32/180/192/512 dimensions + exact Vite output copy | Completed within this asset scope. |
| Seed avatars | 11 | R5 boot reader → live composition → 13 current integration assertions | Completed within this asset scope. |

## Tests and gates

Four targeted test files passed: 13 integration assertions for boot-avatar/persona behavior, 52 contract assertions for the default-card/background-catalog coupling, and 12 unit assertions for SPA static-serving behavior (77 assertions total). Vite built 3,084 modules successfully and copied the 20 public images exactly. The asset scope has no dedicated positive-control gate for a catalog URL pointing to a source file; the Vite copy check proves emission, while the current contract test proves default-card slugs are catalogued. The documentation-reference collection has no behavioral test because it is explicitly non-runtime.

## Cross-lane edges

- The public-image URL catalog and renderer live outside this lane (`packages/contracts/src/theme/seeded-backgrounds.ts:21`, `packages/client/src/features/app-shell/lib/resolve-theme-background.ts:23`); their owners should retain a source-file existence assertion if catalog entries become editable.
- The initial `pnpm ast refs listSeededBackgrounds` failed because the concurrently changing tree temporarily exposed `packages/ui/src/__dc` to ts-morph. The immediately retried command succeeded. This is rolling-tree evidence only; the codemods lane owns any instrument diagnosis.

## Tool receipts

- `pnpm ast` was run bare first. Successful structural lenses had non-zero complete coverage: syntactic `ident` 4,812 files (`dts:2, ts:3,769, tsx:1,041`); typed `refs` 4,922 (`dts:2, mts:1, ts:3,877, tsx:1,042`). `readSeedAvatar` yielded 13 refs; `listSeededBackgrounds` 13; `resolveSeededBackgroundUrl` 5.
- Literal asset-name checks used `rg` plus `git grep` as the second engine. For the only negative result — 47 assets with no individual basename mention — both traversed the same 83 asset names; the explicit grouped docs registration above is the second contextual receipt.
- Image tools decoded/read 83 / 83: 69 PNG, 14 JPEG; zero format/magic mismatches and zero decoded-pixel duplicate groups. Metadata was limited to ordinary EXIF on four JPEGs plus one PNG CreateDate; no rotated image required correction.
- Full command lines, exits, elapsed times, and the one transient tool failure are in [commands.md](commands.md).

## Lane verdict

All 83 owned assets are byte-stable against the lane snapshot, decode correctly, and have expected format/dimension/naming properties. The runtime sets are demonstrably connected: 20 public images survive a current build byte-for-byte and 11 boot avatars pass current integration behavior. The 52 document assets are intentionally reference-only and grouped in their own README; their individual filenames are not a runtime wiring expectation. No P0–P3 issue is established. The largest residual uncertainty is deployed-browser fetching of actual generated public files, which was not exercised; current evidence is build plus targeted integration/unit behavior, not a production deployment.
