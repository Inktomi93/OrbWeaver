import type { AssembleContext, ChatDeltaEvent, ChatReasoningPart, MessageView, ToolCallRecord } from "@orb/contracts/chat";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { Resolved } from "@orb/inference";
import { rowIndexAtCacheDepth } from "@orb/inference";
import type { AssetId, CharacterId, ChatId, ChatTurnId, MessageId, ModelId, PersonaId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { testModelId } from "@orb/testkit/iso/inference-identities.ts";
import { makeCapability, makeGenerationCapability } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect } from "@orb/testkit/node/fixtures.ts";
import { buildWirePlan } from "#inference/backends/v4/prompt.ts";
import type { BoundToolExecution, ChatToolOps, ChatToolSet, RunChatTurnOp } from "#server/domain/chat/contract/context.ts";
import type { DeliveredCue, HistoryMacroNames, TurnRequest, TurnStreamChunk } from "#server/domain/chat/contract/results.ts";
import type { runTurnPipeline } from "#server/domain/chat/engine/pipeline.ts";
import { buildWireHistory } from "#server/domain/chat/substrate/wire-history.ts";
import { makeResolved } from "../../../../inference/_support.ts";

export { BEFORE_HISTORY_DEPTH } from "#server/domain/chat/assembly/injections.ts";
export type { ChatToolOps, RunChatTurnOp } from "#server/domain/chat/contract/context.ts";
export type { TurnMessage, TurnRequest, TurnStreamChunk } from "#server/domain/chat/contract/results.ts";
export { runTurnPipeline } from "#server/domain/chat/engine/pipeline.ts";
export { __spanConvertsToNothingForTest, __spanToWirePartForTest } from "#server/domain/chat/substrate/wire-history.ts";

export const CAPABILITY: GenerationCapability = makeGenerationCapability({
  output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] },
  context: { window: 200_000 },
});

export const CONNECTION: Resolved<"chat"> = makeResolved({
  api: "chat-completions",
  model: castId<ModelId>("test-model"),
  capability: makeCapability(CAPABILITY),
});

// The fixture's ONE human — the turn's trigger AND the author of every user row below, which is what a real
// send produces (`persistUserMessage` stamps `authorUserId: principal.userId` on every user row; the import
// path stamps the owner). SHAPE's null-stamp guard reads exactly that pair, so a fixture that omits either
// side models a room nobody wrote in and would floor rows the real turn attributes.
export const FIXTURE_HUMAN = castId<UserId>("user_fixture_human");

export function ctxOf(over: Partial<AssembleContext> = {}): AssembleContext {
  return {
    timezone: UTC_TIME_ZONE,
    character: { name: "Aria", description: "a bold knight" },
    promptConfig: DEFAULT_PROMPT_CONFIG,
    activePersona: { name: "Alex", description: "the user" },
    activePersonaUserId: FIXTURE_HUMAN,
    recentMessages: [],
    ...over,
  };
}

// CANON ROWS CARRY AN ID. `shape.ts` stamps `messageId: m.id` on every canon row it emits (both the
// assistant and the user/narrator branch), and the wire seam now reads that presence to tell stored content
// from content the assembly AUTHORED this turn (a spliced injection / the synthetic regen turn are id-less
// by construction — see `resolveFullCards`). A fixture without an id therefore models a synthetic row, not a
// canon one, and would silently opt every card in these tests out of the keep-last-X window.
let nextRowId = 0;
export const rowOf = (role: "user" | "assistant", content: string): MessageView => {
  nextRowId += 1;
  // Slim MessageView double — runTurnPipeline reads only id/role/kind/content/excludedFromPrompt/
  // characterId/personaId/authorUserId off a canon row (see file header).
  // @orb-waive no-test-fabrication(unknown): same slim-double judgment as seqRow above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return {
    id: `message_fixture_${nextRowId}`,
    role,
    // A real row always DECLARES its purpose (`messages.kind`, NOT NULL default `standard`); a double that
    // omits it models a row the read seam cannot produce (D129).
    kind: "standard",
    content,
    excludedFromPrompt: false,
    characterId: null,
    personaId: null,
    authorUserId: role === "user" ? FIXTURE_HUMAN : null,
  } as unknown as MessageView;
};

