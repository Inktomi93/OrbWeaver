// The modal registry as a React CONTEXT (client-architecture-lockdown.md §6d/§7) — the context/hook/
// provider trio is the `createRegistryContext` mint; this file
// binds it to the modal vocabulary. Assembled ONCE at the door (main.tsx, G8), read by ModalHost.

import type { Registry } from "#lib";
import { createRegistryContext } from "#lib";
import type { ModalDefinition } from "./modal-registry.ts";
import type { ModalSlotId } from "./modal-slot-ids.ts";

export type ModalRegistry = Registry<ModalSlotId, ModalDefinition>;

export const modalRegistryContext = createRegistryContext<ModalRegistry>("modal registry");

export function useModalRegistry(): ModalRegistry {
  return modalRegistryContext.useRegistry();
}
