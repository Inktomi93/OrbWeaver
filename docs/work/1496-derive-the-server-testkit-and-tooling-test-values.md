---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# Derive the server, testkit and tooling test values the derivation audit found copied

## What

The same audit's shard-b report (reports/test-derivation-audit/shard-b.md). P2: the data-layout cross-device case that runs zero times if two LEGACY_ENTRIES names change (migrate-data-layout.int.test.ts:274); hand-listed rosters of RPG config knobs, host-gated RPG verbs and chat read verbs (update-config, authority.suite, read-gates); the seed-theme COLOR_FIELDS table. P3: the plugin provider-id prefix in six files, the secret-box key, unseeded mintTypeId calls, the summarizer reply format written nine times, nine bare rejects.toThrow() refusals, direct row reads in surface-data.int.test.ts, the planted tsconfig block in the unwired tooling tests.

Scope is the whole file, not only the audit rows. Rewrite each test file the newest additions touched onto the testkit: every helper a file defines locally moves to its testkit home under `tests/support/` in the right world (`iso`, `node`, `browser`) and is published through the door its callers need, with duplicates merged to one; every value, roster, table and shape derives from production; every seed runs a production verb, a root seed or a corpus builder; every case mounts the real door. A file whose cases already meet this is left alone.

## Why

Spine-Testing sections 3 and 9; each P2 lets a new verb, knob or entry go untested.

## Done when

No test file in scope defines a helper that belongs in the testkit or another file already defines. Every shard-b row is fixed or ruled with a cited reason; each roster is an exhaustive Record over the production union or derived from the production registry so a new member fails tsc; the zero-run case fails when its entries are renamed; repeated helpers have one testkit home.

## Evidence

Row numbers are the rows of reports/test-derivation-audit/shard-b.md.

### Fixed

| Rows | Fix |
| - | - |
| 50, 51 | `tests/server/entry/boot/persistence/migrate-data-layout.int.test.ts` runs the cross-filesystem case for every directory entry of `LEGACY_ENTRIES` and fails when that set is empty. The linked-container and crashed-boot cases take their entry from the table. Every refusal asserts the new `DataLayoutRefusal` class and its `reason` (`packages/server/src/entry/boot/migrate-data-layout.ts`, listed in `TEST_CONSTANT_HOMES`). |
| 52 | The keeper subdirectory comes from `DATA_LAYOUT_DIRS`; the db snapshot rule keys on the db entry. |
| 41 | `tests/server/domain/rpg/verbs/update-config.int.test.ts` types its knob table as a `Record` over `keyof RpgConfigView` minus the fields other cases own. |
| 39 | `tests/server/domain/rpg/verbs/authority.suite.int.test.ts` has one row per `keyof RpgService`: host call, member call, or the case that owns it. The host verbs that had no gate case now have one. |
| 23, 22 | `tests/server/domain/chat/verbs/read-gates.int.test.ts` classifies every `keyof ChatService`; the inspector and room-read tables are typed from that classification. The refusal code is `CHAT_OP_CODES.notHost`. |
| 43 | `THEME_OVERRIDE_COLOR_VARS` in `packages/ui/src/content/theme-scope/emit-vars.ts` is the override-field to CSS-var table, and `clamp.ts` and `derive-vars.ts` write through it. `tests/server/domain/settings/seed-theme-pairing.suite.test.ts` derives its pairing from it and is typed against the contract's colour fields. |
| 2, 18, 19, 21 and the provider rows in `tests/db/schema/provider-row-namespace.int.test.ts` and `tests/support/node/corpus-plugin.ts` | `PLUGIN_PROVIDER_ID_PREFIX` builds every provider id. The db case asserts the `provider_rows_namespace_check` constraint (row 6). |
| 20 | `SECRET_BOX_TEST_KEY` is published on the composed door because several suites need it; every `Buffer.alloc(32, 1)` key uses it. |
| 1, 3, 5 (id only), 34, 35 (ids only), 36 (id only), 45 | Ids come from the seeded generator. |
| 32 | `summaryReply` (`tests/support/node/factories/summary-reply.ts`) builds the summarizer reply; every suite and corpus producer that spelled it calls it. |
| 33 | `createMemoryBackfillRoom` (`tests/support/node/factories/memory-backfill-room.ts`) is the one memory-backfill room for the chat and workloads estimate suites. |
| 12, 59, 67, 82, 94 | One local const, one launch-directory helper, typed bus event lists, the `SURFACE_*_ENV` constants, and `plantedTsconfig` in `tests/support/node/tool-fixtures.ts` for the four unwired suites. |

### Fixed in the `tests/support` domain

| Rows | Fix |
| - | - |
| 80, 81, 85 | `SURFACE_PROVIDER_REQUESTS` in `tests/support/iso/surface-data.ts` is the one request tuple; the surface peer builds its routes from it. The refused structured schema in `surface-provider.test.ts` is any scripted reply the peer does not serve. |
| 84 | `PUBLIC_PEER_ADDRESS` replaces the literal in every `tests/support` file. |

### Ruled to stay (tests/support)