export const userRow = (content: string): MessageView => rowOf("user", content);

export function scriptedTurn(chunks: readonly TurnStreamChunk[]): RunChatTurnOp {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      for (const c of chunks) {
        yield c;
      }
    })();
}

type PipelineArgs = Parameters<typeof runTurnPipeline>[0];

export function baseArgs(over: Partial<PipelineArgs> = {}): {
  args: PipelineArgs;
  deltas: ChatDeltaEvent[];
} {
  const deltas: ChatDeltaEvent[] = [];
  const args: PipelineArgs = {
    // The turn clock — frozen by default (nothing but the reasoning-window measurement reads it, and a
    // frozen clock is the honest "no time passed" for every other case). The #184 tests inject a stepping one.
    now: () => FROZEN_AT_MS,
    // Default = the native replace (no node:vm) — a RECEIVE-watchdog test overrides with a throwing fake.
    applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
    // §6.7: the fence's origin set. Empty ⇒ CLOSED — no assistant-row asset is model-visible, which is what
    // every test in this file assumes; the relaxation is proven at the substrate seam instead.
    loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, ReadonlySet<AssetId>>()),
    runChatTurn: scriptedTurn([
      { kind: "text", text: "Hel" },
      { kind: "text", text: "lo" },
      {
        kind: "final",
        economics: { content: "Hello", tokensIn: 3, tokensOut: 1, model: testModelId("test-model") },
      },
    ]),
    resolveImageUrl: (ref) => Promise.resolve({ url: ref.kind === "asset" ? `https://cas.test/${ref.assetId}` : ref.url, media: "image" as const }),
    // §8.8: the `conversation` carry source. Default EMPTY and THROWS if reached — every test below runs
    // the `off`/`tool-chain` rungs, where the pipeline must not perform this read at all.
    loadReasoningParts: (): Promise<ReadonlyMap<MessageId, readonly ChatReasoningPart[]>> =>
      Promise.reject(new Error("loadReasoningParts must not be reached")),
    loadCues: (): Promise<ReadonlyMap<MessageId, DeliveredCue>> => Promise.reject(new Error("loadCues must not be reached")),
    assembleContext: ctxOf(),
    canon: [userRow("u1")],
    connection: CONNECTION,
    intent: {} satisfies UserIntent,
    kind: "send",
    // D17: the engine-derived consent verdict the pipeline stamps onto the built TurnRequest (a self-triggered
    // owner turn here — inert for the vllm CONNECTION, but the field is non-optional on the args).

    chatId: castId<ChatId>("chat_a"),
    onDelta: (d: ChatDeltaEvent): void => {
      deltas.push(d);
    },
    // The D48 axis defaults: tool-use unwired + nothing attached — the loop degenerates to one call
    // (the byte-identical no-op); the loop goldens override these.
    tools: null,
    attachedToolNames: [],
    toolRecurseLimit: 5,
    toolExecFrame: {
      runAsUserId: castId("user_host"),
      triggeredBy: castId("user_host"),
      chatId: castId<ChatId>("chat_a"),
      membership: null,
      turnId: castId<ChatTurnId>("chat_turn_a"),
    },
    ...over,
  };
  return { args, deltas };
}

type PipelineResult = Awaited<ReturnType<typeof runTurnPipeline>>;

/** The history rows a prompt cache writes on this turn: every row up to the deepest breakpoint the runner places.
 *  The runner pins depth d and d+2 (`computeCacheBreakpointPlacements`); the deeper one drops off a short history. */
function cachedHead(result: PipelineResult): TurnRequest["history"] {
  const depth = result.request.cacheBreakpointFromEnd;
  if (depth === null) {
    return [];
  }
  const rows = result.request.history;
  const at = rowIndexAtCacheDepth(rows, depth + 2) ?? rowIndexAtCacheDepth(rows, depth);
  return rows.slice(0, (at ?? -1) + 1);
}

/** Anthropic's cache is an exact prefix: turn N+1 reads turn N's history cache only when every row up to N's
 *  deepest breakpoint repeats byte for byte, so each cached block still ends where it ended. */
