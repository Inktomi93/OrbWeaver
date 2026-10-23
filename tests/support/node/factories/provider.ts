// Provider definitions and claims are captured only after their real registration/lifecycle commits.
import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { pluginProviderClaims, providerRows } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { PluginService } from "@orb/server/domain/plugin";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type ConnectionService = ServicesResult["services"]["connection"];

export type ProviderRow = typeof providerRows.$inferSelect;
type PluginProviderClaimRow = typeof pluginProviderClaims.$inferSelect;

export interface SeededPluginProvider {
  readonly definition: ProviderRow;
  readonly claim: PluginProviderClaimRow;
}

export async function seedAdminProvider(
  root: ServerProducerRoot,
  definition: ProviderDef,
  origin: Extract<Parameters<ConnectionService["registry"]["register"]>[1], { readonly admin: UserId }>,
): Promise<ProviderRow> {
  const db = root.db;
  const register = root.services.connection.registry.register;
  const registered = await register(definition, origin);
  const row = await db
    .select()
    .from(providerRows)
    .where(and(eq(providerRows.id, registered.id), eq(providerRows.originKind, "admin")))
    .get();
  if (row === undefined) {
    throw new Error("production admin registration left no canonical provider row");
  }
  return row;
}

/** Provider IDs come from the genuine parsed bundle manifest, not a fixture-side namespace/hash fold. */
export async function seedPluginProviders(
  root: ServerProducerRoot,
  params: Parameters<PluginService["setGrant"]>[0],
  providerIds: readonly ProviderId[],
): Promise<readonly SeededPluginProvider[]> {
  const db = root.db;
  const setGrant = root.services.plugin.setGrant;
  const view = await setGrant(params);
  if (view.status !== "enabled") {
    throw new Error(`production plugin activation did not enable provider capture: ${view.status}`);
  }
  return await Promise.all(
    providerIds.map(async (providerId): Promise<SeededPluginProvider> => {
      const claim = await db
        .select()
        .from(pluginProviderClaims)
        .where(
          and(
            eq(pluginProviderClaims.ownerId, params.caller.userId),
            eq(pluginProviderClaims.pluginId, params.pluginId),
            eq(pluginProviderClaims.providerId, providerId),
          ),
        )
        .get();
      if (claim === undefined) {
        throw new Error("production plugin activation left no active canonical provider claim");
      }
      const definition = await db
        .select()
        .from(providerRows)
        .where(and(eq(providerRows.id, claim.providerId), eq(providerRows.definitionHash, claim.definitionHash)))
        .get();
      if (definition === undefined) {
        throw new Error("production provider claim has no exact canonical definition row");
      }
      return { definition, claim };
    }),
  );
}
