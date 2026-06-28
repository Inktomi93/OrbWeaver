// verb: resolveRole — the ONE resolver for all 7 inference roles (connection.md §1, PD-9). Reads the
// principal's `routing.roleDefaults.<role>`, applies the optional per-agent override, validates `(api,
// source)` coherence, heals the model id, and returns the resolved `{api, model, credential, capability}`.
// NO per-role hard-pin — every role reads its roleDefault, so a role can resolve to ANY source it supports
// incl. `local-light` (PD-9: the old vllm-hard-pin is GONE). The dispatch is a `{ [K in RoutingRoleKey]:
// … }` mapped Record (exhaustive — a new role missing its selector is a `tsc` error; invariant 5).
//
// The catalog subsystem is reached ONLY through `substrate/` (domain-substrate-mediates-subsystems):
// `healToChatDefault` / `pickOrModel` / `resolveCapability` / `getCachedOrModels` are the substrate seams.
// `runner`/`family` never appear (sealed in infra; invariants 1 & 6). `agentOverride` BEATS the role
// default (participants-agents-identity.md §2 — a character/buddy on its own backend/model).

import type { ChatApi, ChatSource, ResolvedConnection } from "@orb/contracts/connection";
import type { UserSettings } from "@orb/contracts/settings";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { env } from "#foundation/env";
import { ConnectionRoutingError } from "../contract/errors";
import type { AgentOverride, ResolveRoleParams } from "../contract/params";
import type { ConnectionContext, ConnectionService } from "../contract/service";
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
  readonly source: ChatSource;
  readonly model: string | null;
  readonly chatModel: boolean;
}

// Defaults (named — no magic strings). The chat/agent/summarize roles default to the local engine; agent
// defaults to the owner's sub; generateImage is hosted-only. A role with NO roleDefault entry reads these.
const DEFAULT_CHAT_API: ChatApi = "chat-completions";
const DEFAULT_LOCAL_SOURCE: ChatSource = "vllm";
const DEFAULT_AGENT_SOURCE: ChatSource = "max-pro-sub";
const DEFAULT_IMAGE_SOURCE: ChatSource = "openrouter";

/** The per-role selectors — exhaustive over `RoutingRoleKey` (invariant 5). `agentOverride` fields beat the
 *  role default. There is no `roleDefaults.agent` (the schema has 6 role keys); the `agent` role falls back
 *  to the chat default beneath the override. */
const ROLE_SELECTORS: {
  readonly [K in ResolveRoleParams["role"]]: (
    roleDefaults: RoleDefaults,
    override: AgentOverride | undefined,
  ) => RouteSelection;
} = {
  chat: (rd, ov) => ({
    api: ov?.api ?? rd.chat?.api ?? DEFAULT_CHAT_API,
    source: ov?.source ?? rd.chat?.source ?? DEFAULT_LOCAL_SOURCE,
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
  summarize: (rd, ov) => ({
    api: DEFAULT_CHAT_API,
    source: ov?.source ?? rd.summarize?.source ?? DEFAULT_LOCAL_SOURCE,
    model: ov?.model ?? rd.summarize?.model ?? env.VLLM_GEN_MODEL,
    chatModel: true,
  }),
  generateImage: (rd, ov) => ({
    api: DEFAULT_CHAT_API,
    source: ov?.source ?? rd.generateImage?.source ?? DEFAULT_IMAGE_SOURCE,
    model: ov?.model ?? rd.generateImage?.model ?? null,
    chatModel: false,
  }),
};

/** Reject an incoherent `(api, source)` selection (the only thrown-error path). `agent-sdk` serves only the
 *  sub + the OR-skin; `chat-completions`/`responses` cannot run on the agent-sdk-only `max-pro-sub`. */
function assertCoherent(api: ChatApi, source: ChatSource): void {
  if (api === "agent-sdk") {
    if (source !== "max-pro-sub" && source !== "openrouter") {
      throw new ConnectionRoutingError(api, source);
    }
    return;
  }
  // chat-completions | responses
  if (source === "max-pro-sub") {
    throw new ConnectionRoutingError(api, source);
  }
}

/** Heal the selection's model id to a branded `ModelId`. Chat-family roles heal per api/source (agent-sdk →
 *  curated default; openrouter → the dual-guard pick); non-chat roles + local sources carry their concrete
 *  engine/model string through. `now` feeds the (injected-clock) catalog cache the OR guard reads. */
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
    const selection = ROLE_SELECTORS[params.role](
      settings.routing.roleDefaults,
      params.agentOverride,
    );
    assertCoherent(selection.api, selection.source);

    const model = healModel(selection, ctx.now());
    const credential = await ctx.resolveCredential({
      principal: params.principal,
      source: selection.source,
    });
    const capability = resolveCapability(model, selection.source, getCachedOrModels(ctx.now()));
    return { api: selection.api, model, credential, capability };
  };
}
