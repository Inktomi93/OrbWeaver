// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import "@orb/testkit/node/composed-real.ts";
// @orb-waive-file no-test-fabrication({ name: string; description: string; parameters: Record<string, unknown> }[]): baselined when the gate widened to value casts; burn-down item 906.
import type { Principal } from "@orb/contracts/identity";
import type { ChatApi, ProviderId } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { RpgExtraction, RpgStateCaptureVehicle } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { ChatRequest, ChatResult, ResolveOutcome } from "@orb/inference";
import { generationOf } from "@orb/inference";
import type { ChatId, ChatTurnId, Handle, MessageId, MessageVariantId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createResolveViewerVisibility } from "@orb/server/domain/chat";
import type { ServicesResult } from "@orb/server/entry/compose";
import { makeCapability, makeGenerationCapability } from "@orb/testkit/node/factories/resolved-connection.ts";
import { detectModelFamily } from "#inference/capability/families.ts";
import { curatedRows } from "#inference/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "#inference/capability/synthesize.ts";
import type { RpgTurnContext, RpgTurnTranscriptMessage } from "#server/domain/chat/index.ts";
import type { RpgTraceSink } from "#server/domain/rpg/index.ts";
import { buildRpg } from "#server/entry/compose/rpg.ts";
import { makeResolved } from "../../../inference/_support.ts";
import { seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";

export type { RpgTurnContext } from "#server/domain/chat/index.ts";
export { rpgPromotionProvenance } from "#server/domain/rpg/index.ts";
export { commitSnapshotForVariant, findSnapshotByVariant, writeStagedSnapshot } from "#server/domain/rpg/persistence/snapshots.ts";
export { findTurnToolCallsByVariant } from "#server/domain/rpg/persistence/turn-tool-calls.ts";
export { defaultSnapshotState } from "#server/domain/rpg/substrate/default-state.ts";
export { buildRpg } from "#server/entry/compose/rpg.ts";

export const TURN: ChatTurnId = castId<ChatTurnId>("chat_turn_compose_1");

/** The character turn's resolved connection + consent verdict the flush threads into the state round (F1). The
 *  `api` selects the round's routed arm (agent-sdk → the structured CHAT path; else the `structured` dispatcher);
 *  the model is "fake-chat-model" so the spy's model assertions still match. Writer-capable (structured + tools)
 *  + consent ON so the flush's F2 gate passes and the round runs. `over` pins the F1 consent/source cases. */
export function tc(api: ChatApi, over: Partial<RpgTurnContext> = {}): RpgTurnContext {
  return {
    kind: "send",
    connection: makeResolved({
      api,
      model: castId<ModelId>("fake-chat-model"),
      capability: makeCapability(
        makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] }, tools: { parallel: true } }),
      ),
    }),

    // Default: an empty transcript (the round fires with an empty beat; the canned fakes ignore prompt
    // content). The §1.3 window/beat tests below pass a real name-stamped transcript.
    transcript: [],
    // R1: `null` = the folded tools did NOT ride this turn (the post-commit round runs); a fold test overrides
    // it with the calls the character turn co-emitted.
    terminalToolCalls: null,
    // #1617: no declaration collided — the empty list is what an ordinary turn reports, and the fold reads it
    // to tell a WITHHELD channel apart from a wire that could not carry one.
    terminalToolsCollided: [],
    // The round's cancellation inputs: the owner it is scoped to, and the character turn's own signal (absent by
    // default — on a real single-speaker turn it is already released before the round runs).
    triggeredBy: castId<UserId>("user_host"),
    signal: undefined,
    // PROSE-1 S4 — the turn's FROZEN prose view (empty ⇒ shipped defaults; an override test passes a record).
    prose: {},
    ...over,
  };
}

/** Build a name-stamped transcript from `(speaker, text)` pairs — the §1.3 story evidence the state round
 *  reads. `tokens` uses the same char/4 heuristic as the engine's `estimateTokens` (good enough for the
 *  budget-slice tests; the exact value isn't asserted). Assistant rows get a name; a null speaker is "You". */
