// domain/connection — COMPOSITION ROOT. Wires the verbs over the injected `ConnectionContext` (db + clock +
// THE RUNTIME + the cross-domain ownership reads). ZERO logic: it only calls the verb factories and assembles
// the `ConnectionService`.

import type { ConnectionContext } from "./context.ts";
import type { ConnectionService } from "./contract/service.ts";
import { createListBindings, createSetBinding, createUseForEverything } from "./verbs/bindings.ts";
import { createCatalogModels, createListEndpointModels, createRefreshCatalog } from "./verbs/catalogs.ts";
import { createCreate, createGet, createList, createRemove, createUpdate } from "./verbs/connections.ts";
import { createAccountCredits, createGenerationCost, createInspectEndpoint, createProbe, createVerifyAuth } from "./verbs/diagnostics.ts";
import { createDropProvider, createProvidersAvailable, createRegisterProvider } from "./verbs/providers.ts";
import { createAvailability, createCapabilities, createResolve, createResolveChatCapability } from "./verbs/resolve.ts";

export function createConnectionService(ctx: ConnectionContext): ConnectionService {
  return {
    resolve: createResolve(ctx),
    availability: createAvailability(ctx),
    resolveChatCapability: createResolveChatCapability(ctx),
    capabilities: createCapabilities(ctx),
    list: createList(ctx),
    get: createGet(ctx),
    create: createCreate(ctx),
    update: createUpdate(ctx),
    remove: createRemove(ctx),
    listBindings: createListBindings(ctx),
    setBinding: createSetBinding(ctx),
    useForEverything: createUseForEverything(ctx),
    catalogModels: createCatalogModels(ctx),
    listEndpointModels: createListEndpointModels(ctx),
    refreshCatalog: createRefreshCatalog(ctx),
    probe: createProbe(ctx),
    accountCredits: createAccountCredits(ctx),
    generationCost: createGenerationCost(ctx),
    verifyAuth: createVerifyAuth(ctx),
    inspectEndpoint: createInspectEndpoint(ctx),
    providersAvailable: createProvidersAvailable(ctx),
    registerProvider: createRegisterProvider(ctx),
    dropProvider: createDropProvider(ctx),
    registry: ctx.runtime.providers.registry,
  };
}
