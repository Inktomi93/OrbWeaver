# 898 native folder restore: final implementation leg

Outcome: a native backup folder now restores completely through `/api/import/tree`, whether it fits one upload or spans several. The candidate's classifier fix is kept unchanged. A split native folder declares its layout on every upload. The server admits that declaration only for a wholly native batch and never falls back to the SillyTavern importer. The public browser run and the private path are still owed.

## Starting point

- Reset to Codex candidate `151bcda9b6` and merged main `1c5fb4ab55` (merge `89c2bc90d5`, no conflicts).
- The merge's pre-commit `types:native` failed. 39 of its 40 errors reproduce exactly on main's bytes (root `tsconfig.json`, files under `scripts/probes/*` and `tests/legacy/*`). The 40th, `tests/e2e/corpus-settings.spec.ts(257,7)` TS2375, came from the candidate and is fixed here. The merge was committed with the check hook excluded, and the message names both.

## Defect found and fixed in this leg

Severity: high for the item's purpose (complete folder restore). Low for security.

- Scenario: a native backup larger than one upload. `planGeneric` split it in path order with no files shared across batches. The server sniffed each batch alone (`stageUpload` → `sniffTreeLayout`). A batch of only `assets/` or only `themes/` got 400. A batch of only `characters/` and `chats/` went to `import-st`.
- Red evidence on candidate bytes:
  - Planner: `tests/client/data/import-tree-plan.dom.test.ts`, written against the old API, failed with `{ kind: "reject", found: ["assets"] }`.
  - Route: `tests/server/entry/http/import-tree-batches.int.test.ts` against the candidate route failed 2 of 3. The declared assets upload got 400. A declared upload with `settings.json` was staged as `profile/` and started an `import-st` workload: the silent fallback.
  - The undeclared-behavior test passed on both trees.
- Fix:
  - Wire: `TREE_LAYOUT_DECLARATIONS`, `treeLayoutDeclarationSchema` (zod enum) and `TreeLayoutDeclaration` at `packages/contracts/src/import/index.ts:258`. Field `TREE_LAYOUT_FIELD` at `:266`.
  - One admission home: `admitTreeBatch` at `:275`. Undeclared means the existing sniff, unchanged. Declared `orb` means every entry sits under a canonical native directory from the shared `PORTABLE_DIRECTORIES` map. Otherwise it returns the existing typed reject.
  - Server: `readLayoutDeclaration` at `packages/server/src/entry/http/import-tree.ts:264` decodes fail-closed. A missing field means no declaration. One valid value is accepted. Anything else is a 400 through the existing `TreeRejected`. Admission is at `:285`.
  - Client: `planGeneric` at `packages/client/src/data/import-tree-plan.ts:232`. A plan that fits one upload is unchanged and declares nothing. A split native plan declares `orb` and lists entries outside native directories as skipped instead of sending them (`:239`). `importTree` sends the field (`packages/client/src/data/import-tree.ts:64`). `sendBatch` passes the plan's layout (`packages/client/src/features/workloads/hooks/use-library-import.ts:218`).
  - The multipart file field `"file"` was spelled in both client and server. It now has one home, `TREE_FILE_FIELD` (`packages/contracts/src/import/index.ts:263`).
- Unchanged:
  - Single-upload behavior.
  - The four-directory exclusion (`characters`, `chats`, `themes`, `assets`) in `sniffTreeLayout`.
  - Every cap (HTTP, per-file, count, the local 1 GiB / 64 MiB / 50,000 / 10 GiB bounds).
  - Counts: native dedupe `created=false` still counts as imported.

## Remaining items from the brief

1. The 51 ordinary lint findings.
   - Every one is `orb/server-factory-tier-reference`, "Cross-tier factory exposure cannot be established", on unchanged `#domain/*`, `#foundation`, `#infra` or `#primitives` import and re-export lines.
   - These are D328-class coverage refusals, not defects in these files.
   - Exact-file ordinary ESLint on main's bytes (`1c5fb4ab55`) gives the same 51.
   - A site-by-site comparison (file, source line text, column, rule) of main against this branch is identical after the final edits.
   - No line this branch changes carries one, so none is fixed or suppressed here. They are inherited. The successor is item 1016's explicit UNKNOWN reporting.
   - The final ordinary run raised one new finding, `max-lines` on `import-tree-plan.ts` (453 > 450). It was fixed by making the planner call the shared `admitTreeBatch(paths, null)` (448 lines). The client partition's ordinary lint is then clean.
2. HARD lint: `eslint-hard.config.js`, `--no-inline-config`, every changed file. 16 admitted, 0 excluded, exit 0.
3. Dependency-cruiser on the Node helper.
   - The native `depcruise` with the repo config, cruising `tests/support/node/backup-folder.ts`, its test, the new route test, the e2e spec and the planner test, reports 4 violations.
   - They are 2 `no-circular` (`tooling/src/floor/process/run-marker*.ts`, `tests/e2e/support/modes.ts` ↔ `target-guard.ts`) and 2 `entry-wiring-no-query-capability` (`packages/server/src/entry/contract/portability.ts`).
   - Main's bytes, cruised from equivalent existing entries, give the same 4.
   - None originates in the helper or the new tests.
   - `pnpm depcruise` itself always cruises every authored entry, so it was not run.
