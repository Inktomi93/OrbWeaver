// The ONE resolver for all inference roles: reads the principal's `routing.roleDefaults.<role>`, applies the
// optional per-agent override, validates `(api, source)` coherence, heals the model id, and returns
// `{api, model, credential, capability}`. No per-role hard-pin — any role may resolve to any source it supports.

import type { ChatApi, CredentialSource, ResolvedConnection } from "@orb/contracts/connection";
import type { UserSettings } from "@orb/contracts/settings";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { env } from "#foundation/env";
import type { ConnectionContext } from "../context";
import { ConnectionRoutingError } from "../contract/errors";
import type { AgentOverride, ResolveRoleParams } from "../contract/params";
import type { ConnectionService } from "../contract/service";
import { getCachedAgentSdkModels } from "../substrate/agent-sdk-model-cache";
import { resolveCapability } from "../substrate/capability";
import { healToChatDefault } from "../substrate/heal-model";
import { getCachedOrModels } from "../substrate/or-model-cache";
import { pickOrModel } from "../substrate/pick-or-model";

type RoleDefaults = UserSettings["routing"]["roleDefaults"];

/** The raw routing selection a role's selector produces (pre-heal). `chatModel` flags a chat-family role
 *  whose model id is subject to the chat heal (agent-sdk → curated default; openrouter → pickOrModel);
 *  non-chat roles (embed/rerank/imageEmbed/generateImage) carry a concrete engine/model string. */
interface RouteSelection {
  readonly api: ChatApi;
  readonly source: CredentialSource;
  readonly model: string | null;
  readonly chatModel: boolean;
}

const DEFAULT_CHAT_API: ChatApi = "chat-completions";
const DEFAULT_LOCAL_SOURCE: CredentialSource = "vllm";
const DEFAULT_AGENT_SOURCE: CredentialSource = "max-pro-sub";
const DEFAULT_IMAGE_SOURCE: CredentialSource = "openrouter";

/** Exhaustive over `RoutingRoleKey`; `agentOverride` fields beat the role default. */
const ROLE_SELECTORS: {
  readonly [K in ResolveRoleParams["role"]]: (
    roleDefaults: RoleDefaults,
    override: AgentOverride | undefined,
    isOwner: boolean,
  ) => RouteSelection;
} = {
  // The unconfigured chat default is owner-conditional: owner falls back to max-pro-sub (agent-sdk),
  // everyone else to local vllm (max-pro-sub is owner-only and would throw for a non-owner).
  chat: (rd, ov, isOwner) => ({
    api: ov?.api ?? rd.chat?.api ?? (isOwner ? "agent-sdk" : DEFAULT_CHAT_API),
    source:
      ov?.source ?? rd.chat?.source ?? (isOwner ? DEFAULT_AGENT_SOURCE : DEFAULT_LOCAL_SOURCE),
    model: ov?.model ?? rd.chat?.model ?? null,
    chatModel: true,
  }),
  agent: (rd, ov) => ({
    api: "agent-sdk",
    source: ov?.source ?? rd.chat?.source ?? DEFAULT_AGENT_SOURCE,
    model: ov?.model ?? rd.chat?.model ?? null,
    chatModel: true,
  }),
  embed: (rd, ov) => ({
    api: DEFAULT_CHAT_API,
    source: ov?.source ?? rd.embed?.source ?? DEFAULT_LOCAL_SOURCE,
    model: ov?.model ?? rd.embed?.model ?? env.VLLM_EMBED_MODEL,
    chatModel: false,
  }),
  rerank: (rd, ov) => ({
    api: DEFAULT_CHAT_API,
    source: ov?.source ?? rd.rerank?.source ?? DEFAULT_LOCAL_SOURCE,
    model: ov?.model ?? rd.rerank?.model ?? env.VLLM_RERANK_MODEL,
    chatModel: false,
  }),
  imageEmbed: (rd, ov) => ({
    api: DEFAULT_CHAT_API,
    source: ov?.source ?? rd.imageEmbed?.source ?? DEFAULT_LOCAL_SOURCE,
    model: ov?.model ?? rd.imageEmbed?.model ?? env.VLLM_EMBED_MODEL,
    chatModel: false,
  }),
  // A max-pro-sub source pairs with api:"agent-sdk" (the only coherent api for the sub) and heals its
  // model through healToChatDefault like chat; any other source stays on chat-completions.
  summarize: (rd, ov) => {
    const source = ov?.source ?? rd.summarize?.source ?? DEFAULT_LOCAL_SOURCE;
    const isSub = source === "max-pro-sub";
    return {
      api: isSub ? "agent-sdk" : DEFAULT_CHAT_API,
      source,
      model: ov?.model ?? rd.summarize?.model ?? (isSub ? null : env.VLLM_GEN_MODEL),
      chatModel: true,
    };
  },
  generateImage: (rd, ov) => ({
    api: DEFAULT_CHAT_API,
    source: ov?.source ?? rd.generateImage?.source ?? DEFAULT_IMAGE_SOURCE,
    model: ov?.model ?? rd.generateImage?.model ?? null,
    chatModel: false,
  }),
};

