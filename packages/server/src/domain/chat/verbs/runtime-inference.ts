// Runtime capability decisions keep the caller-selected funder separate from the room's host-owned vector space.

import type { Principal } from "@orb/contracts/identity";
import { RERANK_FLOOR, windowForPreset } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { BindingActor, NoConnectionError, Resolved, RoleClientsWithSignal } from "@orb/inference";
import { carriesStructured, unavailableRefusal } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import type { ChatInferenceDeps, ChatInferenceOps } from "../contract/runtime-inference.ts";

/** The two model-window FACTS memory reads off the funder's role clients (§7.5-1b): the summarize model's window
 *  sizes the digest token guard; the embed model's input cap bounds a segment. A task with no window is
 *  `NoConnectionError` — the honest refusal, never a default window. The summarize window is the one the call sends:
 *  on a route whose window the request sets, the Utility preset's Max context (`windowForPreset`).
 */

function createTaskWindowReaders(deps: {
  readonly roleClientsFor: (funderUserId: UserId) => Promise<Pick<RoleClientsWithSignal, "resolved">>;
  readonly availability: ChatInferenceDeps["connection"]["availability"];
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  readonly resolveUtilityPresetParams: (userId: UserId) => Promise<Pick<UserIntent, "maxContextTokens"> | undefined>;
}): { readonly summarize: (funderUserId: UserId) => Promise<number>; readonly embed: (funderUserId: UserId) => Promise<number> } {
  // `resolved()` reads null for every reason the task cannot run; the availability verdict names the first one,
  // so the funder is told what to fix instead of always "nothing is bound".
  const refusalFor = async (funderUserId: UserId, task: "summarize" | "embed"): Promise<NoConnectionError> => {
    const verdict = await deps.availability({ task, principal: await deps.resolveHostPrincipal(funderUserId) });
    return unavailableRefusal(task, verdict.available ? "no-connection" : verdict.cause);
  };
  return {
    summarize: async (funderUserId): Promise<number> => {
      const resolved = await (await deps.roleClientsFor(funderUserId)).resolved("summarize");
      if (resolved === null) {
        throw await refusalFor(funderUserId, "summarize");
      }
      if (resolved.capability.kind !== "generation") {
        throw unavailableRefusal("summarize", "requirement-unmet");
      }
      const preset = await deps.resolveUtilityPresetParams(funderUserId);
      return windowForPreset(resolved.capability.generation, preset?.maxContextTokens).context.window;
    },
    embed: async (funderUserId): Promise<number> => {
      const resolved = await (await deps.roleClientsFor(funderUserId)).resolved("embed");
      if (resolved === null) {
        throw await refusalFor(funderUserId, "embed");
      }
      if (resolved.capability.kind !== "embedding") {
        throw unavailableRefusal("embed", "requirement-unmet");
      }
      return resolved.capability.embedding.maxInputTokens;
    },
  };
}

/**
 * Smart's Utility arbiter on the funder's bound row, or null when that row cannot answer it. The arbiter is
 * structured output only, so the row must carry a structured payload at all (`carriesStructured`, the planner's
 * answer). Null is the round's visible degrade, never a free-text call. How it rides is the plan's. Its window is
 * the one its call sends: the Utility preset's Max context on a route whose window the request sets.
 */
async function speakerArbiterFor(
  roles: Pick<RoleClientsWithSignal, "resolved" | "structured">,
  maxContextTokens?: number | undefined,
): ReturnType<ChatContext["resolveSpeakerArbiter"]> {
  const view = await roles.resolved("structured");
  if (view?.capability.kind !== "generation" || !carriesStructured(view)) {
    return null;
  }
  return {
    structured: (inputs, opts) => roles.structured(inputs, opts),
    contextTokens: windowForPreset(view.capability.generation, maxContextTokens).context.window,
  };
}

/** Bind chat's capability and availability rules to the runtime's injected ports. */
export function createChatInferenceOps(deps: ChatInferenceDeps): ChatInferenceOps {
  const resolveChatFor = async (funderUserId: UserId, signal?: AbortSignal, actor?: BindingActor): Promise<Resolved<"chat">> => {
    const { resolved } = await deps.connection.resolve({
      task: "chat",
      principal: await deps.resolveHostPrincipal(funderUserId),
      ...(signal === undefined ? {} : { signal }),
      ...(actor === undefined ? {} : { actor }),
    });
    return resolved as Resolved<"chat">;
  };
  const taskWindows = createTaskWindowReaders({
    roleClientsFor: deps.roleClientsFor,
    availability: deps.connection.availability,
    resolveHostPrincipal: deps.resolveHostPrincipal,
    resolveUtilityPresetParams: deps.resolveUtilityPresetParams,
  });
  return {
    resolveChat: (params) => resolveChatFor(params.funderUserId, params.signal),
    resolveConnection: ({ funderUserId, actor }) => resolveChatFor(funderUserId, undefined, actor),
    checkSendAvailability: async ({ funderUserId }) => deps.connection.availability({ task: "chat", principal: await deps.resolveHostPrincipal(funderUserId) }),
    getNextTurnConnection: async ({ funderUserId }): ReturnType<ChatInferenceOps["getNextTurnConnection"]> => {
      const row = await deps.connection.getBoundConnection({ task: "chat", principal: await deps.resolveHostPrincipal(funderUserId) });
      return row === null
        ? { state: "unset" }
        : { state: "configured", connectionLabel: row.label, provider: row.providerId, providerLabel: row.providerLabel, model: row.model };
    },
    summarizerContextTokens: taskWindows.summarize,
    embedContextTokens: taskWindows.embed,
    summarizeAvailability: async (funderUserId) =>
      deps.connection.availability({ task: "summarize", principal: await deps.resolveHostPrincipal(funderUserId) }),
    summarize: async (funderUserId, ...args) => (await deps.roleClientsFor(funderUserId)).summarize(...args),
    resolveSpeakerReranker: async (funderUserId): ReturnType<ChatInferenceOps["resolveSpeakerReranker"]> => {
      const roles = await deps.roleClientsFor(funderUserId);
      const view = await roles.resolved("rerank");
      if (view === null) {
        return null;
      }
      const capability = view.capability.kind === "rerank" ? view.capability.rerank : RERANK_FLOOR;
      return { capability, rerank: (query, documents, opts) => roles.rerank(query, documents, opts) };
    },
    resolveSpeakerArbiter: async (funderUserId, chatId): ReturnType<ChatInferenceOps["resolveSpeakerArbiter"]> => {
      const arbiter = await speakerArbiterFor(await deps.roleClientsFor(funderUserId), (await deps.resolveUtilityPresetParams(funderUserId))?.maxContextTokens);
      if (arbiter === null) {
        return null;
      }
      const onObservedResult = deps.beginObservation({ chatId, turnId: deps.newChatTurnId(), sourceMessageId: null, sourceVariantId: null });
      return { ...arbiter, structured: (inputs, opts) => arbiter.structured(inputs, { ...opts, onObservedResult }) };
    },
  };
}