export function transcript(
  rows: readonly { readonly speaker: string | null; readonly text: string; readonly role?: RpgTurnTranscriptMessage["role"] }[],
): RpgTurnTranscriptMessage[] {
  return rows.map((r) => ({ role: r.role ?? "assistant", speakerName: r.speaker, content: r.text, tokens: Math.ceil(r.text.length / 4) }));
}

export function hostPrincipal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId("host"), externalId: null, via: "header" };
}

/** Seed a real chat with a host participant — the membership rpg's createGame gates on (through the REAL
 *  injected getMembership off createServices). Returns the chat + host ids. */
export async function seedHostGameChat(db: Db, key: string): Promise<{ chatId: ChatId; hostId: UserId }> {
  const hostId = await seedUser(db, castId<Handle>(`rpghost_${key}`));
  const chatId = await seedChat(db, key);
  await seedParticipant(db, { chatId, key: `${key}_host`, userId: hostId, role: "host", joinSeq: 0 });
  return { chatId, hostId };
}

/** A canned structured extraction (the model's structured output) — a location move + a journal beat. Emitted as
 *  JSON text the real `runExtraction` parses through `rpgExtractionSchema`. */
export const CANNED_EXTRACTION = {
  party: [],
  inventory: [],
  scene: { location: "the obsidian tower", recentEvent: "arrived at the tower" },
  trackers: [],
  quests: [],
  journal: [{ type: "location", label: "", title: "Arrival", content: "They reached the tower." }],
} satisfies RpgExtraction;

/** The route the fake host connection resolves to, and which executor method actually fired. The structured
 *  extraction routes BY api: `agent-sdk` → `executor.runChatTurn` (structured-output chat path); every other api
 *  → `executor.structured`. Per-turn only the agent-sdk arm is reachable (a wire that CAN carry `tools[]` runs
 *  the tool round instead); the `structured` dispatcher arm is the HOST RESYNC's. */
interface ExtractionSpy {
  readonly summarizeModels: string[];
  readonly chatTurns: { model: string; hasResponseFormat: boolean; hasToolServer: boolean }[];
  /** The WIRE TOOLS each `runChatTurn` carried (the tool round's vehicle) — so a test can assert the round's set
   *  + its ref-constrained parameters reached the request, the tool-arm twin of `schemas`. */
  readonly wireTools: { name: string; description: string; parameters: Record<string, unknown> }[][];
  /** The response-format SCHEMA the impl put on the wire per call — so a test can assert the R1 ref enum
   *  (`constrainExtractionSchema`) reached the request, on either arm. */
  readonly schemas: Record<string, unknown>[];
  /** The keys each `responseFormat` carried, sorted: a caller states the schema and nothing about how it rides. */
  readonly formatKeys: string[][];
  /** The system prompts the impl sent — so a test can assert the R1 ref enumeration (the fallback arm). */
  readonly systemPrompts: string[];
  /** The user prompts the impl sent — so a §1.3 test can assert the RECENT STORY block (window arm) + the
   *  byte-compat `beat` arm shape. Captured on both routed arms (structured `userPrompt` / agent-sdk `prompt`). */
  readonly userPrompts: string[];
  /** The cancellation signal each request carried (RPG-SIGNAL). `undefined` here would mean the round is
   *  uncancelable at the LAST hop no matter what the flush believes — this is the only tier that can see it. */
  readonly signals: (AbortSignal | undefined)[];
  /** The window each request's connection carried — what an Ollama native route sends as `num_ctx`. */
  readonly windows: number[];
}

/** Build an rpg seam over the REAL chat wiring (off `app.chatRpgOps`) + real db, with a FAKE executor/connection
 *  (never a live model). This exercises the ACTUAL `buildRpg` + extraction impl, only faking the model.
 *  The resolved connection carries a structured-output capability so the honest-arms verdict isn't readonly.
 *  `api` selects the routed arm; the spy records which executor method fired. */