export function readsPriorCache(prior: PipelineResult, next: PipelineResult): boolean {
  const head = cachedHead(prior);
  return head.length > 0 && JSON.stringify(next.request.history.slice(0, head.length)) === JSON.stringify(head);
}

// ── History macro resolution (resolve-on-READ; D26/D51 — storage stays raw, every prompt build re-resolves) ──
export const ARIA = castId<CharacterId>("char_aria");
export const KAI = castId<CharacterId>("char_kai");

// Slim MessageView doubles — the history-macro resolver reads only role/kind/content/excludedFromPrompt/
// characterId/personaId(/authorUserId) off a canon row (see file header).
export const assistantRow = (content: string, characterId: CharacterId): MessageView =>
  // @orb-waive no-test-fabrication(unknown): same slim-double judgment as seqRow/rowOf above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  ({
    role: "assistant",
    kind: "standard",
    content,
    excludedFromPrompt: false,
    characterId,
    personaId: null,
  }) as unknown as MessageView;

export const userRowWithPersona = (content: string, personaId: PersonaId): MessageView =>
  // @orb-waive no-test-fabrication(unknown): same slim-double judgment as seqRow/rowOf/assistantRow above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  ({
    role: "user",
    kind: "standard",
    content,
    excludedFromPrompt: false,
    characterId: null,
    personaId,
    authorUserId: FIXTURE_HUMAN,
  }) as unknown as MessageView;

/** Flatten every wire history row's text parts into one string (the assembled prompt the model sees). */
export const historyText = (req: TurnRequest): string =>
  req.history
    .flatMap((h) => h.content)
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n");

/** Build the {@link HistoryMacroNames} producer `args.historyMacroNames` takes — the test-local stand-in
 *  for the engine's `loadChatIdentityProducer` + `buildIdentityNameContext` (Chat-Macro-Resolution.md §1 / D137). */
export function macroNamesOf(
  chars: readonly { id: CharacterId; name: string }[] = [],
  personas: readonly { id: PersonaId; name: string; description?: string }[] = [],
): HistoryMacroNames {
  return {
    characterNamesById: new Map(chars.map((c) => [c.id, { name: c.name }])),
    personaNamesById: new Map(personas.map((p) => [p.id, { name: p.name, description: p.description ?? "" }])),
  };
}

export const MIRA = castId<PersonaId>("persona_mira");
export const ZARA = castId<PersonaId>("persona_zara");

// ── RECEIVE (D53 step 2): <think>-demux → AI_OUTPUT regex → post-process → REASONING regex ─────────────────
/** A host-tier regex script (fully defaulted via the parse seam) for a single placement. */
export function script(label: string, find: string, replace: string, placement: "AI_OUTPUT" | "DISPLAY" | "REASONING" | "PROMPT_HISTORY"): RegexScriptRow {
  return regexScriptSchema.parse({
    // D121-E: a row id is a real `regex_script_…` TypeID; the readable label rides on `name`.
    id: mintTypeId(ID_PREFIX.regexScript),
    name: label,
    // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
    updatedAt: 1_700_000_000_000,
    findRegex: find,
    replaceString: replace,
    placement: [placement],
    // `historyDepth` is REQUIRED on (and only on) a PROMPT_HISTORY script — the schema's total pairing check.
    // Unbounded (`max: null`) = every row, which is what a placement-comparison probe wants.
    ...(placement === "PROMPT_HISTORY" ? { historyDepth: { min: 0, max: null } } : {}),
  });
}

/** A turn that emits ONLY a terminal `final` chunk carrying the given content (+ optional native reasoning). */
export function finalTurn(content: string, reasoning?: string): RunChatTurnOp {
  return scriptedTurn([
    {
      kind: "final",
      economics: reasoning === undefined ? { content } : { content, reasoning },
    },
  ]);
}

export const cfgWith = (over: Partial<PromptConfig>): PromptConfig => ({
  ...DEFAULT_PROMPT_CONFIG,
  ...over,
});

