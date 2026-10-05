import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ChatRequest, ChatResult, Resolved } from "@orb/inference";
import type { MessageId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { z } from "zod";
import { runTurnPipeline } from "../../../packages/server/src/domain/chat/engine/pipeline.ts";
import { createToolUseService } from "../../../packages/server/src/domain/tool-use/service.ts";
import { buildChatToolOps, createRunChatTurnBridge } from "../../../packages/server/src/entry/compose/chat.ts";

const PROBE_TIMEOUT_MS = 120_000;

export const TOOL_NAMES = ["lookup_alpha", "lookup_beta"] as const;
export const EXPECTED_VALUES = ["ORBIT_ALPHA_17", "ORBIT_BETA_29"] as const;

export function registryFor(owner: Principal): {
  registry: ReturnType<typeof createToolUseService>;
  definitions: ReturnType<ReturnType<typeof createToolUseService>["toToolDefinitions"]>;
  ops: ReturnType<typeof buildChatToolOps>;
} {
  const registry = createToolUseService({ can: () => undefined, clock: () => 0 });
  for (const [index, name] of TOOL_NAMES.entries()) {
    registry.register({
      name,
      description: `Look up the exact ${name} value. This read has no side effects.`,
      argsSchema: z.object({ key: z.literal("value") }),
      capability: null,
      source: "builtin",
      handler: () => Promise.resolve({ ok: true, value: { value: EXPECTED_VALUES[index] } }),
    });
  }
  const set = registry.resolveTools(owner.userId, TOOL_NAMES);
  return { registry, definitions: registry.toToolDefinitions(set), ops: buildChatToolOps(registry, () => Promise.resolve(owner)) };
}

export function ordinaryTurn(args: {
  readonly connection: Resolved<"chat">;
  readonly owner: Principal;
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
}): ReturnType<typeof runTurnPipeline> {
  const tools = registryFor(args.owner);
  const prompt =
    "Call lookup_alpha and lookup_beta with key value before answering. You do not know their values. After both results return, answer with the two exact returned values in alpha then beta order. Do not call a tool again after receiving its value.";
  return runTurnPipeline({
    connection: args.connection,
    intent: { effort: "low", carryReasoning: "off", maxOutputTokens: 16_384 },
    assembleContext: {
      timezone: UTC_TIME_ZONE,
      character: { name: "Observer", description: "Follow the user's tool instructions exactly." },
      promptConfig: DEFAULT_PROMPT_CONFIG,
      recentMessages: [],
    },
    canon: [],
    appendUserTurn: prompt,
    kind: "send",
    chatId: mintTypeId(ID_PREFIX.chat),
    now: () => 0,
    runChatTurn: createRunChatTurnBridge({ runChatTurn: args.runChatTurn }),
    applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
    resolveImageUrl: () => Promise.resolve(null),
    loadReasoningParts: () => Promise.resolve(new Map<MessageId, never>()),
    loadCues: () => Promise.resolve(new Map<MessageId, never>()),
    loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, never>()),
    onDelta: () => undefined,
    tools: tools.ops,
    attachedToolNames: TOOL_NAMES,
    toolRecurseLimit: 1,
    toolExecFrame: {
      runAsUserId: args.owner.userId,
      triggeredBy: args.owner.userId,
      chatId: mintTypeId(ID_PREFIX.chat),
      membership: null,
      turnId: mintTypeId(ID_PREFIX.chatTurn),
    },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
}
