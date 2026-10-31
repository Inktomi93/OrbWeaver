// Provider seeds run the production verbs and return their outcomes; rows-tier twins in `rows/provider.ts` read the rows.

import type { ProviderDef } from "@orb/contracts/inference";
import type { pluginProviderClaims, providerRows } from "@orb/db";
import type { ProviderRegistry } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { ServerProducerRoot } from "../server.ts";

export type ProviderRow = typeof providerRows.$inferSelect;
type PluginProviderClaimRow = typeof pluginProviderClaims.$inferSelect;

export interface SeededPluginProvider {
  readonly definition: ProviderRow;
  readonly claim: PluginProviderClaimRow;
}

/** Run the admin registration; the registered definition it returns is the seed's result. */
export async function seedAdminProvider(
  root: ServerProducerRoot,
  definition: ProviderDef,
  origin: Extract<Parameters<ProviderRegistry["register"]>[1], { readonly admin: UserId }>,
): Promise<Awaited<ReturnType<ProviderRegistry["register"]>>> {
  return await root.app.runtime.providers.registry.register(definition, origin);
}
