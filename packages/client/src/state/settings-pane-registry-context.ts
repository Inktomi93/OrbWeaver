// The settings-pane registry as a React CONTEXT (client-architecture-lockdown.md §8) — mirrors
// modal-registry-context.ts exactly. Assembled ONCE at the door (main.tsx, G8), read by the settings host.

import { createContext, useContext } from "react";
import type { Registry } from "#lib";
import type { SettingsPaneDefinition } from "./settings-pane-registry";
import type { SettingsCategoryId } from "./shell-store";

export type SettingsPaneRegistry = Registry<SettingsCategoryId, SettingsPaneDefinition>;

export const SettingsPaneRegistryContext = createContext<SettingsPaneRegistry | null>(null);

export function useSettingsPaneRegistry(): SettingsPaneRegistry {
  const registry = useContext(SettingsPaneRegistryContext);
  if (registry === null) {
    throw new Error(
      "useSettingsPaneRegistry: no SettingsPaneRegistryProvider mounted (assemble in main.tsx)",
    );
  }
  return registry;
}