// The only roles that may fall back to the in-process local-light tier when vLLM is unavailable; generation
// roles (chat/agent/summarize/generateImage) never fall back — local-light cannot generate.
const DERIVE_ROLES: ReadonlySet<ResolveRoleParams["role"]> = new Set<ResolveRoleParams["role"]>([
  "embed",
  "rerank",
  "imageEmbed",
]);

/** Reroutes a DERIVE role from `vllm` to `local-light` (empty model, self-defaults to jina-clip-v2) when no GPU. */
function applyVllmFallback(
  role: ResolveRoleParams["role"],
  selection: RouteSelection,
  vllmAvailable: boolean,
): RouteSelection {
  if (vllmAvailable || selection.source !== "vllm" || !DERIVE_ROLES.has(role)) {
    return selection;
  }
  return { ...selection, source: "local-light", model: "" };
}

/** Reject an incoherent `(api, source)` selection — the only thrown-error path. */
function assertCoherent(api: ChatApi, source: CredentialSource): void {
  if (api === "agent-sdk") {
    if (source !== "max-pro-sub" && source !== "openrouter") {
      throw new ConnectionRoutingError(api, source);
    }
    return;
  }
  if (api === "anthropic-messages") {
    // v1 rides the existing openrouter credential only; the sub can never reach the direct paid endpoint.
    if (source !== "openrouter") {
      throw new ConnectionRoutingError(api, source);
    }
    return;
  }
  if (source === "max-pro-sub") {
    throw new ConnectionRoutingError(api, source);
  }
}

/** Heal the selection's model id to a branded `ModelId`; non-chat roles carry their concrete string through. */
function healModel(selection: RouteSelection, now: number): ModelId {
  if (selection.chatModel) {
    if (selection.api === "agent-sdk") {
      return healToChatDefault(selection.model);
    }
    if (selection.source === "openrouter") {
      return pickOrModel(selection.model, getCachedOrModels(now));
    }
  }
  return castId<ModelId>(selection.model ?? env.VLLM_GEN_MODEL);
}

export function createResolveRole(ctx: ConnectionContext): ConnectionService["resolveRole"] {
  return async (params: ResolveRoleParams): Promise<ResolvedConnection> => {
    const settings = await ctx.loadUserSettings(params.principal.userId);
    const selection = applyVllmFallback(
      params.role,
      ROLE_SELECTORS[params.role](
        settings.routing.roleDefaults,
        params.agentOverride,
        ctx.isOwner(params.principal),
      ),
      ctx.vllmAvailable,
    );
    assertCoherent(selection.api, selection.source);

    const model = healModel(selection, ctx.now());
    const credential = await ctx.resolveCredential({
      principal: params.principal,
      source: selection.source,
    });
    const capability = resolveCapability(model, selection.source, selection.api, {
      cached: getCachedOrModels(ctx.now()),
      agentSdkModels: getCachedAgentSdkModels(ctx.now()),
    });
    return {
      api: selection.api,
      model,
      credential,
      capability,
    };
  };
}
