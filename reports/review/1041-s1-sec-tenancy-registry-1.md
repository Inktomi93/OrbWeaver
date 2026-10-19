# 1041 shard s1-sec-tenancy-registry-1 (type-registry, security)

Worktree `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/wf_d99749a9-c7a-1`, branch `wt/wf_d99749a9-c7a-1`, base `07d7dcccb3`.

Outcome: `ownerid-registry` and `table-scoping-class` are done and deleted. `membership-write-fan` is escalated: its native rule and composition-root test land, the gate stays.

## Prior work adopted

The stopped worker's tree (`wf_b2a8e8fa-466-1`) was ported by content diff against the shared base (the guard refuses `git -C` into another worktree, so the brief's `git add -N` / `git diff` spelling could not run; `diff -u` per changed path produced the same patch, applied with `git apply --3way`). Dropped from it: three planted schema edits (`discovery.ts` `ownerUserId` and `theme_clusters_v2`, `world-info.ts` `ownerId`), the `zz-plant1041.ts` barrel export, and an acquittal row that asserted a known gap (typed-parameter table target). Fixed in it: the composition-root test's co-member was never provisioned (FK failure at `redeemInvite`); two fixture companions (`native-schema-projection-delivery`, `native-member-consumers`) that would hit the singleton-family refusal (`tooling/src/verify/lib/policy-module.ts:79`). Added: the hand-kept `lib/tenancy-scope-rows.ts` copy was still in place beside the new registry; it is now deleted and the readers are rewired.

## Successor home

`packages/db/src/tenancy/index.ts` exports `TABLE_SCOPING` (`as const satisfies TableScopingRegistry`). The registry type is keyed by every SQLiteTable export of the schema barrel (`Db["_"]["fullSchema"]`), each row's `sqlName` is typed as that table's SQL name, and each row's `scope` is typed by the table's own columns: an `ownerId` column admits only `ownerId` (with a required `stamp`); an unstamped `chatId`, or `ROOM_TABLE` (`"chats" satisfies SchemaTableName`), admits only `membership`; every other table admits `junction | parent | global`. `tests/db/tenancy/index.test.ts` repeats these checks on the live schema with `getTableColumns` / `getTableConfig` and adds the foreign-key counts and non-empty reasons.

Rewired readers (data only, no analyzer logic): `tooling/src/verify/lib/tenancy-scope.ts#tableScopingClasses` now maps `TABLE_SCOPING` by `sqlName`; `contract/tenancy-scope.ts#ScopingRow.scope` takes `ScopingClass` from `@orb/db/tenancy`. KEEP `owner-scoped-reads` and the excluded `owner-scoped-writes` / `owner-scoped-upserts` read the same 110 rows with the same classes (scratch comparison before the move: 110/110 tables, identical scopes, 35/35 `ownerId` rows with stamps identical to the old `OWNERID_CLASSIFICATIONS`).

## ownerid-registry — done

- Successor: tsc over `TABLE_SCOPING` plus `tests/db/tenancy/index.test.ts` and `tests/db/tenancy/index.test-d.ts`.
- Red first: the strengthened `index.test-d.ts` against the ported, column-blind types: `node scripts/ts7.ts -p <scratch tsconfig>` exit 1, ten TS2554 at lines 22, 23, 27, 28, 33, 40, 41, 42, 44, 45 (stamped table under another class, unstamped table as `ownerId`, chat_tags as `membership`). After the type change: exit 0.
- Planted: `ownerId: text("owner_id")` on `worldEntries` (`packages/db/src/schema/world-info.ts`). tsc: `packages/db/src/tenancy/index.ts(498,45) TS2322 Type '"parent"' is not assignable to type '"ownerId"'`. Runtime: `pnpm test:scoped tests/db/tenancy/index.test.ts` exit 1, `stamped:worldEntries`. Removed.
- Parity: 5 mustFlag / 6 mustPass ported, 0 lost. The no-barrel mustPass is a declared limit that no longer applies (the successor always reads the whole barrel).
- Delta, not a loss: the gate judged every `sqliteTable(` call under `packages/db/src/schema/**`; the successor judges barrel exports, which are what drizzle-kit migrates (`packages/db/drizzle.config.ts` schema is the barrel) and what `Db` types. The FK-closure test proves no foreign key reaches a table outside the barrel; `db-structure` forces every schema module into the barrel.
- Deleted: `tooling/src/verify/gates/ownerid-registry.ts`, `tests/tooling/verify/lib/tenancy-scope-rows.test.ts`, its `biome.json` naming override, its `_liveness/product-db-server.ts` arm, its `schema-fact-wave-1` and `native-schema-projection-delivery` rows. `policy-conformance.test.ts` now borrows `domain-freshness-plane`'s `countFrom` row.
- Waivers and grants: 0 `@orb-waive` markers, 0 grant rows, no waiver-budget row. The `biome.json` override was scoped to the deleted file: removed-dead.

## table-scoping-class — done

