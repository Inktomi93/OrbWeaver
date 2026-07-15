// The modal registry as a React CONTEXT (client-architecture-lockdown.md §6d/§7) — mirrors
// section-registry-context.ts exactly. Assembled ONCE at the door (main.tsx, G8), read by ModalHost.

import { createContext, useContext } from "react";
import type { Registry } from "#lib";
import type { ModalDefinition } from "./modal-registry";
import type { ModalSlotId } from "./shell-store";

export type ModalRegistry = Registry<ModalSlotId, ModalDefinition>;

export const ModalRegistryContext = createContext<ModalRegistry | null>(null);

export function useModalRegistry(): ModalRegistry {
  const registry = useContext(ModalRegistryContext);
  if (registry === null) {
    throw new Error("useModalRegistry: no ModalRegistryProvider mounted (assemble in main.tsx)");
  }
  return registry;
}
