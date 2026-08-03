// domain/connection — COMPOSITION ROOT. Wires the 5 verbs over the injected `ConnectionContext` (db +
// clock + credentials.resolve + providers.fetchOrCatalog + settings.loadUserSettings). ZERO logic: it only
// calls the verb factories and assembles the `ConnectionService`. `resolveChat` delegates to the same
// `resolveRole` instance (the one home for resolution) — wired here at the root, never sibling-imported.

import type { ConnectionContext } from "./context.ts";
import type { ConnectionService } from "./contract/service.ts";
import { createCheckChatAvailability } from "./verbs/check-chat-availability.ts";
import { createGetAgentSdkCatalog } from "./verbs/get-agent-sdk-catalog.ts";
import { createGetCatalog } from "./verbs/get-catalog.ts";
import { createGetGenerationCost } from "./verbs/get-generation-cost.ts";
import { createGetModelsForSource } from "./verbs/get-models-for-source.ts";
import { createGetOrCredits } from "./verbs/get-or-credits.ts";
import { createGetOrSkinTierModels } from "./verbs/get-or-skin-tier-models.ts";

import { createRefreshAgentSdkCatalog } from "./verbs/refresh-agent-sdk-catalog.ts";
import { createRefreshCatalog } from "./verbs/refresh-catalog.ts";
import { createResolveChat } from "./verbs/resolve-chat.ts";
import { createResolveChatCapability, createResolveRole } from "./verbs/resolve-role.ts";
import { createTestClaudeAuth } from "./verbs/test-claude-auth.ts";

export function createConnectionService(ctx: ConnectionContext): ConnectionService {
  const resolveRole = createResolveRole(ctx);
  const resolveChat = createResolveChat(resolveRole);
  return {
    resolveRole,
    resolveChat,
    resolveChatCapability: createResolveChatCapability(ctx),
    checkChatAvailability: createCheckChatAvailability(ctx, resolveChat),
    getModelsForSource: createGetModelsForSource(ctx),

    getOrSkinTierModels: createGetOrSkinTierModels(ctx),
    getCatalog: createGetCatalog(ctx),
    refreshCatalog: createRefreshCatalog(ctx),
    getAgentSdkCatalog: createGetAgentSdkCatalog(ctx),
    refreshAgentSdkCatalog: createRefreshAgentSdkCatalog(ctx),
    testClaudeAuth: createTestClaudeAuth(ctx),
    getOrCredits: createGetOrCredits(ctx),
    getGenerationCost: createGetGenerationCost(ctx),
  };
}
