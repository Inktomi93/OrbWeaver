# Commands — docs-design-t-z

Snapshot assignment: `41e18afe74afa570b67a3e670a1a38863c486a00`. Current `HEAD` while audited: `dab3c8440f23ee23883897e446fe80e3838c9b29`.

## Full-read and receipt steps

- Read `AGENTS.md` and its authoritative `docs/architecture/core/AGENTS.md` import; the task-relevant shared prerequisites listed in `assignment.txt`; audit protocol (`README.md`, `RUBRIC.md`, `REPORT-TEMPLATE.md`, `WORKFLOW.md`, `SNAPSHOT-POLICY.md`); all five owned documents; and `scripts/codemods/ast.ts` before structural use.
- `wc -l -c` plus `sha256sum` on the five owned documents: `1012` lines, `72201` bytes; all five hashes exactly matched `assignment.txt` at close. `git diff --name-only -- <five owned paths>` was empty, so dirty assigned paths: `0`.

## Repository structural instrument

- `pnpm ast` — exit 0 in 0.7s. Read the bare usage; it reports its search corpora and scan counts per command.
- `pnpm ast refs resolveSteerFragments --max 120` — exit 0 in 18.6s parallel batch; 7 hits / 3 files. Complete corpus: `dts:2,mts:1,ts:3867,tsx:1038`, scanned `4908`, skipped `0`. Confirms contracts declaration plus both server composition seams.
- `pnpm ast refs buildTurnUserMacros --max 120` — same complete corpus; 28 hits / 8 files. Confirms declaration, turn/read/quiet consumers, and targeted tests.
- `pnpm ast refs userMacroDrawsSchema --max 120` — same complete corpus; 12 hits / 4 files. Confirms contracts schema, persistence read parsing, and contract assertions.
- `pnpm ast refs RpgTrackerDef --max 120` — same complete corpus; 101 hits / 28 files. Confirms contracts definition, client surfaces, server consumers, and mirrored tests.
- `pnpm ast refs DEMO_CHAT_PACK_VERSION --max 80` — complete corpus; 16 hits / 6 files. Confirms v3 source, migration/seed use, and tests.
- `pnpm ast callers migratePack --max 80` — harness corpus `dts:2,ts:3759,tsx:1037`, scanned `4798`, skipped `0`; 2 live calls in the character and chat seeders.

## Literal cross-checks and reads

- Read current source excerpts at the receipts cited in `report.md`, including the user-macro registry/build, persistence parser, steer resolver, demo seeder, tracker schema, game-tab editor, dev runner, TypeScript/Biome configuration, and relevant test sites.
- Narrow literal cross-check: `rg` over root package/config and source/test paths, with `node_modules` and `scripts/probes/st-goldens` excluded. It confirmed the implemented per-chat `user_macro_values` column, `setUserMacroValues` wire/verb/client paths, `macro_draws` persistence, and tracker replacement references.
- One initial broad `rg` unintentionally descended into vendored `scripts/probes/st-goldens/**`; its output was discarded as out of scope and used for no finding. The narrow rerun above is the only literal-search evidence used.
- A display-only tracker literal search was piped through `sed` for output bounding. It was treated as a sample only and supports no absence or count claim.

## Safe verification

- `pnpm check:docs` — exit 0 in 2.6s: `check:docs — 104 file(s) formatted`.
- No source behavioral command was run: this is a documentation-only lane with no touched executable paths, and `pnpm test` is the unscopeable combined node+CT suite. Existing current test source is R4 evidence, not an execution receipt; no R5 claim is made.

## Tool failures

None. The discarded broad literal-search scope escape is recorded above as a command-quality issue, not a tool failure.
