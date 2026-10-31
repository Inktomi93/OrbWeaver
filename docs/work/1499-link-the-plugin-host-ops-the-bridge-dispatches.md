---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: plugin
---

# Link the plugin host ops the bridge dispatches by name to their owners

## What

`pnpm unwired` reports each member below with no production reference; `reports/unwired/unwired.json` holds the run. Apply the decision on each row.

A delete is checked by the compiler: if a composition site still needs the member structurally, `pnpm typecheck` refuses the delete and the member is linked instead. Paths are under `packages/`.

| Member | At | Scan | Decision |
| - | - | - | - |
| `PluginChatReads.listMessages` | `contracts/src/plugin/owner-reads.ts:28` | unreferenced | wire: the plugin bridge dispatches it by the string key at `infra/plugin-host/bridge-rpc.ts:34`; derive that slot from this member so a reference links them |
| `PluginChatReads.listCharacters` | `contracts/src/plugin/owner-reads.ts:38` | unreferenced | wire: the plugin bridge dispatches it by the string key at `infra/plugin-host/bridge-rpc.ts:36`; derive that slot from this member so a reference links them |
| `PluginWorldInfoReads.isBookAttachedToChat` | `contracts/src/plugin/owner-reads.ts:46` | builder-only | wire: the plugin bridge's world-info ops call it through a nested ops slot; derive that slot from this member so a reference links them |
| `PluginWorldInfoReads.listEntryTitles` | `contracts/src/plugin/owner-reads.ts:49` | builder-only | wire: `domain/plugin/substrate/bridge.ts:178` calls it through a nested ops slot; derive that slot from this member so a reference links them |
| `PluginWorldInfoReads.listBooksForChat` | `contracts/src/plugin/owner-reads.ts:54` | builder-only | wire: `domain/plugin/substrate/bridge.ts:150` calls it through a nested ops slot; derive that slot from this member so a reference links them |
| `PluginWorldInfoReads.listEntries` | `contracts/src/plugin/owner-reads.ts:59` | builder-only | wire: the plugin bridge dispatches it by the string key `worldInfo.listEntries` in `infra/plugin-host/bridge-rpc.ts`; derive that slot from this member so a reference links them |
| `PluginDocumentReads.documents` | `contracts/src/plugin/owner-reads.ts:67` | unreferenced | wire: the plugin bridge dispatches it by the string key at `infra/plugin-host/bridge-rpc.ts:49`; derive that slot from this member so a reference links them |
| `PluginNotificationDelivery.emit` | `contracts/src/plugin/owner-reads.ts:71` | test-only | delete with its implementation and the 35 test files that name it |
| `PluginNotificationDelivery.emitStanding` | `contracts/src/plugin/owner-reads.ts:83` | builder-only | wire: `domain/plugin/substrate/consent-prompt.ts:23` calls it through a nested notifications slot; derive that slot from this member so a reference links them |
| `PluginNotificationDelivery.refreshStanding` | `contracts/src/plugin/owner-reads.ts:84` | builder-only | wire: `domain/notifications/verbs/plugin-delivery.ts:17` calls it; derive that slot from this member so a reference links them |
| `PluginNotificationDelivery.retractStanding` | `contracts/src/plugin/owner-reads.ts:85` | test-only | wire: `domain/plugin/substrate/consent-prompt.ts:18` calls it through a nested notifications slot; derive that slot from this member so a reference links them |
| `PluginToolHandle.unregister` | `contracts/src/tool-use/index.ts:76` | builder-only | wire: activation calls `handle.unregister()` at `domain/plugin/activation/activate.ts:68` on a handle typed by the registrar; derive that slot from this member so a reference links them |
| `ChatService.getVariables` | `server/src/domain/chat/contract/service.ts:312` | test-only | wire: the plugin bridge dispatches it by the string key at `infra/plugin-host/bridge-rpc.ts:35`; derive that slot from this member so a reference links them |
| `CreateInstanceInput.reloadMainJs` | `server/src/domain/plugin/contract/service.ts:107` | builder-only | delete with its implementation |
| `PluginService.upgradeFromUrl` | `server/src/domain/plugin/contract/service.ts:424` | builder-only | wire: a plugin router procedure for upgrade from a URL |
| `ToolUseService.registerPluginTool` | `server/src/domain/tool-use/contract/service.ts:24` | builder-only | wire: `domain/plugin/verbs/registrar-ops.ts:19` calls it through `PluginRegistrarDeps.toolUse`; derive that slot from this member so a reference links them |

## Why

The plugin bridge reaches these ops through string-keyed tables and nested ops slots, so no reference links a call to its owner and the unwired scan reports them as dead.

## Done when

Each member in the table is reached by a typed reference: the bridge's dispatch table and nested slots derive from the owner ops, and `pnpm unwired` no longer reports any of them, or the member is deleted where its decision says.

## Evidence

Filled at landing: what ran and where its output is.
