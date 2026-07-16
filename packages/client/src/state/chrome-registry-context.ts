// The chrome registry as a React CONTEXT (shell-chrome-unification.md §A/§D) — the context/hook/provider
// trio is the `createRegistryContext` mint (derive-modernization-audit.md §W3, G26); this file binds it to
// the chrome ContributorRegistry. Assembled ONCE at the door (main.tsx, G8), read by app-shell's topbar trail.

import type { ContributorRegistry } from "#lib";
import { createRegistryContext } from "#lib";
import type { ChromeEntry } from "./chrome-registry";

export type ChromeRegistry = ContributorRegistry<ChromeEntry>;

export const chromeRegistryContext = createRegistryContext<ChromeRegistry>("chrome registry");
export const ChromeRegistryContext = chromeRegistryContext.Context;

export function useChromeRegistry(): ChromeRegistry {
  return chromeRegistryContext.useRegistry();
}
