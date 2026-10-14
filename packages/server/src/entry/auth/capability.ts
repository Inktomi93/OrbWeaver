import type { AuthMode } from "@orb/contracts/identity";
import { isMultiHumanCapable } from "@orb/contracts/identity";
import type { EffectiveAppConfig } from "@orb/contracts/settings";

/** Bind the canonical mode predicate to the graph's live effective-settings read. */
export function createMultiHumanCapability(mode: AuthMode, readConfig: () => Pick<EffectiveAppConfig, "localMultiUser">): () => boolean {
  return () => isMultiHumanCapable(mode, readConfig().localMultiUser);
}
