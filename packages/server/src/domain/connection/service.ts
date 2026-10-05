// domain/connection — COMPOSITION ROOT. Wires the verbs over the injected `ConnectionContext` (db + clock +
// THE RUNTIME + the cross-domain ownership reads). ZERO logic: it only calls the verb factories and assembles
// the `ConnectionService`.

import type { ConnectionContext } from "./context.ts";
import type { ConnectionService } from "./contract/service.ts";
import { createOwnerWriteQueue } from "./substrate/owner-queue.ts";
import { createBindings } from "./verbs/bindings.ts";
import { createCatalogs } from "./verbs/catalogs.ts";
import { createConnections } from "./verbs/connections.ts";
import { createDiagnostics } from "./verbs/diagnostics.ts";
import { createPreviewEmbedSpaceChange } from "./verbs/preview-embed-space-change.ts";
import { createProviders } from "./verbs/providers.ts";
import { createAvailability, createCapabilities, createResolve, createResolveChatCapability, createTokenizeWords } from "./verbs/resolve.ts";

export function createConnectionService(ctx: ConnectionContext): ConnectionService {
  // Row and binding writes share one per-owner queue: either kind can move the owner's embed space.
  const ownerWrites = createOwnerWriteQueue();
  return {
    withStableEmbeddingBinding: ownerWrites,
    resolve: createResolve(ctx),
    availability: createAvailability(ctx),
    resolveChatCapability: createResolveChatCapability(ctx),
    capabilities: createCapabilities(ctx),
    tokenizeWords: createTokenizeWords(ctx),
    previewEmbedSpaceChange: createPreviewEmbedSpaceChange(ctx),
    ...createConnections(ctx, ownerWrites),
    ...createBindings(ctx, ownerWrites),
    ...createCatalogs(ctx),
    ...createDiagnostics(ctx),
    ...createProviders(ctx),
    registry: ctx.runtime.providers.registry,
  };
}