export function buildCannedRpg(app: ServicesResult, db: Db, api: ChatApi, spy: ExtractionSpy): ReturnType<typeof buildRpg> {
  return buildCannedRpgWithText({ app, db, api, spy, cannedText: JSON.stringify(CANNED_EXTRACTION) });
}

/** Record what ONE fake `runChatTurn` was handed — the spy half of the harness, hoisted out of the arm so the
 *  arm stays a plain reply builder (both vehicles' pins read these fields). */
function recordChatTurn(spy: ExtractionSpy, req: Parameters<NonNullable<Parameters<typeof buildRpg>[0]["executor"]["runChatTurn"]>>[0]): void {
  spy.chatTurns.push({
    model: req.connection.model,
    hasResponseFormat: req.responseFormat !== undefined,
    hasToolServer: "toolServer" in req && req.toolServer !== undefined,
  });
  spy.signals.push(req.signal);
  spy.windows.push(generationOf(req.connection).context.window);
  if (req.responseFormat !== undefined) {
    spy.schemas.push(req.responseFormat.schema);
    spy.formatKeys.push(Object.keys(req.responseFormat).toSorted());
  }
  if ("tools" in req && Array.isArray(req.tools)) {
    spy.wireTools.push(req.tools as { name: string; description: string; parameters: Record<string, unknown> }[]);
  }
  // The SYSTEM prompt is captured on EVERY api, not just agent-sdk: `ChatTurnRequest.systemPrompt` is one
  // `{static,dynamic}` shape across the wires, and the CHEAP TOOL ROUND (an array wire) is the second write
  // surface — leaving it uncaptured meant no tier could see what that vehicle actually teaches. The USER prompt
  // stays agent-sdk-only because only that arm carries a flat `prompt` (the array wires send `history`).
  spy.systemPrompts.push(req.systemPrompt.static);
  if (req.api === "agent-sdk") {
    spy.userPrompts.push("prompt" in req && typeof req.prompt === "string" ? req.prompt : "");
  }
}

