// verbs: providersAvailable · registerProvider · dropProvider — the registry door (§5.9-1). `available` is what
// the picker may OFFER (a row on an unbuilt wire is listed disabled with its cause, never hidden); `register`
// refuses a built-in id inside the runtime (a plugin row can never shadow one) and persists through the
// `provider_rows` port; `drop` is plugin deactivation / admin removal — connections on it read `no-connection`.

import type { ProviderAvailability } from "@orb/contracts/inference";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";

/** The provider-registry slice of `ConnectionService` this grouped file owns. */
type ProviderVerbs = Pick<ConnectionService, "providersAvailable" | "registerProvider" | "dropProvider" | "registerPluginProviders" | "dropPluginProviders">;

function createProvidersAvailable(ctx: ConnectionContext): ConnectionService["providersAvailable"] {
  return (params): Promise<readonly ProviderAvailability[]> => Promise.resolve(ctx.runtime.providers.available(params.principal));
}

function createRegisterProvider(ctx: ConnectionContext): ConnectionService["registerProvider"] {
  return async (params): Promise<void> => {
    await ctx.runtime.providers.register(params.row, params.origin);
  };
}

function createDropProvider(ctx: ConnectionContext): ConnectionService["dropProvider"] {
  return (params): Promise<void> => ctx.runtime.providers.drop(params.providerId);
}

function createRegisterPluginProviders(ctx: ConnectionContext): ConnectionService["registerPluginProviders"] {
  return async ({ rows, pluginId, pluginName }): Promise<void> => {
    await ctx.runtime.providers.registerPlugin(rows, { plugin: pluginId, pluginName });
  };
}

function createDropPluginProviders(ctx: ConnectionContext): ConnectionService["dropPluginProviders"] {
  return ({ pluginId }): Promise<void> => ctx.runtime.providers.dropPlugin(pluginId);
}

/** The registry-door verb bundle (`verb-naming`: one factory named for the file). */
export function createProviders(ctx: ConnectionContext): ProviderVerbs {
  return {
    providersAvailable: createProvidersAvailable(ctx),
    registerProvider: createRegisterProvider(ctx),
    dropProvider: createDropProvider(ctx),
    registerPluginProviders: createRegisterPluginProviders(ctx),
    dropPluginProviders: createDropPluginProviders(ctx),
  };
}
