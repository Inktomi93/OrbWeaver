---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
---

# Delete the client and ui members no production code calls

## What

`pnpm unwired` reports each member below with no production reference; `reports/unwired/unwired.json` holds the run. Apply the decision on each row.

A delete is checked by the compiler: if a composition site still needs the member structurally, `pnpm typecheck` refuses the delete and the member is linked instead. Paths are under `packages/`.

| Member | At | Scan | Decision |
| - | - | - | - |
| `Registry.has` | `client/src/lib/registry.ts:11` | builder-only | delete with its implementation and the 621 test files that name it |
| `EntityDraftStore.setField` | `client/src/state/entity-draft-store-implementation.ts:67` | builder-only | delete with its implementation |
| `RoomRegistry.joined` | `client/src/data/bus/room-registry-contract.ts:72` | builder-only | delete with its implementation and the 63 test files that name it |
| `CollectionSelection.selectAll` | `client/src/data/create-collection-surface.ts:41` | builder-only | delete with its implementation and the 2 test files that name it |
| `AutosaveBoundaryProps.save` | `client/src/forms/editor/autosave-contract.ts:87` | unreferenced | delete with its implementation and the 35 test files that name it |
| `AutosaveBoundaryPropsPersisting.save` | `client/src/forms/editor/autosave-contract.ts:93` | builder-only | delete with its implementation and the 35 test files that name it |
| `SaveCircuitBreaker.reset` | `client/src/forms/save-circuit-breaker.ts:37` | builder-only | delete with its implementation and the 51 test files that name it |
| `FormHandleBridge.read` | `client/src/forms/create-form-handle-bridge.ts:17` | builder-only | delete with its implementation and the 601 test files that name it |
| `UseGenerateImageResult.clearError` | `client/src/features/chat/hooks/use-generate-image.ts:35` | builder-only | delete with its implementation |
| `UseSendMessageResult.clearError` | `client/src/features/chat/hooks/use-send-message.ts:43` | builder-only | delete with its implementation |
| `MessageListHandle.isAtEnd` | `ui/src/primitives/message-list/message-list.tsx:27` | builder-only | delete with its implementation |
| `MessageListHandle.getDistanceFromEnd` | `ui/src/primitives/message-list/message-list.tsx:29` | builder-only | delete with its implementation |
| `ConnectionPromptCacheProps.onReset` | `client/src/features/credentials/components/connection-prompt-cache.tsx:42` | builder-only | delete with its implementation |
| `FacetView.pick` | `client/src/features/discovery/components/corpus-visuals-tab.tsx:43` | builder-only | delete with its implementation and the 51 test files that name it |
| `PluginUiGuest.alive` | `client/src/features/plugin/lib/ui-guest/plugin-ui-guest-host.ts:69` | builder-only | delete with its implementation and the 37 test files that name it |
| `ExtensionsEmptyCopy.title` | `client/src/features/plugin/lib/extensions-copy.ts:49` | builder-only | delete with its implementation and the 251 test files that name it |
| `ExtensionsEmptyCopy.description` | `client/src/features/plugin/lib/extensions-copy.ts:50` | builder-only | delete with its implementation and the 336 test files that name it |

## Why

Each member below is a hook, prop or handle field nothing reads, so it hides which surface API is live and keeps dead implementation alive.

## Done when

Every member in the table is deleted with its implementation and the props or values that supply it; `pnpm typecheck` passes for every world, and `pnpm unwired` no longer reports any of them.

## Evidence

Ran: `pnpm typecheck` for every program, `pnpm lint:eslint packages tooling tests`, `pnpm depcruise`, `pnpm knip:prod`, `pnpm unwired`, the CTs `tests/client/features/credentials/components/connection-prompt-cache.ct.tsx` and `tests/ui/primitives/message-list/scrollport-lifecycle.ct.tsx`, and `tests/client/state/registry-definitions.dom.test.ts`. All green.

| Member | Result |
| - | - |
| `Registry.has`, `EntityDraftStore.setField`, `RoomRegistry.joined`, `CollectionSelection.selectAll`, `SaveCircuitBreaker.reset`, `FormHandleBridge.read`, `UseGenerateImageResult.clearError`, `UseSendMessageResult.clearError`, `MessageListHandle.isAtEnd`, `MessageListHandle.getDistanceFromEnd`, `PluginUiGuest.alive` | deleted with their implementations; no test read them |
| `ConnectionPromptCacheProps.onReset` | wired: `PromptCacheBodyProps` extends `Pick<ConnectionPromptCacheProps, "onReset">`; the prop is live, the spread into the body hid it |
| `FacetView.pick` | wired: `view` is typed `FacetView`, so the call lands on the member |

### Owner calls

- `AutosaveBoundaryProps.save` and `AutosaveBoundaryPropsPersisting.save` stay. They are the per-instance persistence seam: a surface passes `save={...}` as a JSX prop (`packages/client/src/features/chat/components/room-overrides-tab.tsx:35`) and `createAutosaveEntityForm` reads it. Deleting them removes autosave persistence. The member scan does not count a JSX attribute as a read.
- `ExtensionsEmptyCopy.title` and `ExtensionsEmptyCopy.description` stay. They are the live empty-state copy (`extensions-page-surface.tsx`, `extensions-switcher-surface.tsx`). The `satisfies` check hides the call sites from the scan, and the call sites rely on the narrow branch types (`title()` with no argument), so typing them through the interface does not compile.
