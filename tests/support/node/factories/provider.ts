// Provider seeds run the production verbs and return their outcomes; rows-tier twins in `rows/provider.ts` read the rows.

import type { ProviderDef } from "@orb/contracts/inference";
import type { pluginProviderClaims, providerRows } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerProducerRoot } from "../server.ts";

export type ConnectionService = ServicesResult["services"]["connection"];

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
  origin: Extract<Parameters<ConnectionService["registry"]["register"]>[1], { readonly admin: UserId }>,
): Promise<Awaited<ReturnType<ConnectionService["registry"]["register"]>>> {
  return await root.services.connection.registry.register(definition, origin);
}
