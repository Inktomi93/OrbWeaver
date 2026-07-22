// The ONE resolver for all inference roles: reads the principal's `routing.roleDefaults.<role>`, applies the
// optional per-agent override, validates `(api, source)` coherence, heals the model id, and returns
// `{api, model, credential, capability}`. No per-role hard-pin — any role may resolve to any source it supports.

import type { ChatApi, CredentialSource, ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { UserSettings } from "@orb/contracts/settings";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { env, vllmAgentModelAlias } from "#foundation/env";
import type { ConnectionContext } from "../context";
import { AgentModelHealError, ConnectionRoutingError } from "../contract/errors";
import type { AgentOverride, ResolveChatCapabilityParams, ResolveRoleParams } from "../contract/params";
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
  readonly [K in ResolveRoleParams["role"]]: (roleDefaults: RoleDefaults, override: AgentOverride | undefined, isOwner: boolean) => RouteSelection;
} = {
  // The unconfigured chat default is owner-conditional: owner falls back to max-pro-sub (agent-sdk),
  // everyone else to local vllm (max-pro-sub is owner-only and would throw for a non-owner).
  chat: (rd, ov, isOwner) => ({
    api: ov?.api ?? rd.chat?.api ?? (isOwner ? "agent-sdk" : DEFAULT_CHAT_API),
    source: ov?.source ?? rd.chat?.source ?? (isOwner ? DEFAULT_AGENT_SOURCE : DEFAULT_LOCAL_SOURCE),
    model: ov?.model ?? rd.chat?.model ?? null,
    chatModel: true,
  }),
  // The agent role DEFAULTS TO THE USER'S CHAT CONNECTION (owner ruling 2026-07-21) — resolution order:
  // (1) the per-agent override `ov` (agentOverride ?? roleDefaults.agentConnections[agentId]) — "that agent
  // mapped to something specific in connections per agent"; (2) a general `roleDefaults.agent` partial (kept as
  // an intermediate layer for back-compat — option (a): a user who set one still gets it); (3) THE RESOLVED
  // CHAT CONNECTION — NOT a hardcoded agent-sdk/DEFAULT_AGENT_SOURCE. Room agent turns ride the CHAT engine
  // (backend-generic — chat-completions/responses/anthropic-messages → runChatTurn, agent-sdk → runAgentTurn),
  // so a chat-completions+vllm user's agent role now runs runChatTurn on vLLM instead of crashing Claude Code
  // against the loopback. Solo buddy still validates api:"agent-sdk" at its own entry (an honest refusal, not a
  // silent fail) when the resolved agent connection isn't agent-sdk.
  agent: (rd, ov, isOwner) => {
    const chat = ROLE_SELECTORS.chat(rd, undefined, isOwner);
    return {
      api: ov?.api ?? rd.agent?.api ?? chat.api,
      source: ov?.source ?? rd.agent?.source ?? chat.source,
      model: ov?.model ?? rd.agent?.model ?? chat.model,
      chatModel: true,
    };
  },
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
const DERIVE_ROLES: ReadonlySet<ResolveRoleParams["role"]> = new Set<ResolveRoleParams["role"]>(["embed", "rerank", "imageEmbed"]);

/** Reroutes a DERIVE role from `vllm` to `local-light` (empty model, self-defaults to jina-clip-v2) when no GPU. */
function applyVllmFallback(role: ResolveRoleParams["role"], selection: RouteSelection, vllmAvailable: boolean): RouteSelection {
  if (vllmAvailable || selection.source !== "vllm" || !DERIVE_ROLES.has(role)) {
    return selection;
  }
  return { ...selection, source: "local-light", model: "" };
}

/** Reject an incoherent `(api, source)` selection — the only thrown-error path. */
function assertCoherent(api: ChatApi, source: CredentialSource): void {
  if (api === "agent-sdk") {
    // The sub + the OR skin + the first-party anthropic key (W11 owner ruling: agents may run on a user's
    // own Anthropic key) all drive the agent-sdk backend, and vllm joins them via the local loopback agent
    // path (buildClaudeVllmEnv → 127.0.0.1:VLLM_GEN_PORT /v1/messages — deriveRunner + firewall already
    // route/allow it for the agent role); every other source is incoherent on this api.
    if (source !== "max-pro-sub" && source !== "openrouter" && source !== "vllm") {
      throw new ConnectionRoutingError(api, source);
    }
    return;
  }
  if (api === "anthropic-messages") {
    // Two paid-key sources reach anth-direct: the openrouter skin and the first-party anthropic key (W11).
    // The free Max sub can never reach the direct paid endpoint (the sub-exclusion).
    if (source !== "openrouter") {
      throw new ConnectionRoutingError(api, source);
    }
    return;
  }
  if (source === "max-pro-sub") {
    throw new ConnectionRoutingError(api, source);
  }
}

/** Resolve the model id for an `agent-sdk` chat selection — EXPLICIT + EXHAUSTIVE + FAIL-LOUD (owner ruling).
 *  The prior source-blind `return healToChatDefault(model)` silently healed EVERY agent-sdk source to a Claude
 *  default (opus); for `vllm` that 404'd the loopback and crashed Claude Code two layers down — the exact
 *  silent-failure antipattern that masked the bug. Only the four sources `assertCoherent` admits on this api
 *  can reach here; a new/unexpected one THROWS at resolution instead of becoming opus. */
function healAgentSdkModel(source: CredentialSource, model: string | null): ModelId {
  switch (source) {
    // Sub / first-party Anthropic key / OR skin legitimately run Claude models → the curated Claude heal.
    case "max-pro-sub":

      return healToChatDefault(model);
    // U0 local loopback agent path: Claude Code runs against the LOCAL vLLM engine, which serves ONLY the
    // slash-free alias (buildClaudeVllmEnv's ANTHROPIC_DEFAULT_*_MODEL). A Claude default id would 404 it.
    case "vllm":
      return castId<ModelId>(vllmAgentModelAlias());
    // Any other source is incoherent on agent-sdk (assertCoherent rejects it upstream); reaching here means a
    // new coherent source was added WITHOUT its heal arm — fail LOUD, never silently emit opus.
    default:
      throw new AgentModelHealError(source);
  }
}

/** Heal the selection's model id to a branded `ModelId`; non-chat roles carry their concrete string through. */
function healModel(selection: RouteSelection, now: number): ModelId {
  if (selection.chatModel) {
    if (selection.api === "agent-sdk") {
      return healAgentSdkModel(selection.source, selection.model);
    }
    if (selection.source === "openrouter") {
      return pickOrModel(selection.model, getCachedOrModels(now));
    }
  }
  return castId<ModelId>(selection.model ?? env.VLLM_GEN_MODEL);
}

/** Run the selector cascade (roleDefaults → per-agent override → owner default), the vLLM-fallback, the
 *  coherence assert, and the model heal — the shared SELECTION half both `resolveRole` and
 *  `resolveChatCapability` use. Reads the acting principal's OWN settings (no caller-supplied user id). */
async function resolveRoleSelection(ctx: ConnectionContext, params: ResolveRoleParams): Promise<{ selection: RouteSelection; model: ModelId }> {
  const settings = await ctx.loadUserSettings(params.principal.userId);
  // The per-agent connection override (D67 amendment): a seated agent whose id is configured in
  // `routing.agentConnections` runs on THAT connection, beating `roleDefaults.agent`. An explicit
  // `agentOverride` (a per-turn participant override) still wins over the stored per-agent connection.
  // Only consulted for the agent role (`agentPrincipalId` is set only on that resolve path).
  const perAgentOverride = params.agentPrincipalId === undefined ? undefined : settings.routing.agentConnections[params.agentPrincipalId];
  // A `null` stored entry is the CLEARED-override marker (the Agents-table Remove writes null) — coalesce
  // it to `undefined` so the selector cascades to `roleDefaults.agent`, identical to an absent id.
  const effectiveOverride = params.agentOverride ?? perAgentOverride ?? undefined;
  const selection = applyVllmFallback(
    params.role,
    ROLE_SELECTORS[params.role](settings.routing.roleDefaults, effectiveOverride, ctx.isOwner(params.principal)),
    ctx.vllmAvailable,
  );
  assertCoherent(selection.api, selection.source);
  return { selection, model: healModel(selection, ctx.now()) };
}

/** Resolve the caller's OWN chat-role capability descriptor END-TO-END (selection → ModelCapability) in ONE
 *  server hop — the client params-panel + the rpg lite gate consume ONLY the capability, so this collapses
 *  the former selection→getModelCapability round-trip. Reuses the SAME selector as `resolveRole` (a vLLM
 *  default resolves identically to the engine) + the SAME `resolveCapability` mediator as `getModelCapability`
 *  (no duplication). Credential-free: the chat role never touches comfyui/BYO, so the static descriptor is
 *  authoritative (matching `getModelCapability`). */
export function createResolveChatCapability(ctx: ConnectionContext): ConnectionService["resolveChatCapability"] {
  return async (params: ResolveChatCapabilityParams): Promise<ModelCapability> => {
    // Role is FIXED to "chat" here and the principal is the ONLY input — there is no caller-supplied user id
    // or role, so this can never resolve another tenant's connection (Injected-op caller gate).
    const { selection, model } = await resolveRoleSelection(ctx, { role: "chat", principal: params.principal });
    return resolveCapability(model, selection.source, selection.api, {
      cached: getCachedOrModels(ctx.now()),
      agentSdkModels: getCachedAgentSdkModels(ctx.now()),
    });
  };
}

export function createResolveRole(ctx: ConnectionContext): ConnectionService["resolveRole"] {
  return async (params: ResolveRoleParams): Promise<ResolvedConnection> => {
    const { selection, model } = await resolveRoleSelection(ctx, params);
    const credential = await ctx.resolveCredential({
      principal: params.principal,
      source: selection.source,
    });
    const baseCapability = resolveCapability(model, selection.source, selection.api, {
      cached: getCachedOrModels(ctx.now()),
      agentSdkModels: getCachedAgentSdkModels(ctx.now()),
      customContextWindow: credential.source === "custom_openai" ? credential.contextWindow : undefined,
    });
    return {
      api: selection.api,
      model,
      credential,
      capability: baseCapability,
    };
  };
}