// ── The D48 recurse loop (the goldens) ────────────────────────────────────────────
// A REAL resolved descriptor for a tool-capable OpenRouter model (§U0 checkpoint: the loop's capability
// gate keys on the real synthesis output, not a synthetic literal). The OR arm sets `tools.parallel:true`;
// the loop gate reads only the PRESENCE of `capability.tools`, so the parallel flag is inert here.
export const TOOL_CAPABILITY: GenerationCapability = makeGenerationCapability({ ...CAPABILITY, tools: { parallel: true } });

export const TOOL_CONNECTION: Resolved<"chat"> = { ...CONNECTION, capability: makeCapability(TOOL_CAPABILITY) };

/** A scripted role returning one chunk-set PER INVOCATION (depth k gets script[k]); captures requests. */
export function scriptedDepths(scripts: readonly (readonly TurnStreamChunk[])[], sink: TurnRequest[]): RunChatTurnOp {
  let call = 0;
  return (req) => {
    sink.push(req);
    const chunks = scripts[Math.min(call, scripts.length - 1)] ?? [];
    call += 1;
    return (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      for (const c of chunks) {
        yield c;
      }
    })();
  };
}

export const toolFinal = (content: string, calls: readonly { id: string; name: string; args: string }[]): TurnStreamChunk => ({
  kind: "final",
  economics: {
    content,
    tokensIn: 10,
    tokensOut: 5,
    costUsd: 0.01,
    finishReason: "tool",
    toolCalls: calls.map((c) => ({ toolCallId: c.id, name: c.name, arguments: c.args })),
  },
});

export const doneFinal = (content: string): TurnStreamChunk => ({
  kind: "final",
  economics: { content, tokensIn: 7, tokensOut: 3, costUsd: 0.02, finishReason: "stop" },
});

export async function assertConvertedToolNames(records: readonly ToolCallRecord[], content: string, names: readonly string[]): Promise<void> {
  const prior = { ...rowOf("assistant", content), toolCalls: records };
  const converted = await buildWireHistory(
    {
      toolsOk: true,
      visionOk: false,
      videoOk: false,
      cardKeepLastX: undefined,
      canon: [prior],
      resolveImageUrl: () => Promise.resolve(null),
      loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, ReadonlySet<AssetId>>()),
      reasoningByMessage: new Map<MessageId, readonly ChatReasoningPart[]>(),
    },
    [{ role: "assistant", content, messageId: prior.id }],
  );
  const history = converted.flatMap((wire) => [...(wire.prefixRows ?? []), wire.row]);
  const plan = buildWirePlan({ systemPrompt: { static: "", dynamic: "" }, history });
  const results = plan.prompt.flatMap((frame) => (frame.role === "tool" ? frame.content : [])).filter((part) => part.type === "tool-result");
  expect(results.map((part) => part.toolName)).toEqual(names);
}

export function offeredNames(req: TurnRequest | undefined): readonly string[] | undefined {
  const tools = req?.tools;
  if (tools === undefined) {
    return;
  }
  return [...(tools.offer?.definitions ?? []), ...(tools.terminal ?? [])].map((t) => t.name);
}

/** A fake ChatToolOps: echoes executions as records; `failWith` makes every call errors-as-data. `drivers`
 *  records who each attach-time resolve was scoped to (#677). */
export function fakeToolOps(executed: string[][], failWith?: string, drivers: UserId[] = []): ChatToolOps {
  return {
    resolveTools: (driverUserId): ChatToolSet => {
      drivers.push(driverUserId);
      return {
        toToolDefinitions: () => [{ name: "tick_clock", description: "d", parameters: { type: "object" }, inputShape: {} }],
        prepareExecution: (): Promise<BoundToolExecution> =>
          Promise.resolve((calls): Promise<ToolCallRecord[]> => {
            executed.push(calls.map((c) => c.name));
            return Promise.resolve(
              calls.map((c) => ({
                toolCallId: c.toolCallId,
                name: c.name,
                arguments: c.arguments,
                result: failWith === undefined ? JSON.stringify({ ok: c.name }) : JSON.stringify({ error: failWith }),
                isError: failWith !== undefined,
                durationMs: 1,
              })),
            );
          }),
      };
    },
  };
}