// The same harness with a caller-supplied extraction reply text — the R3 pins drive an EMPTY / a
// phantom-target extraction through the real fold to prove the visibility logs fire.
export function buildCannedRpgWithText(args: {
  readonly app: ServicesResult;
  readonly db: Db;
  readonly api: ChatApi;
  readonly spy: ExtractionSpy;
  readonly cannedText: string;
  /** The tool calls the fake model answers a CHEAP tool round with (`ChatResult.toolCalls`) — the third
   *  delivery vehicle's canned output, so one harness can drive all three (EXT-4a's equal-drop pin). */
  readonly cannedToolCalls?: readonly { readonly name: string; readonly arguments: string }[];
  /** Optional second-pass answer when the round narrows its tools to Inventory + no_changes. */
  readonly inventoryAuditToolCalls?: readonly { readonly name: string; readonly arguments: string }[];
  /** Successive replies of the `structured` role, in call order (a structured round and its follow-up pass);
   *  past the end, every call answers `cannedText`. */
  readonly structuredReplies?: readonly string[];
  /** Make the `structured` role REJECT — the provider-refusal arm (RESYNC-OR: an OpenRouter 400 on the
   *  structured request is what the host actually hit, and the round must report it, not swallow it). */
  readonly structuredThrows?: Error;
  /** Make the CHAT role REJECT — the same refusal arm on the tool-round vehicle (the resync's catch-up round
   *  rides `runChatTurn` since 2026-08-03, so this is where a provider refusal now lands for a host click). */
  readonly chatThrows?: Error;
  /** Override the resolved connection's capability — e.g. a STRUCTURED-only wire (no `tools`), which is what
   *  routes the resync down its structured degrade instead of the tool round. */
  readonly capability?: ReturnType<typeof makeGenerationCapability>;
  /** Resolve a different connection per principal — the room's host and a member each binding their own — so a
   *  pin can prove WHOSE connection a read prices. Wins over `capability`. */
  readonly resolvedFor?: (userId: UserId) => ReturnType<typeof makeResolved>;
  /** R-OBS — the rpg flight-recorder sink. Omitted ⇒ untraced, which is what every other pin here drives (and
   *  is itself the zero-cost/byte-identical claim: those pins pass unchanged with no sink wired). */
  readonly trace?: RpgTraceSink;
  /** Replace the fake chat arm with a REAL infra chat surface. The WIRE-CAPTURE landing pin drives the ACTUAL
   *  vllm surface (real `buildBody` + the real `captureWire` sink → the real ring) through this seam, because
   *  a fake executor can never prove the round's request reaches the debug read. Wins over `chatThrows`. */
  readonly chatArm?: NonNullable<Parameters<typeof buildRpg>[0]["executor"]["runChatTurn"]>;
  /** The room preset's Max context, as chat's preset ladder resolves it; omitted ⇒ the real ladder answers. */
  readonly presetMaxContext?: number;
  readonly onRequest?: (request: ChatRequest) => void;
}): ReturnType<typeof buildRpg> {
  const { app, db, api, spy, cannedText, cannedToolCalls, structuredThrows, chatThrows, capability } = args;
  const structuredReplies = [...(args.structuredReplies ?? [])];
  // `reply` (the extraction), `toolCalls` (a cheap tool round), `events` and `usage`/`finishReason`/`durationApiMs`
  // (the round's §10.1a economics line) are read; the rest of the ~18-field ChatResult is inert, so a full
  // construction would be noise.
  const replyOf = (reply: string, toolCalls?: readonly { readonly name: string; readonly arguments: string }[]): ChatResult =>
    // @orb-waive no-test-fabrication(unknown): minimal ChatResult double — only the fields the arms actually read; the others never run. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    ({
      reply,
      ...(toolCalls === undefined ? {} : { toolCalls }),
      events: [],
      usage: {
        model: "fake-chat-model",
        tokensIn: 1200,
        tokensOut: 90,
        cacheReadTokens: 800,
        cacheWriteTokens: 0,
        reasoningTokens: null,
        costUsd: 0.0042,
      },
      durationApiMs: 310,
      finishReason: "stop",
    }) as unknown as ChatResult;
  // The structured call: the spy records the model, the constrained schema and both prompts, on any api.
  const structuredTurn = (req: ChatRequest): Promise<ChatResult> => {
    if (structuredThrows !== undefined) {
      return Promise.reject(structuredThrows);
    }
    spy.summarizeModels.push(req.connection.model);
    if (req.responseFormat !== undefined) {
      spy.schemas.push(req.responseFormat.schema);
      spy.formatKeys.push(Object.keys(req.responseFormat).toSorted());
    }
    spy.systemPrompts.push(req.systemPrompt.static);
    spy.userPrompts.push(
      req.api === "agent-sdk" ? req.prompt : (req.history[0]?.content.map((part) => (part.type === "text" ? part.text : "")).join("") ?? ""),
    );
    spy.signals.push(req.signal);
    spy.windows.push(generationOf(req.connection).context.window);
    return Promise.resolve(replyOf(structuredReplies.shift() ?? cannedText));
  };
  // The chat and tool-round arm: the spy records that the request carried tools or a response format.
  const chatTurn = (req: ChatRequest): Promise<ChatResult> => {
    recordChatTurn(spy, req);
    const inventoryAudit =
      args.inventoryAuditToolCalls !== undefined &&
      "tools" in req &&
      req.tools?.some((tool) => tool.name === "update_inventory") === true &&
      req.tools.every((tool) => tool.name === "update_inventory" || tool.name === "no_changes");
    return Promise.resolve(replyOf(cannedText, inventoryAudit ? args.inventoryAuditToolCalls : cannedToolCalls));
  };
  const handle = databaseHandle(db);
  return buildRpg({
    db: handle,
    now: () => FROZEN_AT_MS,
    ...(args.trace === undefined ? {} : { trace: args.trace }),
    rpgChatOps:
      args.presetMaxContext === undefined
        ? app.chatRpgOps
        : { ...app.chatRpgOps, resolveChatPresetParams: (): Promise<UserIntent> => Promise.resolve({ maxContextTokens: args.presetMaxContext }) },
    // #1528 - the member-facing reads' projection verdict, built off the same db (chat's ONE clamp home).
    resolveViewerVisibility: createResolveViewerVisibility({ db: handle }),
    connection: {
      // The READ-side `trackersReadOnly` pill resolves the ROOM connection via `resolveChat` (the F1 seam — the
      // per-chat-routing verb, not the host's global `resolveRole` default). The state ROUNDS re-resolve NOTHING;
      // they ride the `turnConnection` handed to `onTurnCompleted` below.
      resolve: (req): Promise<ResolveOutcome> =>
        Promise.resolve({
          resolved:
            args.resolvedFor?.(req.principal.userId) ??
            makeResolved({
              api,
              model: castId<ModelId>("fake-chat-model"),
              capability: makeCapability(
                capability ??
                  makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] }, tools: { parallel: true } }),
              ),
            }),
          warnings: [],
        }),
    },
    executor: {
      // A structured extraction is one side-generation chat turn (`runStructuredChat`), told apart from the round's
      // chat and tool turns by its posture; the spy records the model, the constrained schema and the prompts.
      runChatTurn: (req) => {
        args.onRequest?.(req);
        return req.posture === "side-gen"
          ? structuredTurn(req)
          : (args.chatArm ?? (chatThrows !== undefined ? (): Promise<ChatResult> => Promise.reject(chatThrows) : chatTurn))(req);
      },
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    // The fork preset-ownership gate is unreached on the extraction path; a benign stub.
    resolvePresetOwned: () => Promise.resolve(false),
    copyPresetToUser: () => Promise.resolve(null),
    // A throwaway registry — the real graph already registered rpg's tools into `app.toolUse`; re-registering
    // would collide (boot-fatal). These tests exercise the state ROUNDS, not the tool handlers.
    toolUse: { register: () => undefined },
    // R4 promotion deps — these tests exercise state rounds, never the mint; loud if ever reached.
    character: {
      create: () => Promise.reject(new Error("unused: promotion not exercised")),
      findByHandle: () => Promise.resolve(null),
      findByImportHash: () => Promise.resolve(null),
    },
    chat: { addCharacterToChat: () => Promise.reject(new Error("unused: promotion not exercised")) },
  });
}