- Successor: the same tsc registry and runtime test; the room tripwire is `ROOM_TABLE satisfies SchemaTableName` plus `LIVE_TABLES.get(ROOM_TABLE)` in the live test.
- Planted: new barrel export `s1Planted = sqliteTable("s1_planted", …)` and `themeClusters` renamed to `"theme_clusters_v2"`. tsc: `index.ts(540,12) TS2741 Property 's1Planted' is missing`, `index.ts(189,5) TS2322 '"theme_clusters"' is not assignable to '"theme_clusters_v2"'`. A stale row `s1PlantedStale`: `index.ts(500,3) TS2353`. Runtime: exit 1 with `misnamed:themeClusters`, `stamped:worldEntries`, `unclassified:s1Planted`. All removed.
- Parity: 4 mustFlag / 6 mustPass ported, 0 lost. The suite-only arms (registry stale side, unclassified side, chat_generation_observations coherence) are covered by the stale/unclassified rows and the column-typed classes.
- Deleted: `tooling/src/verify/gates/table-scoping-class.ts`, `tooling/src/verify/lib/tenancy-scope-rows.ts`, the gate-only `tableShapeOf` and `TableShape`, its liveness arm, its family-suite tests and its fixture companion entries.
- Waivers and grants: 0 markers, 0 grants, no budget row.

## membership-write-fan — escalate

- Landed, gate kept: native rule `orb/membership-write-fan` in `eslint.config.js` (scope `packages/server/src/domain/**` minus `domain/chat/**`, table set read from `TABLE_SCOPING` membership rows), `tests/tooling/verify/ops/membership-write-fan-native.test.ts`, and `tests/server/entry/compose/membership-room-fan.suite.int.test.ts` over the real composition root.
- Planted: removed `ctx.emitRoomRegexChanged(chatId)` from `packages/server/src/domain/regex/verbs/attachments/attach-to-chat.ts`. Int test exit 1, `silent = ["regex.attachToChat", "regex.attachToChat second"]`; `pnpm exec eslint --no-warn-ignored <file>` exit 1, `26:9 … orb/membership-write-fan`. A new-file plant under `domain/databank/verbs/attach/` also reds at `10:7`. Restored.
- Parity: 7 mustFlag / 8 mustPass; 5 mustFlag and 8 mustPass ported; 2 lost.
- Lost claim: mustFlag[1] (awaited `fanDatabankRoomsForDocument` on a union with a foreign arm) and mustFlag[3] (the same member on a foreign context) need the member's declaration origin; the untyped rule acquits any awaited call of that name. Also lost, outside any row: the gate resolves write targets through `resolveDrizzleTableRefs` (const aliases, `typeof` parameters, unions, re-exports); the rule sees only direct `@orb/db` / `@orb/db/schema` import bindings and namespace members.
- Reason: a missed mustFlag row is a lost claim. Closing it needs either a typed ESLint rule on the server program (one more type-aware rule; primary's call) or a D328 acceptance of the two arms. Until then the gate stays and both doors run.
- Waivers and grants: 0 markers; `REVIEWED_GRANTS_MEMBERSHIP_WRITE_FAN` is empty and stays as the retained gate's grant home.

## Checks

- `pnpm test:scoped tests/db/tenancy/index.test.ts`: pass.
- `pnpm test:scoped tests/tooling/verify/ops/membership-write-fan-native.test.ts`: pass.
- `pnpm test:scoped tests/server/entry/compose/membership-room-fan.suite.int.test.ts`: pass.
- `pnpm test:scoped tests/tooling/verify/gates/tenancy-scope-family.suite.test.ts`: pass.
- `pnpm test:scoped tests/tooling/verify/gates/schema-fact-wave-1.suite.test.ts`: pass.
- `pnpm test:scoped tests/tooling/verify/ops/policy-conformance.test.ts`: pass.
- `pnpm test:scoped tests/tooling/verify/ops/native-schema-projection-delivery.int.test.ts`: pass.
- `pnpm test:scoped tests/tooling/verify/ops/native-member-consumers.int.test.ts`: 4 pass, 2 fail. "union arm" fails identically (structure exit 2, expected 1) on restored source (HEAD gate, HEAD reader, HEAD test file): inherited. The first test timed out at its 60 s budget under a busy host; not separated.
- `node scripts/ts7.ts -p <scratch tsconfig: tests/db/tenancy/index.test-d.ts + packages/db/src/tenancy/index.ts>`: exit 0.
- `pnpm exec biome check <23 changed files> --diagnostic-level=error`: exit 0.
- Locked `pnpm typecheck --config tsconfig.json`: exit 1, three errors, all outside this change: `tests/legacy/inference/_support.ts(201,20)` TS2322, `tests/legacy/server/domain/embeddings/_support.ts(299,35)` TS2554, `tests/legacy/server/domain/search/_support.ts(296,33)` TS2554. Not reproduced on a clean tree (one typecheck per shard).
- `pnpm check:agents`: exit 1 on three dead `reports/review/*` links in `docs/plans/test-foundation/design.md`, none in the files this change edits.

## Owed to primary

- `pnpm lint:eslint-scoped` for `eslint.config.js` (foundation reselection).
- `pnpm typecheck --config tooling/tsconfig.json` and `--config packages/db/tsconfig.json`.
- `pnpm check:ledgers-fresh` to regenerate `docs/law/Core-Enforcement-Active-Gates.md` (two rows gone).
- `pnpm check:policy-conformance` and the real-corpus liveness runner for `_liveness/product-db-server.ts`.
- Whole-repo Knip (new `@orb/db/tenancy` subpath and `ROOM_TABLE` export).