| Rows | Reason |
| - | - |
| 76 | The `surface-data.int.test.ts` triggers corrupt a neighbouring table after a write; `refuseWrites` aborts a write. They are planted through `plantTrigger`, which `refuseWrites` is now built on. |
| 87 | `REFINERY_RESPONSE_FORMATS` has no door, and a door export only a test imports is refused. It needs the stage names moved to a contracts tuple first. |
| 69, 68, 70, 71, 73, 88, 89 | Browser CT rows. Each needs a CT run and, for 69, a tooling door export; left for a CT leg. |

### Fixed in the `tests/server/domain` domain

| Rows | Fix |
| - | - |
| 31, 44 | `tests/support/node/factories/portable-chat.ts` and `tests/support/node/chat/cast.ts` replace the local message, snapshot, room, character, persona and avatar builders in `library-planes`, `identity` and `persona-resolution`. |
| 18, 19, 21 | `makeProviderRow` and `makePluginProviderRow` build every provider row in the provider-rows, provider-contributions and provider-crash-window suites. |
| 28, 29, 37 | The image-sweep suite reads its lens from `IMAGE_LENSES` and asserts the refusal through its cause; the guest asset read types its expected view from `PluginBridge`. |
| 36, 84 | `PUBLIC_PEER_ADDRESS` replaces the literal throughout `tests/server/domain`. |
| 1, 3, 5, 34, 35, 45 and the unseeded ids named by the sweep | Absent ids come from the root's own seeded source, so one cannot collide with a minted row; bytes-only seeds use a seeded generator. |

### Ruled to stay (tests/server/domain)

| Rows | Reason |
| - | - |
| 25, 26 | The marker, source and guided-action literals are compared against closed unions, so `tsc` refuses a rename. `AGENTS.md` (type homes and unions) closes a case with a type. The builtin provider id `custom-openai` has no production tuple; it belongs to item 1504. |
| 35 | The floors throw a plain `Error`; a class is production work. |
| 40 | The host's call must pass the gate; the verbs return a view, an id or nothing, so the gate case asserts that it is not refused. |

### Ruled to stay

| Rows | Reason |
| - | - |
| 61 | The default and bound values are the pin: the file header names a default flipped on as the defect, and importing the default would make the case compare a value with itself. Spine-Testing section 6 keeps each critical behaviour as a named case, and section 10 gives the contract layer schema refusal. |
| 7 | The unmeasured and dated ids are probes of the prefix rule. They are not in the curated registry, so the registry cannot supply them. The beta header, warning code and log event constants (rows 8 to 10) stay open. |
| 74, 75 | `tests/support/node/surface-data.ts` is listed in `ROW_READ_HOMES` (`eslint.config.ts`) with its reason. `surface-data.int.test.ts` matches `tests/support/**/*.test.ts` in the same list, the testkit's own persistence tier. |
| 77 | The child process proves that the native surface root adopts the entry wall clock and enforces real rate-limit windows and scoped timers. Spine-Testing section 3: external process completion needs its lifecycle signal, and a frozen clock does not establish it. |
| 72 | The shell DOM contract has no production manifest to import. A manifest is a design decision, not a test fix; it needs its own item. |

### Proposal for row 17

Kit cannot import ui, so `TINT_PERCENT` and the Hearth page in `tests/kit/theme-derivation/tone-roles.test.ts` stay hand copies. Let `THEME_DERIVATION` in `@orb/kit/theme-derivation` own the tint percentage, and let `packages/ui/tokens.build.ts` write `tone-mix.tint` from it. `tokens.json` then references the kit number and the test imports it.

### Not changed in this leg

Rows 4, 5 (slot id), 8 to 11, 13 to 16, 25 to 31, 35 (refusal class: the floors throw a plain `Error`, so a class is production work), 36 and 84 (the peer address is done in `tests/support`; the other domains still spell it), 37, 38, 40, 42, 44, 46 to 49, 53 to 58, 60, 62 to 66, 78 to 79, 82 to 83, 86 to 87, 90 to 93, 95 and 96 stay open for a later leg; the browser rows in the `tests/support` table are listed there.

### Proof

- Red first: with `LEGACY_ENTRIES` keys `models` and `variants` renamed, the old file ran no cross-filesystem case and failed only on the literal `variants`; the new file ran its case for every entry.
- Planted additions: an optional `RpgConfigView` field, an optional `RpgService` verb, an optional `ChatService` verb and a `ThemeOverride` colour field each failed `pnpm typecheck tsconfig.node.json` in the new `update-config`, `authority.suite`, `read-gates` and `seed-theme-pairing` files. The old files carried hand lists and compiled. The plants were reverted.
- Floor: the changed Node suites, `pnpm test:tools` on the four unwired suites, `pnpm typecheck` on `tsconfig.node.json`, `packages/server/tsconfig.json`, `tooling/tsconfig.json`, `packages/ui/tsconfig.json` and `tsconfig.tests-iso.json`, `pnpm lint:eslint` on the changed paths, whole-tree `pnpm depcruise` and `pnpm knip:prod`.