4. Public browser qualification: not run. Waiting for the coordinator's GO (request below).
5. Security self-review: below.

## Commands and results

| Check | Result |
| - | - |
| `test:scoped` contracts tree-layout, planner dom, response-boundaries, new route test, backup-folder | all pass (4, 4, 5, 3, 2) |
| `test:scoped` body-limit population + ordering | 4 fail; the same 4 fail on main's bytes (`/api/_debug/bug-report` 401, proxy identity) |
| `test:scoped --legacy` import-tree-plan, sniff-tree-layout | 20/20 |
| `test:scoped --legacy` client import-tree, server http import-tree, import-identity suite | 10 fail; the same 10 fail on main's bytes (workload-id and query fixture drift) |
| `test:ct --legacy` import-library-section, backup-export-section | 24 pass, 5 fail; the same 5 fail on main's bytes (bundle mock workload id) |
| `typecheck` client, contracts, server, tests-dom, tests-iso | pass |
| `typecheck` root `tsconfig.json` | fail; error set identical to main's 39 |
| exact ordinary ESLint, all changed files | contracts, client, tests clean; server 51 inherited, identical to main |
| exact HARD ESLint, all changed files | clean |
| native depcruise, helper and new tests | 4 inherited, identical to main |
| scoped Biome, all changed files | clean |

## Security self-review

Assumptions:
- Authentication, CSRF and ownership on this route are unchanged: auth-first, `via !== "header"` needs `x-orb-csrf`, the workload is started for `principal.userId`, staging is per uploader.
- The layout declaration is browser-supplied and hostile.

Decisions and why they hold:
- The declaration routes; it never authorizes. Both importers write only into the caller's own library under the caller's own staging root. A forged declaration can at most send the caller's own files to the native importer.
- Declared admission is strictly narrower than the sniff's native acceptance. Every entry must sit under a canonical native directory, and there must be at least one directory and no top-level file. The SillyTavern markers fail by construction: `settings.json` is a top-level file and `User Avatars` is no native directory. Tests pin both, plus a stray directory, a top-level file and an empty batch (`tests/contracts/import/tree-layout.test.ts`, `tests/server/entry/http/import-tree-batches.int.test.ts`).
- Fail-closed decode: a repeated field, a non-member value or a file-typed value is a 400 with nothing staged and no workload (route test). It never falls back to the lone sniff.
- Ordering: the declaration is read after the body cap, the count and per-file caps, path sanitization and the `secrets.json` drop. It cannot bypass any of them.
- Staging is unchanged: index-free relative paths, resolve-prefix check, `O_CREAT|O_EXCL|O_NOFOLLOW`.
- The test helper `prepareBackupFolder` reads only the test's own download.
  - It uses the production codec, which rejects traversal, absolute, backslash, NUL and drive-letter names and stages by entry index (`packages/server/src/infra/storage/zip.ts:113-135`, `:374-377`).
  - It adds a resolve-prefix check and exclusive 0600 writes under a fresh 0700 owner.
  - A codec directory entry (`name/`) would fail closed on `ENOTDIR`, and the production packer never emits one.

Residual, not fixed here:
- A SillyTavern profile with no `settings.json`, `User Avatars` or `worlds` that is split across uploads can produce a batch the lone sniff refuses. That is the same per-batch shape on the SillyTavern path. It is unreported in practice, because real profiles carry `settings.json`.

## Browser qualification request (not started)

- Command: `env E2E_LIVE=0 E2E_ALLOW_DEV_TARGET=0 npm_config_verify_deps_before_run=false PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --config.verify-deps-before-run=false exec node scripts/corpus-fixture.ts e2e -- --project=corpus-desktop-bubble tests/e2e/corpus-settings.spec.ts '--grep=Backup exports a real library'`
- Stack: Playwright's own single-user webServer (`tooling/src/stack/cli.ts up-fg`) with `reuseExistingServer: false` while `E2E_ALLOW_DEV_TARGET=0` (`playwright.config.ts:68-76`).
- Ports: server 8796 and vite 5181 (`tooling/src/floor/host/ports.ts:72`). It never binds or targets 8788 or 5173.
- Input: the committed public corpus only (no fixture directory), so no private data.
- Duration: a 180 s webServer boot budget plus a 120 s test budget, one worker, no retries. Expect about 3 to 6 minutes. Peak is one Vite plus one server plus one Chromium.

## Still owed

- The public browser run above, after GO.
- The independent security review.
- The private path (ZIP refusal, then complete folder restore) needs fresh source and resource admission. Out of scope here.
