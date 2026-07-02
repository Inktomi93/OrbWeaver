// domain/connection — COMPOSITION ROOT. Wires the 5 verbs over the injected `ConnectionContext` (db +
// clock + credentials.resolve + providers.fetchOrCatalog + settings.loadUserSettings). ZERO logic: it only
// calls the verb factories and assembles the `ConnectionService`. `resolveChat` delegates to the same
// `resolveRole` instance (the one home for resolution) — wired here at the root, never sibling-imported.

import type { ConnectionContext, ConnectionService } from "./contract/service";
import { createGetCatalog } from "./verbs/get-catalog";
import { createGetGenerationCost } from "./verbs/get-generation-cost";
import { createGetModelCapability } from "./verbs/get-model-capability";
import { createGetOrCredits } from "./verbs/get-or-credits";
import { createRefreshCatalog } from "./verbs/refresh-catalog";
import { createResolveChat } from "./verbs/resolve-chat";
import { createResolveRole } from "./verbs/resolve-role";
import { createTestClaudeAuth } from "./verbs/test-claude-auth";

export function createConnectionService(ctx: ConnectionContext): ConnectionService {
  const resolveRole = createResolveRole(ctx);
  return {
    resolveRole,
    resolveChat: createResolveChat(resolveRole),
    getModelCapability: createGetModelCapability(ctx),
    getCatalog: createGetCatalog(ctx),
    refreshCatalog: createRefreshCatalog(ctx),
    testClaudeAuth: createTestClaudeAuth(ctx),
    getOrCredits: createGetOrCredits(ctx),
    getGenerationCost: createGetGenerationCost(ctx),
  };
}
