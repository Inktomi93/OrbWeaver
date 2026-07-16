// The section registry as a React CONTEXT (client-architecture-lockdown.md §5–§7) — the context + hook
// half; the Provider is `section-registry-provider.tsx` (split so a JSX module never mixes a hook export
// with a component export — useComponentExportOnlyModules). The context/hook/provider trio is the
// `createRegistryContext` mint (derive-modernization-audit.md §W3, G26); this file binds it to the section
// vocabulary. Assembled ONCE at the door (main.tsx, G8), read deep in app-shell incl. use-shell-layout.

import type { Registry } from "#lib";
import { createRegistryContext } from "#lib";
import type { SectionDefinition } from "./section-registry";
import type { SectionId } from "./shell-store";

export type SectionRegistry = Registry<SectionId, SectionDefinition>;

export const sectionRegistryContext = createRegistryContext<SectionRegistry>("section registry");
export const SectionRegistryContext = sectionRegistryContext.Context;

export function useSectionRegistry(): SectionRegistry {
  return sectionRegistryContext.useRegistry();
}
