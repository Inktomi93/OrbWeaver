// The ONE resolver for all inference roles: reads the principal's `routing.roleDefaults.<role>`, applies the
// optional per-agent override, validates `(api, source)` coherence, heals the model id, and returns
// `{api, model, credential, capability}`. No per-role hard-pin — any role may resolve to any source it supports.

import type { AgentSdkModel, ChatApi, CredentialSource, ModelCapability, ModelCatalogEntry, ResolvedConnection } from "@orb/contracts/connection";
import type { UserSettings } from "@orb/contracts/settings";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { env } from "#foundation/env";
import type { ConnectionContext } from "../context";
import { AgentModelHealError, ConnectionRoutingError } from "../contract/errors";
import type { ResolveChatCapabilityParams, ResolveRoleParams, RouteOverride } from "../contract/params";
import type { ConnectionService, VllmWindowEngine } from "../contract/service";
import { getCachedAgentSdkModels } from "../substrate/agent-sdk-model-cache";
import { resolveCapability } from "../substrate/capability";
import { healToChatDefault } from "../substrate/heal-model";
import { getCachedOrModels } from "../substrate/or-model-cache";
import { pickOrModel } from "../substrate/pick-or-model";
import { getCachedVllmGenWindow, getCachedVllmWindow, seedVllmWindow } from "../substrate/vllm-gen-window-cache";

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
  readonly [K in ResolveRoleParams["role"]]: (roleDefaults: RoleDefaults, override: RouteOverride | undefined, isOwner: boolean) => RouteSelection;
} = {
  // The unconfigured chat default is owner-conditional: owner falls back to max-pro-sub (agent-sdk),
  // everyone else to local vllm (max-pro-sub is owner-only and would throw for a non-owner).
  chat: (rd, ov, isOwner) => ({
    api: ov?.api ?? rd.chat?.api ?? (isOwner ? "agent-sdk" : DEFAULT_CHAT_API),
    source: ov?.source ?? rd.chat?.source ?? (isOwner ? DEFAULT_AGENT_SOURCE : DEFAULT_LOCAL_SOURCE),
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
    // agent-sdk drives ONLY the two Claude-runtime skins: the sub + the OR-Anthropic skin. vLLM was REMOVED
    // from this api (owner ruling 2026-07-27): the loopback agent skin hung the small local model on real
    // structured-output schemas, while the SAME engine's chat-completions surface (guided decoding + hermes
    // parallel tools) handles everything — so local vLLM is chat-completions-ONLY (the strictly-better wire).
    if (source !== "max-pro-sub" && source !== "openrouter") {
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
 *  default (opus). Only the two Claude-runtime sources `assertCoherent` admits on this api can reach here; a
 *  new/unexpected one (incl. `vllm`, which is chat-completions-only since 2026-07-27) THROWS at resolution
 *  instead of becoming opus. */
function healAgentSdkModel(source: CredentialSource, model: string | null): ModelId {
  switch (source) {
    // Sub / OR skin legitimately run Claude models → the curated Claude heal.
    case "max-pro-sub":
    case "openrouter":
      return healToChatDefault(model);
    // Incoherent on agent-sdk (assertCoherent rejects them upstream); reaching here is a routing bug —
    // fail LOUD, never silently emit opus. `vllm` is now chat-completions-only (owner ruling): an agent-sdk
    // selection with source=vllm is rejected by `assertCoherent` before this point. Exhaustive: a NEW
    // CredentialSource member is a lint error here until its heal arm is decided.
    case "vllm":
    case "local-light":
    case "custom_openai":
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

/** The vLLM engine that backs each role's self-reported window: embed/imageEmbed → the embed engine;
 *  rerank → the rerank engine; every generation role → the gen engine (chat/summarize run on it). */
const ROLE_ENGINE: Record<ResolveRoleParams["role"], VllmWindowEngine> = {
  chat: "gen",
  embed: "embed",
  rerank: "rerank",
  imageEmbed: "embed",
  summarize: "gen",
  generateImage: "gen",
};

/** Warm the role's engine-window cache from the engine's self-reported `/v1/models` when the selection lands
 *  on vllm and the cache is cold/stale. Best-effort: a null (engine warming/disabled) leaves the cache empty
 *  and consumers fall back to the env window. Only fires for the vllm source so a non-vllm turn pays nothing.
 *  The self-report WINS over env for capability truth — a misconfigured setting can never lie to the math. */
async function warmVllmGenWindow(ctx: ConnectionContext, role: ResolveRoleParams["role"], source: CredentialSource): Promise<void> {
  const engine = ROLE_ENGINE[role];
  if (source !== "vllm" || getCachedVllmWindow(engine, ctx.now()) !== null) {
    return;
  }
  const window = await ctx.fetchVllmGenWindow({ engine });
  if (window !== null) {
    seedVllmWindow(engine, window, ctx.now());
  }
}

/** The cache snapshots the capability synthesis reads — the OR catalog, the agent-sdk daemon rows, and the
 *  gen engine's self-reported window (all read with `ctx.now()`). */
function capabilityCaches(ctx: ConnectionContext): {
  cached: readonly ModelCatalogEntry[] | null;
  agentSdkModels: readonly AgentSdkModel[] | null;
  vllmGenWindow: number | undefined;
} {
  return {
    cached: getCachedOrModels(ctx.now()),
    agentSdkModels: getCachedAgentSdkModels(ctx.now()),
    vllmGenWindow: getCachedVllmGenWindow(ctx.now()) ?? undefined,
  };
}

/** Run the selector cascade (roleDefaults → per-agent override → owner default), the vLLM-fallback, the
 *  coherence assert, and the model heal — the shared SELECTION half both `resolveRole` and
 *  `resolveChatCapability` use. Reads the acting principal's OWN settings (no caller-supplied user id). */
async function resolveRoleSelection(ctx: ConnectionContext, params: ResolveRoleParams): Promise<{ selection: RouteSelection; model: ModelId }> {
  const settings = await ctx.loadUserSettings(params.principal.userId);
  const selection = applyVllmFallback(
    params.role,
    ROLE_SELECTORS[params.role](settings.routing.roleDefaults, params.routeOverride, ctx.isOwner(params.principal)),
    ctx.vllmAvailable,
  );
  assertCoherent(selection.api, selection.source);
  await warmVllmGenWindow(ctx, params.role, selection.source);
  return { selection, model: healModel(selection, ctx.now()) };
}

/** Resolve the caller's OWN chat-role capability descriptor END-TO-END (selection → ModelCapability) in ONE
 *  server hop — the client params-panel + the rpg lite gate consume ONLY the capability, so this collapses
 *  the former selection→descriptor round-trip (the standalone `getModelCapability` verb it superseded was
 *  deleted 2026-07-31, AU-5). Reuses the SAME selector as `resolveRole` (a vLLM default resolves identically
 *  to the engine) + the `resolveCapability` substrate mediator (no duplication). Credential-free: the chat
 *  role reads the static descriptor as authoritative. */
export function createResolveChatCapability(ctx: ConnectionContext): ConnectionService["resolveChatCapability"] {
  return async (params: ResolveChatCapabilityParams): Promise<ModelCapability> => {
    // Role is FIXED to "chat" here and the principal is the ONLY input — there is no caller-supplied user id
    // or role, so this can never resolve another tenant's connection (Injected-op caller gate).
    const { selection, model } = await resolveRoleSelection(ctx, { role: "chat", principal: params.principal });
    return resolveCapability(model, selection.source, selection.api, capabilityCaches(ctx));
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
      ...capabilityCaches(ctx),
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
