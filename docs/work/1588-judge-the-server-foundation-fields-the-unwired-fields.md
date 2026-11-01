---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/foundation fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/foundation`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `DataLayout.dbDir` | `server/src/foundation/data-layout/contract.ts:42` | never-read | delete | delete the field and its writes (`server/src/foundation/data-layout/index.ts:136`) and the 23 test references |
| `DataLayout.cache` | `server/src/foundation/data-layout/contract.ts:48` | never-read | delete | delete the field and its writes (`server/src/foundation/data-layout/index.ts:142`) and the 5 test references |
| `envObjectSchema.DATA_DIR` | `server/src/foundation/env/record/index.ts:247` | unreferenced | delete | delete the key and the 7 test references |
| `envObjectSchema.DATA_LAYOUT_SKIP` | `server/src/foundation/env/record/index.ts:253` | unreferenced | delete | delete the key and the 5 test references |
| `UserSettingsRow.config` | `server/src/foundation/observability/contract/inspect.ts:13` | unreferenced | delete | delete the field |
| `RpgGameRow.config` | `server/src/foundation/observability/contract/inspect.ts:18` | never-read | delete | delete the field and its writes (`server/src/foundation/observability/debug/inspect/config.ts:146`) |
| `RenderPolicyVerdict.stored` | `server/src/foundation/observability/contract/inspect.ts:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RenderPolicyVerdict.deployment` | `server/src/foundation/observability/contract/inspect.ts:23` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RenderPolicyVerdict.resolved` | `server/src/foundation/observability/contract/inspect.ts:24` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RenderPolicyVerdict.cardTier` | `server/src/foundation/observability/contract/inspect.ts:25` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetailRow.renderPolicy` | `server/src/foundation/observability/contract/inspect.ts:30` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetailRow.themeOverride` | `server/src/foundation/observability/contract/inspect.ts:31` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetailRow.backgroundOverride` | `server/src/foundation/observability/contract/inspect.ts:32` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetailRow.card` | `server/src/foundation/observability/contract/inspect.ts:33` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetailRow.provenance` | `server/src/foundation/observability/contract/inspect.ts:48` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetailRow.extensions` | `server/src/foundation/observability/contract/inspect.ts:51` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetailRow.residualData` | `server/src/foundation/observability/contract/inspect.ts:52` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetailRow.refinery` | `server/src/foundation/observability/contract/inspect.ts:53` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PresetRow.config` | `server/src/foundation/observability/contract/inspect.ts:58` | unreferenced | delete | delete the field |
| `PersonaRow.metadata` | `server/src/foundation/observability/contract/inspect.ts:63` | unreferenced | delete | delete the field |
| `ChatConfigRow.pendingHandoffOffer` | `server/src/foundation/observability/contract/inspect.ts:85` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatConfigRow.metadata` | `server/src/foundation/observability/contract/inspect.ts:86` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatConfigRow.variableValues` | `server/src/foundation/observability/contract/inspect.ts:87` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatConfigRow.userMacroValues` | `server/src/foundation/observability/contract/inspect.ts:88` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatConfigRow.runtimeVariables` | `server/src/foundation/observability/contract/inspect.ts:89` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatConfigRow.standaloneVariableDeltas` | `server/src/foundation/observability/contract/inspect.ts:90` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatConfigRow.participants` | `server/src/foundation/observability/contract/inspect.ts:91` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterPolicyRow.renderPolicy` | `server/src/foundation/observability/contract/inspect.ts:97` | unreferenced | delete | delete the field |
| `ChatListRow.participantCount` | `server/src/foundation/observability/contract/inspect.ts:101` | unreferenced | delete | delete the field |
| `ChatListRow.messageCount` | `server/src/foundation/observability/contract/inspect.ts:102` | unreferenced | delete | delete the field |
| `IntegrityReport.ok` | `server/src/foundation/observability/contract/inspect.ts:106` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `IntegrityReport.foreignKeyViolations` | `server/src/foundation/observability/contract/inspect.ts:107` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `IntegrityReport.integrityCheck` | `server/src/foundation/observability/contract/inspect.ts:108` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AutomationFireRow.outcome` | `server/src/foundation/observability/contract/inspect.ts:113` | unreferenced | delete | delete the field |
| `RequestRecord.id` | `server/src/foundation/observability/contract/logging.ts:14` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RequestRecord.method` | `server/src/foundation/observability/contract/logging.ts:15` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RequestRecord.path` | `server/src/foundation/observability/contract/logging.ts:16` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RequestRecord.status` | `server/src/foundation/observability/contract/logging.ts:17` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RequestRecord.durationMs` | `server/src/foundation/observability/contract/logging.ts:18` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SerializedSpan.attributes` | `server/src/foundation/observability/contract/tracing.ts:14` | never-read | delete | delete the field and its writes (`server/src/foundation/observability/tracing.ts:482`) and the 19 test references |
| `SerializedSpan.events` | `server/src/foundation/observability/contract/tracing.ts:15` | never-read | delete | delete the field and its writes (`server/src/foundation/observability/tracing.ts:483`) and the 6 test references |
| `SerializedSpanEvent.name` | `server/src/foundation/observability/contract/tracing.ts:20` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SerializedSpanEvent.at` | `server/src/foundation/observability/contract/tracing.ts:21` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SerializedSpanEvent.attributes` | `server/src/foundation/observability/contract/tracing.ts:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RequestTraceTotals.spanCount` | `server/src/foundation/observability/contract/tracing.ts:26` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RequestTraceTotals.dbSpanCount` | `server/src/foundation/observability/contract/tracing.ts:27` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RequestTraceTotals.dbDurationMs` | `server/src/foundation/observability/contract/tracing.ts:28` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RequestTraceTotals.providerDurationMs` | `server/src/foundation/observability/contract/tracing.ts:29` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RequestTrace.spans` | `server/src/foundation/observability/contract/tracing.ts:34` | never-read | delete | delete the field and its writes (`server/src/foundation/observability/tracing.ts:119`) and the 39 test references |
| `WireWarning.code` | `server/src/foundation/observability/contract/wire-capture.ts:19` | unreferenced | delete | delete the field |
| `RequestContext.requestId` | `server/src/foundation/observability/logger.ts:71` | never-read | delete | delete the field and its writes (`server/src/foundation/observability/logger.ts:81`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Counts: 51 rows = applied 1, derived 0, kept 49, handed off 1, owner questions 0.

Method: codegraph on the inspect, tracing and logger symbols; `ast-grep -l ts` (5890 files) and `-l tsx` (1526 files) over packages, tests, tooling for `requestContext.getStore()`; `pnpm typecheck tsconfig.node.json` exit 0.

| Rows | Class | Reader or reason |
| - | - | - |
| `RequestContext.requestId` | applied | deleted with its write in `runInRequest`; the three `getStore()` reads (`logger.ts` `getLog`, `bindRequestUser`, `getRequestUserId`) never touch it |
| `DataLayout.dbDir` | kept | `tests/support/node/surface-data.ts:309` (testkit) reads `audit.dbDir` |
| `DataLayout.cache` | handed off | only `tests/server/entry/boot/persistence/migrate-data-layout.int.test.ts:166,209,312` read it; test-only readers, tests not rewritten (like 1696) |
| `envObjectSchema.DATA_DIR`, `.DATA_LAYOUT_SKIP` | kept | `resolveDataLayout(val)` at `foundation/env/record/index.ts:679` reads both off the parsed env; an operator sets them (`.env.example:41,44`, `docker/entrypoint.sh:20`), so the schema key is the outside writer |
| `UserSettingsRow`, `RpgGameRow`, `PresetRow`, `PersonaRow`, `RenderPolicyVerdict`, `CharacterDetailRow`, `ChatConfigRow`, `CharacterPolicyRow`, `ChatListRow`, `IntegrityReport`, `AutomationFireRow` fields | kept | each row is serialized whole by `c.json` in `foundation/observability/debug/routes.ts` (`/api/_debug/config/*`, `/db/chats`, `/db/integrity`, `/automation/fires`, lines 462-540); the debug body is the product, and `packages/client/src/data/fetch-automation-fires.ts` reads the fires route |
| `RequestRecord.*`, `SerializedSpan.attributes/events`, `SerializedSpanEvent.*`, `RequestTraceTotals.*`, `RequestTrace.spans` | kept | whole-served by `/api/_debug/requests` (`routes.ts:428-435`) and `/api/_debug/traces/:requestId` (`routes.ts:447-449`) |
| `WireWarning.code` | kept | `WireOutcome.warnings` rides whole through `/api/_debug/wire/outcomes` (`routes.ts:419-425`) and the spill file |

The reclassified "delete" rows are the debug wire body: removing a key changes what an operator or the agent bridge receives. An owner may still rule the debug body thinner.
