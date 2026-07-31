// domain/connection — COMPOSITION ROOT. Wires the 5 verbs over the injected `ConnectionContext` (db +
// clock + credentials.resolve + providers.fetchOrCatalog + settings.loadUserSettings). ZERO logic: it only
// calls the verb factories and assembles the `ConnectionService`. `resolveChat` delegates to the same
// `resolveRole` instance (the one home for resolution) — wired here at the root, never sibling-imported.

import type { ConnectionContext } from "./context";
import type { ConnectionService } from "./contract/service";
import { createCheckChatAvailability } from "./verbs/check-chat-availability";
import { createGetAgentSdkCatalog } from "./verbs/get-agent-sdk-catalog";
import { createGetCatalog } from "./verbs/get-catalog";
import { createGetGenerationCost } from "./verbs/get-generation-cost";
import { createGetModelsForSource } from "./verbs/get-models-for-source";
import { createGetOrCredits } from "./verbs/get-or-credits";
import { createGetOrSkinTierModels } from "./verbs/get-or-skin-tier-models";

import { createRefreshAgentSdkCatalog } from "./verbs/refresh-agent-sdk-catalog";
import { createRefreshCatalog } from "./verbs/refresh-catalog";
import { createResolveChat } from "./verbs/resolve-chat";
import { createResolveChatCapability, createResolveRole } from "./verbs/resolve-role";
import { createTestClaudeAuth } from "./verbs/test-claude-auth";

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
