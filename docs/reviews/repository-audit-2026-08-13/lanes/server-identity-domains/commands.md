# Command receipt

All commands ran against working-tree bytes on 2026-08-13. The lane did not modify source, tests, configuration, gates, or any sibling lane artifact.

## Read / ledger controls

| Command | Result |
| --- | --- |
| Full `sed -n '1,999999p'` stream of `assignment.txt`, audit controls, and eight non-AST shared prerequisites | exit 0; 9 prerequisite files read in full before source analysis. |
| `awk` assignment reconciliation | 263 OWNED, 20,858 text lines, 1,094,138 bytes; 9 SHARED. |
| `sha256sum -c` over every assignment row | exit 0; 272/272 current SHA-256 values matched the frozen ledger. |
| `git status --short -- <all owned paths>` | no owned dirty paths. The repository was otherwise dirty; it was left untouched. |
| Full `sed -n '1,999999p'` stream of every OWNED path | exit 0; 263/263 files, 20,858/20,858 lines, 1,094,138/1,094,138 bytes. |
| Full `sed -n '1,999999p' scripts/codemods/ast.ts` | exit 0, completed after the owned-file barrier. |

## AST receipts

| Command | Result |
| --- | --- |
| bare `pnpm ast` | exit 0 in 1s; learned the repository wrapper and its scope/error semantics. |
| `timeout 300 pnpm ast apisurface packages/server/src/domain/character --max 200` | exit 0 in 28s; scanned 4,903 source files; 133 own exports, 1 public and 132 internal, 0 unused. Candidate-only API classification; not treated as a defect. |
| `timeout 300 pnpm ast apisurface <connection|credentials|persona scopes> --max 200` | each scope was launched with a 300s ceiling and polled to process completion; not used for a negative claim because their terminal output was not retained after the interactive tool yield. |
| `timeout 300 pnpm ast callers createCharacterService --max 80` | exit 0 in 5s; live composition call at `packages/server/src/entry/compose/assets-character.ts:209`. |
| `timeout 300 pnpm ast callers createConnectionService --max 80` | exit 0 in 5s; live composition call at `packages/server/src/entry/compose/services.ts:340`. |
| `timeout 300 pnpm ast callers createCredentialsService --max 80` | exit 0 in 4s; live composition call at `packages/server/src/entry/compose/services.ts:327`. |
| `timeout 300 pnpm ast callers createPersonaService --max 80` | exit 0 in 5s; live composition call at `packages/server/src/entry/compose/search-discovery.ts:218`. |
| `timeout 300 pnpm ast orphans packages/server/src/domain/character --max 100` | exit 0 in 20s; no results. This narrow clean result is not generalized beyond the character scope. |
| `timeout 300 pnpm ast orphans <connection|credentials|persona scopes> --max 100` | each scope was launched with a 300s ceiling and polled to process completion; no absence claim is based on their unretained terminal output. |

Literal corroboration was deliberately confined to owned source paths: `rg -l 'userId|ownerId|owner_id|Unauthorized|NotFound' packages/server/src/domain/{character,connection,credentials,persona}` found 84 source files; the subsequent line-receipt search covered only owned persistence, service, and verb paths. It supports the positive ownership receipts in the report, not a global clean claim. `rg --files` counted 147 owned domain-source files and 102 owned test/support files.

## Behavioral receipts

Vitest membership was read from `vitest.config.ts`: owned tests belong to `unit` (plain `.test.ts`), `integration` (`.int.test.ts`; none of this lane are in `SERIAL_INT`), or `contract` (`.contract.test.ts`). No lane-owned type, parity, CT, or e2e test path exists.

| Direct command | Result |
| --- | --- |
| `pnpm exec vitest run --project unit <20 owned unit paths>` | exit 0 in 2s: 20 files, 152 tests passed. |
| `pnpm exec vitest run --project integration --reporter=dot <76 owned integration paths>` | exit 0 in 23s: 76 files, 388 tests passed. |
| `pnpm exec vitest run --project contract <2 owned contract paths>` | exit 0 in 1s: 2 files, 55 tests passed. |

The first integration invocation used the default reporter and its captured output ended before the aggregate footer, so it is not an official pass receipt; the complete direct `--reporter=dot` rerun above is the sole official integration result. No command had a tool failure, test failure, timeout, snapshot update, or root-wrapper invocation.

## Scope and exclusions

The lane inspected no sibling-owned implementation, test, config, or gate file. Composition-root paths appear only as AST `callers` receipts. Enforcement-gate implementation and registration are owned by the gates lanes; the `@owner-scope-write-ok` waivers observed in this lane are handed off below rather than claimed as independently validated.
