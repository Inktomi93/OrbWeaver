// The chrome registry as a React CONTEXT (shell-chrome-unification.md §A/§D) — mirrors
// section-registry-context.ts exactly. Assembled ONCE at the door (main.tsx, G8), read by app-shell's
// topbar trail.

import { createContext, useContext } from "react";
import type { ContributorRegistry } from "#lib";
import type { ChromeEntry } from "./chrome-registry";

export type ChromeRegistry = ContributorRegistry<ChromeEntry>;

export const ChromeRegistryContext = createContext<ChromeRegistry | null>(null);

export function useChromeRegistry(): ChromeRegistry {
  const registry = useContext(ChromeRegistryContext);
  if (registry === null) {
    throw new Error("useChromeRegistry: no ChromeRegistryProvider mounted (assemble in main.tsx)");
  }
  return registry;
}
