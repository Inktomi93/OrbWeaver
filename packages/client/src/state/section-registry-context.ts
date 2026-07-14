// The section registry as a React CONTEXT (client-architecture-lockdown.md §5–§7) — the context + hook
// half; the Provider is `section-registry-provider.tsx` (split so a JSX module never mixes a hook export
// with a component export — useComponentExportOnlyModules). Assembled ONCE at the door (main.tsx, G8),
// read deep in app-shell incl. the use-shell-layout HOOK. `never` erases each section's context-state
// projection `S`: the registry is heterogeneous, and `never` is the variance-safe common Def.

import { createContext, useContext } from "react";
import type { Registry } from "#lib";
import type { SectionDefinition } from "./section-registry";
import type { SectionId } from "./shell-store";

export type SectionRegistry = Registry<SectionId, SectionDefinition<never>>;

export const SectionRegistryContext = createContext<SectionRegistry | null>(null);

export function useSectionRegistry(): SectionRegistry {
  const registry = useContext(SectionRegistryContext);
  if (registry === null) {
    throw new Error(
      "useSectionRegistry: no SectionRegistryProvider mounted (assemble in main.tsx)",
    );
  }
  return registry;
}