export const emptySpy = (): ExtractionSpy => ({
  summarizeModels: [],
  chatTurns: [],
  wireTools: [],
  schemas: [],
  formatKeys: [],
  systemPrompts: [],
  userPrompts: [],
  signals: [],
  windows: [],
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// R1 — the FOLDED delivery mode, COMPOSED-REAL: the real `buildFoldedTurn` + `foldTurnToolCalls` over the
// real db + the real chat ops. The one thing a fake can never prove and this must: **no model call fires**.
// Every test below asserts the executor spy is EMPTY — the calls came off the character turn, so the second
// request R1 exists to delete is gone. Degrade is the risky half: a malformed arg, a ghost actor, and zero
// calls each land here with the narrative already committed and must never fail or block anything.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** A folded character turn's co-emitted calls (the shape the engine reads off the completion). */
export function foldedTurn(calls: readonly { name: string; args: unknown }[]): RpgTurnContext {
  return tc("chat-completions", {
    terminalToolCalls: calls.map((c, i) => ({ toolCallId: `call_${i}`, name: c.name, arguments: JSON.stringify(c.args) })),
  });
}

/** The panel state a game currently projects — the two planes the accumulation bug grew. */
export async function panelState(
  compose: ReturnType<typeof buildRpg>,
  hostId: UserId,
  chatId: ChatId,
): Promise<{ location: string | undefined; beats: readonly string[]; journal: readonly string[] }> {
  const principal = hostPrincipal(hostId);
  const view = await compose.service.getTrackerView({ principal, chatId });
  const journal = await compose.service.listJournal({ principal, chatId, limit: 50 });
  return { location: view.ambient?.location, beats: view.recentBeats, journal: journal.map((j) => j.title) };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// POPULATE-FROM-CHARACTER (owner ruling 2026-08-01) — the host BORN-STATE round, driven END-TO-END.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The verb's own int test fakes the round; THIS drives the REAL one (the [ct-stub-lie] antidote): the real
// corpus read (card prose + the room's opening line off the real db), the real prompt + constrained grammar on
// the wire, the real `salvagePopulate` (which must throw away the live-play planes a wire volunteered), the
// real title→className mapping, and the real two-door write tail.

/** A canned POPULATE payload — the identity + born gear the card implies, PLUS a `scene` write no card read is
 *  allowed to make (a non-enforcing wire volunteering one). What lands proves the strip is structural. */
export const CANNED_POPULATE = {
  sheet: { title: "Warden of House Vane", level: 3 },
  inventory: [
    {
      targetRef: "mira",
      add: [{ name: "Bone key", description: "cold to the touch", quantity: 1, location: "belt pouch" }],
      walletDeltas: [{ name: "gold", delta: 20 }],
    },
  ],
  quests: [{ name: "Reach the Vault of Ash", action: "create", objectives: ["Find the road north"] }],
  scene: { location: "SHOULD NEVER LAND", recentEvent: "SHOULD NEVER LAND" },
  party: [{ targetRef: "mira", trackerDeltas: [{ key: "hp", delta: -5 }] }],
  journal: [{ type: "note", title: "nope", content: "SHOULD NEVER LAND" }],
};

// ── 0511: the STRUCTURED state round, keyed on capability ───────────────────────────────────────────────────────
// A row that cannot force a tool call (`requiredChoice: false`) but constrains its output answers the cheap round as
// ONE schema-bound reply; every other row (and a Claude row, whose stated grammar ceilings the schema exceeds) keeps
// the forced tool round byte-for-byte.

/** A row as the shipped curated tables resolve it, so the pins below ride real capabilities, not hand-built ones. */
function curatedGeneration(model: string, providerId: string): ReturnType<typeof makeGenerationCapability> {
  const curated = curatedRows({ model, providerId: castId<ProviderId>(providerId), wire: "openai-compat", api: "chat-completions" });
  const out = synthesizeCapability("generation", detectModelFamily(model), { curated });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

export const STATE_ROUND_ROWS = {
  /** Ollama / KoboldCpp: no forced choice, structured output, no stated ceiling. */
  local: makeGenerationCapability({
    output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] },
    tools: { parallel: true, requiredChoice: false, namedChoice: false, silencesProse: true },
  }),
  /** No forced choice, and Anthropic's ceilings, which the round's union schema exceeds. */
  claudeNoForce: curatedGeneration("anthropic/claude-sonnet-5.5", "openrouter"),
  /** Claude 4.x: forced choice accepted. */
  claudeForced: curatedGeneration("anthropic/claude-sonnet-4.5", "openrouter"),
  openai: curatedGeneration("gpt-5", "openai"),
} as const;

export function stateRoundTurn(capability: ReturnType<typeof makeGenerationCapability>): RpgTurnContext {
  return tc("chat-completions", {
    connection: makeResolved({ api: "chat-completions", model: castId<ModelId>("fake-chat-model"), capability: makeCapability(capability) }),
  });
}

export async function cheapGame(
  db: Db,
  rpgCompose: ReturnType<typeof buildRpg>,
  key: string,
  vehicle?: RpgStateCaptureVehicle,
): Promise<{ readonly chatId: ChatId; readonly hostId: UserId; readonly messageId: MessageId; readonly variantId: MessageVariantId }> {
  const { chatId, hostId } = await seedHostGameChat(db, key);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({
    principal: hostPrincipal(hostId),
    chatId,
    extractionMode: "cheap",
    ...(vehicle === undefined ? {} : { patch: { stateCaptureVehicle: vehicle } }),
  });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They flee into the cave." });
  return { chatId, hostId, messageId, variantId };
}
