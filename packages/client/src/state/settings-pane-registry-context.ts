// The settings-pane registry as a React CONTEXT (client-architecture-lockdown.md §8) — the context/hook/
// provider trio is the `createRegistryContext` mint (derive-modernization-audit.md §W3, G26); this file
// binds it to the settings-pane vocabulary. Assembled ONCE at the door (main.tsx, G8), read by the settings host.

import type { Registry } from "#lib";
import { createRegistryContext } from "#lib";
import type { SettingsPaneDefinition } from "./settings-pane-registry";
import type { SettingsCategoryId } from "./shell-store";

export type SettingsPaneRegistry = Registry<SettingsCategoryId, SettingsPaneDefinition>;

export const settingsPaneRegistryContext = createRegistryContext<SettingsPaneRegistry>("settings-pane registry");

export function useSettingsPaneRegistry(): SettingsPaneRegistry {
  return settingsPaneRegistryContext.useRegistry();
}
