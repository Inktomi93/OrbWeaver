// verbs: providersAvailable · registerProvider · dropProvider — the registry door (§5.9-1). `available` is what
// the picker may OFFER (a row on an unbuilt wire is listed disabled with its cause, never hidden); `register`
// refuses a built-in id inside the runtime (a plugin row can never shadow one) and persists through the
// `provider_rows` port; `drop` is plugin deactivation / admin removal — connections on it read `no-connection`.

import type { ProviderAvailability } from "@orb/contracts/inference";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";

export function createProvidersAvailable(ctx: ConnectionContext): ConnectionService["providersAvailable"] {
  return (params): Promise<readonly ProviderAvailability[]> => Promise.resolve(ctx.runtime.providers.available(params.principal));
}

export function createRegisterProvider(ctx: ConnectionContext): ConnectionService["registerProvider"] {
  return async (params): Promise<void> => {
    await ctx.runtime.providers.register(params.row, params.origin);
  };
}

export function createDropProvider(ctx: ConnectionContext): ConnectionService["dropProvider"] {
  return (params): Promise<void> => ctx.runtime.providers.drop(params.providerId);
}
