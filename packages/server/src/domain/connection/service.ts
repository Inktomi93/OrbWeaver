// domain/connection — COMPOSITION ROOT. Wires the verbs over the injected `ConnectionContext` (db + clock +
// THE RUNTIME + the cross-domain ownership reads). ZERO logic: it only calls the verb factories and assembles
// the `ConnectionService`.

import type { ConnectionContext } from "./context.ts";
import type { ConnectionService } from "./contract/service.ts";
import { createBindings } from "./verbs/bindings.ts";
import { createCatalogs } from "./verbs/catalogs.ts";
import { createConnections } from "./verbs/connections.ts";
import { createDiagnostics } from "./verbs/diagnostics.ts";
import { createProviders } from "./verbs/providers.ts";
import { createAvailability, createCapabilities, createResolve, createResolveChatCapability } from "./verbs/resolve.ts";

export function createConnectionService(ctx: ConnectionContext): ConnectionService {
  return {
    resolve: createResolve(ctx),
    availability: createAvailability(ctx),
    resolveChatCapability: createResolveChatCapability(ctx),
    capabilities: createCapabilities(ctx),
    ...createConnections(ctx),
    ...createBindings(ctx),
    ...createCatalogs(ctx),
    ...createDiagnostics(ctx),
    ...createProviders(ctx),
    registry: ctx.runtime.providers.registry,
  };
}
