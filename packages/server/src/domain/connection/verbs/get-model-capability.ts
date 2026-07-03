// verb: getModelCapability — resolve the ONE capability descriptor for a `(model, source)`.
// Feeds the params panel (iterate the descriptor) + an active request. Goes through
// the `substrate/capability` mediator (the catalog subsystem is substrate-mediated); the OR synthesis arm
// reads the cached catalog the (injected-clock) cache holds. Sync under the hood — wrapped in a resolved
// promise for the async service surface.

import type { ModelCapability } from "@orb/contracts/connection";
import type { GetModelCapabilityParams } from "../contract/params";
import type { ConnectionContext, ConnectionService } from "../contract/service";
import { resolveCapability } from "../substrate/capability";
import { getCachedOrModels } from "../substrate/or-model-cache";

export function createGetModelCapability(
  ctx: ConnectionContext,
): ConnectionService["getModelCapability"] {
  return (params: GetModelCapabilityParams): Promise<ModelCapability> =>
    Promise.resolve(resolveCapability(params.model, params.source, getCachedOrModels(ctx.now())));
}
