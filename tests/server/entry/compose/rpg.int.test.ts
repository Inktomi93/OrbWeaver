// entry/compose/rpg — the lite-rpg vertical, COMPOSED-REAL (rpg-design/05 §6.2). The [compose-stub-goes-stale]/
// [ct-stub-lie] antidote: drive the domain end-to-end through the ACTUAL `buildRpg` wiring — the real
// `RpgService` over the real db, the real staging accumulator, the real `ChatRpgOps` flush, the REAL chat-side
// injected ops (setRpgPointer/resolveRpgRoster/getMembership) off `createServices`, and the REAL tool registry
// rpg registered its 7 state tools into. Two turns are proven:
//
//   • CHEAP tool turn — createGame (real, writes the game row + the opaque pointer through chat's real
//     setRpgPointer) → execute the REAL registered `update_scene` tool via the ONE tool-use registry (stages) →
//     `onTurnCompleted` flush (the real chatOps) → the snapshot lands on the committed variant + the pointer is
//     projected on ChatDetail + the bus emits fire through the REAL `publishRpgEvent` singleton.
//   • STRUCTURED extraction turn — a `buildRpg` over the real graph's chat ops + db but a FAKE executor
//     returning a CANNED structured extraction (NEVER a live model — memory: never-run-engine-launcher-live).
//     Since the `reliable` MODE was deleted (owner ruling 2026-08-01) the structured emission is reached the way
//     it is reached in production: a `cheap` round on an AGENT-SDK wire, which carries no `tools[]` and so
//     degrades inside `runToolRound` to one structured call. The real impl parses it, folds it to a delta,
//     stages + flushes it — the real fold + accumulator + flush path.
//   • FOLDED turn (R1) — the real `buildFoldedTurn` + `foldTurnToolCalls` over the same graph, driven with the
//     calls a character turn co-emitted. Its defining assertion is a NEGATIVE one: the executor spy stays EMPTY,
//     so the second model call is provably gone. The degrade matrix (malformed arg · ghost actor · zero calls)
//     lands here too — each with the narrative already committed, so none of them may fail or block anything.

import type { ChatApi, ModelCapability } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { RpgBusEvent, RpgExtraction, RpgSnapshotState } from "@orb/contracts/rpg";
import { RPG_TOOL_ROUND_TOOL_NAMES, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { StructuredOutputShape } from "@orb/contracts/settings";
import { DEFAULT_STRUCTURED_OUTPUT_SHAPE } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { characters, messages, messageVariants, presets } from "@orb/db";
import type { ChatId, ChatTurnId, Handle, MessageId, MessageVariantId, ModelId, PresetId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { AgentModelHealError, ConnectionRoutingError } from "@orb/server/domain/connection";
import type { RpgTraceEvent, RpgTraceSink } from "@orb/server/domain/rpg";
import { createRpgTraceRecorder } from "@orb/server/domain/rpg";
import type { ServicesResult } from "@orb/server/entry/compose";
import { logger, recentWireCaptures, recordWireCapture, resetWireCaptures } from "@orb/server/foundation/observability";
import type { ChatResult } from "@orb/server/infra/providers";
import { createVllmChat } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import type { RpgTurnContext, RpgTurnTranscriptMessage } from "../../../../packages/server/src/domain/chat/index.ts";
import { resolveModelCapability } from "../../../../packages/server/src/domain/connection/catalog/resolve-model-capability.ts";
import { subscribeRpgEvents } from "../../../../packages/server/src/domain/rpg/index.ts";
import { findGameByChat } from "../../../../packages/server/src/domain/rpg/persistence/games.ts";
import { commitSnapshotForVariant, writeStagedSnapshot } from "../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { defaultSnapshotState } from "../../../../packages/server/src/domain/rpg/substrate/default-state.ts";
import { buildRpg } from "../../../../packages/server/src/entry/compose/rpg.ts";
import { makeModelCapability, makeResolvedConnection, makeResolvedCredential } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { addVariant, FROZEN_AT, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";

const TURN: ChatTurnId = castId<ChatTurnId>("chat_turn_compose_1");

/** The character turn's resolved connection + consent verdict the flush threads into the state round (F1). The
 *  `api` selects the round's routed arm (agent-sdk → the structured CHAT path; else the `structured` dispatcher);
 *  the model is "fake-chat-model" so the spy's model assertions still match. Writer-capable (structured + tools)
 *  + consent ON so the flush's F2 gate passes and the round runs. `over` pins the F1 consent/source cases. */
function tc(api: ChatApi, over: Partial<RpgTurnContext> = {}): RpgTurnContext {
  return {
    connection: makeResolvedConnection({
      api,
      model: castId<ModelId>("fake-chat-model"),
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true }, tools: { parallel: true } }),
    }),
    ownerConsented: true,
    // Default: an empty transcript (the round fires with an empty beat; the canned fakes ignore prompt
    // content). The §1.3 window/beat tests below pass a real name-stamped transcript.
    transcript: [],
    // R1: `null` = the folded tools did NOT ride this turn (the post-commit round runs); a fold test overrides
    // it with the calls the character turn co-emitted.
    terminalToolCalls: null,
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
function transcript(
  rows: readonly { readonly speaker: string | null; readonly text: string; readonly role?: RpgTurnTranscriptMessage["role"] }[],
): RpgTurnTranscriptMessage[] {
  return rows.map((r) => ({ role: r.role ?? "assistant", speakerName: r.speaker, content: r.text, tokens: Math.ceil(r.text.length / 4) }));
}

function hostPrincipal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId("host"), externalId: null, via: "header" };
}

/** Seed a real chat with a host participant — the membership rpg's createGame gates on (through the REAL
 *  injected getMembership off createServices). Returns the chat + host ids. */
async function seedHostGameChat(db: Db, key: string): Promise<{ chatId: ChatId; hostId: UserId }> {
  const hostId = await seedUser(db, castId<Handle>(`rpghost_${key}`));
  const chatId = await seedChat(db, key);
  await seedParticipant(db, { chatId, key: `${key}_host`, userId: hostId, role: "host", joinSeq: 0 });
  return { chatId, hostId };
}

/** Collect rpg-bus events off the REAL singleton for a chat, until `signal` aborts. */
function collectBus(chatId: ChatId, signal: AbortSignal): RpgBusEvent[] {
  const seen: RpgBusEvent[] = [];
  void (async (): Promise<void> => {
    try {
      for await (const event of subscribeRpgEvents(chatId, signal)) {
        seen.push(event);
      }
    } catch {
      // abort tears the iterator down — expected at test end.
    }
  })();
  return seen;
}

// 30s: the composed-real graph (full createServices) + a real tool turn is heavy under parallel load — this
// FIRST test pays the whole fixture warm-up for the file, and it was landing within a hair of the old 20s cap.
test("CHEAP turn — createGame + a real tool turn flush lands state + the pointer + bus emits (composed-real)", { timeout: 30_000 }, async ({
  app,
  services,
  db,
}) => {
  const { chatId, hostId } = await seedHostGameChat(db, "cheap");
  const bus = new AbortController();
  const events = collectBus(chatId, bus.signal);

  // createGame through the REAL service — writes the game row AND the opaque pointer via chat's real setRpgPointer.
  const created = await services.rpg.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await services.rpg.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });

  // The pointer is projected onto ChatDetail (the client's takeover gate reads it off data it already holds).
  const detail = await services.chat.getChat({ principal: hostPrincipal(hostId), chatId });
  expect(detail.rpg).toEqual({ gameId: created.gameId, engaged: true }); // born engaged (#40)

  // A committed assistant slot the flush keys the snapshot to.
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They enter the cave." });

  // Execute the REAL registered `update_scene` tool through the ONE tool-use registry (stages into the real
  // accumulator) — proving the compose tool-registration is LIVE (not a stub of it).
  const set = app.toolUse.resolveTools(["update_scene"]);
  const records = await app.toolUse.executeToolCalls(
    set,
    [{ toolCallId: "call_1", name: "update_scene", arguments: JSON.stringify({ location: "the cave mouth", recentEvent: "entered the cave" }) }],
    { principal: hostPrincipal(hostId), triggeredBy: hostId, chatId, turnId: TURN, roster: null },
  );
  expect(records[0]?.isError).toBe(false); // the real handler staged the scene write (errors-as-data would set true)

  // Flush the turn through the REAL chatOps — the staged write becomes the committed variant's snapshot. The
  // turn connection is a cheap-WRITER (so the F2 readonly gate passes); the dedicated tool round then fires
  // against the real (credential-less, vllm-disabled) executor, throws, is caught (errors-as-data → empty
  // delta), and the pre-staged `update_scene` write is what flushes — proving the registry+flush seam is live.
  await app.rpgChatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // State landed — read it back through the REAL tracker view (roster ∪ sheets, resolved-current snapshot).
  const view = await services.rpg.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the cave mouth");
  expect(view.recentBeats).toContain("entered the cave");

  // The §4.9 emits fired through the REAL bus singleton: gameChanged (create + config) then snapshotPatched.
  await Promise.resolve(); // let the microtask-queued bus fan-out settle
  bus.abort();
  expect(events.some((e) => e.type === "gameChanged")).toBe(true);
  expect(events.some((e) => e.type === "snapshotPatched")).toBe(true);
});

/** A canned structured extraction (the model's structured output) — a location move + a journal beat. Emitted as
 *  JSON text the real `runExtraction` parses through `rpgExtractionSchema`. */
const CANNED_EXTRACTION = {
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
  readonly chatTurns: { model: string; hasResponseFormat: boolean; hasToolServer: boolean; ownerConsented: boolean }[];
  /** The WIRE TOOLS each `runChatTurn` carried (the tool round's vehicle) — so a test can assert the round's set
   *  + its ref-constrained parameters reached the request, the tool-arm twin of `schemas`. */
  readonly wireTools: { name: string; description: string; parameters: Record<string, unknown> }[][];
  /** The response-format SCHEMA the impl put on the wire per call — so a test can assert the R1 ref enum
   *  (`constrainExtractionSchema`) reached the request, on either arm. */
  readonly schemas: Record<string, unknown>[];
  /** The `strict` flag each `responseFormat` carried (undefined = unset ⇒ the BACKEND's own default). The
   *  strict-shape half the schema alone can't show — D126's admin knob sets both, or neither. */
  readonly strictFlags: (boolean | undefined)[];
  /** The system prompts the impl sent — so a test can assert the R1 ref enumeration (the fallback arm). */
  readonly systemPrompts: string[];
  /** The user prompts the impl sent — so a §1.3 test can assert the RECENT STORY block (window arm) + the
   *  byte-compat `beat` arm shape. Captured on both routed arms (structured `userPrompt` / agent-sdk `prompt`). */
  readonly userPrompts: string[];
  /** The cancellation signal each request carried (RPG-SIGNAL). `undefined` here would mean the round is
   *  uncancelable at the LAST hop no matter what the flush believes — this is the only tier that can see it. */
  readonly signals: (AbortSignal | undefined)[];
}

/** Build an rpg seam over the REAL chat wiring (off `app.chatRpgOps`) + real db, with a FAKE executor/connection
 *  (never a live model). This exercises the ACTUAL `buildRpg` + extraction impl, only faking the model.
 *  The resolved connection carries a structured-output capability so the honest-arms verdict isn't readonly.
 *  `api` selects the routed arm; the spy records which executor method fired. */
function buildCannedRpg(app: ServicesResult, db: Db, api: ChatApi, spy: ExtractionSpy): ReturnType<typeof buildRpg> {
  return buildCannedRpgWithText({ app, db, api, spy, cannedText: JSON.stringify(CANNED_EXTRACTION) });
}

/** Record what ONE fake `runChatTurn` was handed — the spy half of the harness, hoisted out of the arm so the
 *  arm stays a plain reply builder (both vehicles' pins read these fields). */
function recordChatTurn(spy: ExtractionSpy, req: Parameters<NonNullable<Parameters<typeof buildRpg>[0]["executor"]["runChatTurn"]>>[0]): void {
  spy.chatTurns.push({
    model: req.model,
    hasResponseFormat: req.responseFormat !== undefined,
    hasToolServer: "toolServer" in req && req.toolServer !== undefined,
    // The consent verdict the round threaded onto the request — F1: this is the character turn's ENFORCED
    // `ownerConsented`, inherited, NOT a force-stamped `true`.
    ownerConsented: req.ownerConsented === true,
  });
  spy.signals.push(req.signal);
  if (req.responseFormat !== undefined) {
    spy.schemas.push(req.responseFormat.schema);
    spy.strictFlags.push(req.responseFormat.strict);
  }
  if ("tools" in req && Array.isArray(req.tools)) {
    spy.wireTools.push(req.tools as { name: string; description: string; parameters: Record<string, unknown> }[]);
  }
  if (req.api === "agent-sdk") {
    spy.systemPrompts.push(req.systemPrompt.static);
    spy.userPrompts.push("prompt" in req && typeof req.prompt === "string" ? req.prompt : "");
  }
}

// The same harness with a caller-supplied extraction reply text — the R3 pins drive an EMPTY / a
// phantom-target extraction through the real fold to prove the visibility logs fire.
function buildCannedRpgWithText(args: {
  readonly app: ServicesResult;
  readonly db: Db;
  readonly api: ChatApi;
  readonly spy: ExtractionSpy;
  readonly cannedText: string;
  /** The tool calls the fake model answers a CHEAP tool round with (`ChatResult.toolCalls`) — the third
   *  delivery vehicle's canned output, so one harness can drive all three (EXT-4a's equal-drop pin). */
  readonly cannedToolCalls?: readonly { readonly name: string; readonly arguments: string }[];
  /** Make the `structured` role REJECT — the provider-refusal arm (RESYNC-OR: an OpenRouter 400 on the
   *  structured request is what the host actually hit, and the round must report it, not swallow it). */
  readonly structuredThrows?: Error;
  /** Make the CHAT role REJECT — the same refusal arm on the tool-round vehicle (the resync's catch-up round
   *  rides `runChatTurn` since 2026-08-03, so this is where a provider refusal now lands for a host click). */
  readonly chatThrows?: Error;
  /** Override the resolved connection's capability — e.g. a STRUCTURED-only wire (no `tools`), which is what
   *  routes the resync down its structured degrade instead of the tool round. */
  readonly capability?: ReturnType<typeof makeModelCapability>;
  /** The deployment's structured-output wire shape (D126) — the AppSettings knob the real composition root
   *  feeds off `getEffectiveConfig()`. Omitted ⇒ the shipped floor, so every existing pin drives the default. */
  readonly structuredOutputShape?: StructuredOutputShape;
  /** R-OBS — the rpg flight-recorder sink. Omitted ⇒ untraced, which is what every other pin here drives (and
   *  is itself the zero-cost/byte-identical claim: those pins pass unchanged with no sink wired). */
  readonly trace?: RpgTraceSink;
  /** Replace the fake chat arm with a REAL infra chat surface. The WIRE-CAPTURE landing pin drives the ACTUAL
   *  vllm surface (real `buildBody` + the real `captureWire` sink → the real ring) through this seam, because
   *  a fake executor can never prove the round's request reaches the debug read. Wins over `chatThrows`. */
  readonly chatArm?: NonNullable<Parameters<typeof buildRpg>[0]["executor"]["runChatTurn"]>;
}): ReturnType<typeof buildRpg> {
  const { app, db, api, spy, cannedText, cannedToolCalls, structuredThrows, chatThrows, capability } = args;
  return buildRpg({
    db,
    now: () => FROZEN_AT,
    ...(args.trace === undefined ? {} : { trace: args.trace }),
    rpgChatOps: app.chatRpgOps,
    connection: {
      // The READ-side `trackersReadOnly` pill resolves the ROOM connection via `resolveChat` (the F1 seam — the
      // per-chat-routing verb, not the host's global `resolveRole` default). The state ROUNDS re-resolve NOTHING;
      // they ride the `turnConnection` handed to `onTurnCompleted` below.
      resolveChat: () =>
        Promise.resolve(
          makeResolvedConnection({
            api,
            model: castId<ModelId>("fake-chat-model"),
            // Structured AND tools: the READ-side `trackersReadOnly` pill resolves this connection, and a
            // `folded` game keys on `capability.tools` (the fold's vehicle) — a structured-only fake would make
            // every folded test readonly and silently prove nothing.
            capability: capability ?? makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true }, tools: { parallel: true } }),
          }),
        ),
      getOrSkinTierModels: () => Promise.resolve({ opus: "o", sonnet: "s", haiku: "h" }),
    },
    executor: {
      // The array/vLLM extraction arm now rides the `structured` role (owner ruling 2026-07-27 — split from
      // summarize). The spy records the model + the constrained schema + the prompt.
      structured: (req): Promise<SummarizeResult> => {
        if (structuredThrows !== undefined) {
          return Promise.reject(structuredThrows);
        }
        spy.summarizeModels.push(req.model);
        spy.schemas.push(req.responseFormat.schema);
        spy.strictFlags.push(req.responseFormat.strict);
        spy.systemPrompts.push(req.inputs[0]?.systemPrompt ?? "");
        spy.userPrompts.push(req.inputs[0]?.userPrompt ?? "");
        spy.signals.push(req.signal);
        return Promise.resolve({
          items: [{ text: cannedText, usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
          model: "fake-chat-model",
        } satisfies SummarizeResult);
      },
      // The structured chat arm: the reducer replies with the compact extraction JSON. The spy records that
      // the request carried a responseFormat and NO tool server (extraction is a read-only structured emission).
      // A `chatThrows` harness REPLACES the arm outright (rather than branching inside it) so the recording
      // arm below stays byte-identical to what every existing pin exercises.
      runChatTurn:
        args.chatArm ??
        (chatThrows !== undefined
          ? (): Promise<ChatResult> => Promise.reject(chatThrows)
          : (req) => {
              recordChatTurn(spy, req);
              // `reply` (the extraction), `toolCalls` (a cheap tool round) and `usage`/`finishReason`/`durationApiMs`
              // (the round's §10.1a economics line) are read; the rest of the ~18-field ChatResult is inert, so a
              // full construction would be noise.
              // FABRICATION-OK: minimal ChatResult double — only the fields the arms actually read; the others never run.
              return Promise.resolve({
                reply: cannedText,
                ...(cannedToolCalls === undefined ? {} : { toolCalls: cannedToolCalls }),
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
              } as unknown as ChatResult);
            }),
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    // The fork preset-ownership gate is unreached on the extraction path; a benign stub.
    resolvePresetOwned: () => Promise.resolve(false),
    copyPresetToUser: () => Promise.resolve(null),
    // A throwaway registry — the real graph already registered rpg's tools into `app.toolUse`; re-registering
    // would collide (boot-fatal). These tests exercise the state ROUNDS, not the tool handlers.
    toolUse: { register: () => undefined },
    // R4 promotion deps — these tests exercise state rounds, never the mint; loud if ever reached.
    character: { create: () => Promise.reject(new Error("unused: promotion not exercised")), findByHandle: () => Promise.resolve(null) },
    chat: { addCharacterToChat: () => Promise.reject(new Error("unused: promotion not exercised")) },
    // D126 — the admin-tier structured-output shape, threaded exactly as the real root threads it (a thunk off
    // the resolved config). Unset ⇒ the shipped floor, so every existing pin still drives the default arm.
    structuredOutputShape: () => args.structuredOutputShape ?? DEFAULT_STRUCTURED_OUTPUT_SHAPE,
  });
}

const emptySpy = (): ExtractionSpy => ({
  summarizeModels: [],
  chatTurns: [],
  wireTools: [],
  schemas: [],
  strictFlags: [],
  systemPrompts: [],
  userPrompts: [],
  signals: [],
});

test("CHEAP turn (tool-round arm) — a wire that CAN carry tools rides them, never the structured dispatcher", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "cheap-toolround");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    cannedToolCalls: [{ name: "update_scene", arguments: JSON.stringify({ location: "the obsidian tower", recentEvent: "arrived at the tower" }) }],
  });

  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // The chat arm fired carrying WIRE TOOLS and no responseFormat; the `structured` dispatcher was NOT touched.
  // (With the `reliable` mode deleted, the dispatcher is the host RESYNC's arm only — pinned further below.)
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([{ model: "fake-chat-model", hasResponseFormat: false, hasToolServer: false, ownerConsented: true }]);
  expect(spy.wireTools[0]?.map((t) => t.name)).toContain("update_scene");

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  expect(view.recentBeats).toContain("arrived at the tower");
});

// ── WIRE-SINK: the state round's request is READABLE at /api/_debug/wire/captures?chatId= ────────────────
// The observability LANDING pin (not a unit): the dedicated tool round is the ONE vehicle that puts the state
// tools on a request of its OWN (the folded turn rides the character turn's, which is captured), and it used
// to build that request WITHOUT a `chatId`. The sink fired — the capture just landed ANONYMOUS, so the debug
// read's only correlation key (chatId) dropped it and a whole debugging campaign saw the character turns and
// nothing of the round that actually wrote the state. Measured on the live spill before the fix:
//   `chat-completions | vllm | NO-CHATID | tool_choice:required | [update_scene …]`.
// So this drives the REAL vllm surface (real `buildBody` + the real `captureWire` sink → the real ring) and
// asserts through `recentWireCaptures({ chatId })` — the exact function the HTTP route calls. A fake executor
// cannot prove any of this; only the real surface + the real ring can.

/** A {@link VllmEngineClient} that answers the tool round with a canned openai-compat SSE carrying ONE
 *  `update_scene` call — so the round folds for real and the capture is not a request into a void. */
function toolRoundEngineClient(): VllmEngineClient {
  const args = JSON.stringify({ location: "the obsidian tower", recentEvent: "arrived at the tower" });
  const canned =
    `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"update_scene","arguments":${JSON.stringify(args)}}}]}}]}\n` +
    `data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n` +
    "data: [DONE]\n";
  return {
    enginePost: (): Promise<never> => Promise.reject(new Error("chat must stream")),
    engineStream: (): Promise<ReadableStream<Uint8Array>> =>
      Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(canned));
            controller.close();
          },
        }),
      ),
    baseUrl: () => "http://127.0.0.1:0",
  };
}

/** The tool NAMES on a captured openai-compat body (`tools[].function.name`). */
function capturedToolNames(body: Record<string, unknown>): string[] {
  const tools = (body["tools"] as readonly { function?: { name?: string } }[] | undefined) ?? [];
  return tools.map((t) => t.function?.name ?? "");
}

test("WIRE-SINK: the dedicated tool round's request lands in the wire ring UNDER ITS chatId (the debug read's key)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "wire-toolround");
  resetWireCaptures();
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    // The REAL surface, wired with the REAL ring sink exactly as `createServices` wires it when capture is on.
    chatArm: createVllmChat({
      client: toolRoundEngineClient(),
      now: () => FROZEN_AT,
      // The sink `createServices` injects, verbatim in shape: the boundary hands the entry, the sink stamps
      // `at` from the injected clock and forwards to the process ring.
      captureWire: (entry) => recordWireCapture({ ...entry, at: FROZEN_AT }),
    }),
  });

  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // THE LANDING: the host read (`GET /api/_debug/wire/captures?chatId=…` calls exactly this) sees the round.
  const captures = recentWireCaptures({ chatId });
  expect(captures).toHaveLength(1);
  // `.at(0)` (not `[0]`): biome's type service reads an index access on a `WireCapture[]` as non-nullish and
  // then flags the honest `?? {}` fallback as unreachable, while tsc (noUncheckedIndexedAccess) requires it.
  const capture = captures.at(0);
  expect(capture?.backend).toBe("vllm");
  expect(capture?.api).toBe("chat-completions");
  // …and what it sees IS the tool round: the state tool set + the `required` forcing, on the real wire body.
  const body = capture?.body ?? {};
  expect(capturedToolNames(body)).toContain("update_scene");
  expect(body["tool_choice"]).toBe("required");
  // The round genuinely ran through the real surface (the fold landed) — the capture is not of a dead call.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  resetWireCaptures();
});

test("CHEAP turn (agent-sdk degrade) — a wire with no `tools[]` runs ONE structured CHAT call instead", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "cheap-agent");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);

  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // The chat arm fired with a responseFormat + NO tool server (read-only structured emission, firewall intact);
  // the `structured` dispatcher did NOT (the branch, proven — the metered-sub firewall was never touched).
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([{ model: "fake-chat-model", hasResponseFormat: true, hasToolServer: false, ownerConsented: true }]);

  // IDENTICAL state lands via the chat arm (same canned delta, one fold path — the routing changed, not the result).
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  const journal = await rpgCompose.service.listJournal({ principal: hostPrincipal(hostId), chatId, limit: 50 });
  expect(journal.map((j) => j.title)).toContain("Arrival");
});

// ── R1: the per-call ref constraint reaches the wire on BOTH arms (schema enum + prompt enumeration) ────
test("R1: the extraction schema carries the roster-ref enum + the system prompt enumerates the refs (structured arm)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-enum-summ");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // The wire schema constrained party[].targetRef to an ENUM (R1) — the actual per-call refs. The host is a
  // user participant, so the SEMANTIC `player` token leads the enum (stable across persona changes — the
  // ref-vocabulary ruling 2026-07-27), NOT just the display-name-keyed "You".
  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } } } };
  const enumVals = schema.properties?.party?.items?.properties?.targetRef?.enum;
  expect(Array.isArray(enumVals)).toBe(true);
  expect(enumVals).toContain("player"); // the semantic self-ref is enum-able
  // The system prompt enumerates the valid refs (the fallback arm), explains `player`, + the location→scene rule.
  expect(spy.systemPrompts[0]).toContain("Valid targetRef values");
  expect(spy.systemPrompts[0]).toContain('"player" = the human');
  expect(spy.systemPrompts[0]).toContain("Location goes in scene.location");
});

test("R1: the ref enum reaches the agent-sdk chat arm too (portable — same shape, provider-agnostic)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-enum-agent");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } } } };
  expect(Array.isArray(schema.properties?.party?.items?.properties?.targetRef?.enum)).toBe(true);
  expect(spy.systemPrompts[0]).toContain("Valid targetRef values");
});

// ── RPG-SIGNAL: the cancellation reaches the LAST HOP (the provider request) ──────────────────────────────
// The flush tier proves the round is cancelable and writes nothing; only THIS tier can see whether the signal
// actually made it onto the wire request. Without it the round would run to completion on the provider's clock
// and bill in full, however promptly the flush afterwards refused to write — the "burning tokens" half of the
// defect. Both routed arms are pinned because they build their requests independently.

test("RPG-SIGNAL: the state round threads its cancellation onto the STRUCTURED dispatcher request", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sig-structured");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });

  // A `chat-completions` turn connection takes the `structured` dispatcher arm.
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  const signal = spy.signals[0];
  expect(signal).toBeInstanceOf(AbortSignal); // NOT undefined — the socket is killable
  expect(signal?.aborted).toBe(false); // a live, un-fired signal: the round ran normally
});

test("RPG-SIGNAL: the agent-sdk chat arm carries it too (the degrade is cancelable, not just the array wires)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sig-agentsdk");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  expect(spy.signals[0]).toBeInstanceOf(AbortSignal);
});

test("RPG-SIGNAL: a round entered ALREADY CANCELLED makes ZERO provider calls (nothing is billed)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "sig-preflight");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });

  const turn = new AbortController();
  turn.abort();
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions", { signal: turn.signal }));

  // The whole point of the pre-flight gate: an abandoned turn costs nothing at all, on either arm.
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([]);
});

// ── D126: the structured-output SHAPE knob reaches the wire (the whole path: AppSettings → the request) ──
// The admin knob is worthless if it stops at the settings write. These two pin the FAR end: the SAME composed
// extraction, driven twice, puts two different schema SHAPES on the wire — and the shipped floor is unchanged
// (the default STANDS; this lane built the switch, not a flip).
//
// The assertions walk EVERY object node, never just the root: the extraction schema's root properties are all
// required already (six plane arrays), so the reshape is only observable NESTED — a root-only assertion would
// have gone vacuously green on both arms.

/** Every `{type:"object", properties}` node in a schema tree, root included. */
function objectNodes(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      objectNodes(item, out);
    }
    return out;
  }
  if (node === null || typeof node !== "object") {
    return out;
  }
  const record = node as Record<string, unknown>;
  if (record["type"] === "object" && typeof record["properties"] === "object" && record["properties"] !== null) {
    out.push(record);
  }
  for (const value of Object.values(record)) {
    objectNodes(value, out);
  }
  return out;
}

const propertyNames = (node: Record<string, unknown>): string[] => Object.keys(node["properties"] as Record<string, unknown>);
const requiredNames = (node: Record<string, unknown>): string[] => (Array.isArray(node["required"]) ? (node["required"] as string[]) : []);
/** Nodes spelled `anyOf:[…, {"type":"null"}]` — the strict-compatible optional. */
function nullUnionCount(node: unknown, count = 0): number {
  if (Array.isArray(node)) {
    return node.reduce<number>((n, item) => nullUnionCount(item, n), count);
  }
  if (node === null || typeof node !== "object") {
    return count;
  }
  const record = node as Record<string, unknown>;
  const arms = record["anyOf"];
  const isNullUnion = Array.isArray(arms) && arms.some((arm) => arm !== null && typeof arm === "object" && (arm as Record<string, unknown>)["type"] === "null");
  return Object.values(record).reduce<number>((n, value) => nullUnionCount(value, n), count + (isNullUnion ? 1 : 0));
}

test("D126 (default): the shipped floor sends the schema AS PROJECTED — optionals stay optional, no `strict`", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "d126-floor");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as Record<string, unknown>;
  const nodes = objectNodes(schema);
  expect(nodes.length).toBeGreaterThan(1);
  // The projector's own shape: SOME node still leaves properties out of `required` …
  expect(nodes.some((n) => requiredNames(n).length < propertyNames(n).length)).toBe(true);
  // … and nothing anywhere was wrapped in a null union.
  expect(nullUnionCount(schema)).toBe(0);
  expect(spy.strictFlags).toEqual([undefined]); // unset ⇒ the backend's own default (D79)
});

test("D126 (switched): the admin knob's strict-compatible arm reaches scrubWireSchema — every property required, optionals as anyOf-null", async ({
  app,
  db,
}) => {
  const { chatId, hostId } = await seedHostGameChat(db, "d126-strict");
  const spy = emptySpy();
  // The ONLY difference from the test above: the deployment's resolved AppSettings value.
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "agent-sdk",
    spy,
    cannedText: JSON.stringify(CANNED_EXTRACTION),
    structuredOutputShape: "strict-compatible",
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as Record<string, unknown>;
  const nodes = objectNodes(schema);
  expect(nodes.length).toBeGreaterThan(1);
  // OpenAI strict's demand, at EVERY depth: every property of every object node listed as required …
  expect(nodes.filter((n) => requiredNames(n).length !== propertyNames(n).length)).toEqual([]);
  // … with the ones that were optional now spelled `anyOf:[T,{"type":"null"}]` (the documented escape).
  expect(nullUnionCount(schema)).toBeGreaterThan(0);
  // The scrub also came off this wire copy: the dialect meta-key + the bound keywords both vendors refuse.
  expect(schema["$schema"]).toBeUndefined();
  expect(JSON.stringify(schema)).not.toContain("minLength");
  expect(spy.strictFlags).toEqual([true]);

  // The CONTRACT is unchanged: the same canned reply still folds and lands (`null ≡ absent` at the salvage
  // boundary) — the reshape is a wire concern, not a semantics change.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
});

// ── F1: the state round rides the NARRATION turn's connection + consent verdict, never a re-resolve ──────
test("F1 (consent inherited): a state round threads the turn's ownerConsented verdict, NOT a force-stamped true", async ({ app, db }) => {
  // The blocker: the round used to hard-code `ownerConsented:true`, so a member-triggered turn on a metered sub
  // could fire a billed round the belt never approved. Now the round inherits the NARRATION turn's enforced
  // verdict. Drive a turn connection = max-pro-sub + ownerConsented:FALSE (the D17 by-proxy refusal shape) and
  // assert the round threaded FALSE onto the executor request — the firewall then denies (fail-closed).
  const { chatId, hostId } = await seedHostGameChat(db, "f1-consent");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A member acts." });

  const subNoConsent = tc("agent-sdk", {
    connection: makeResolvedConnection({
      api: "agent-sdk",
      model: castId<ModelId>("fake-chat-model"),
      credential: makeResolvedCredential("max-pro-sub"),
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true }, tools: { parallel: true } }),
    }),
    ownerConsented: false,
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, subNoConsent);

  // The round threaded the INHERITED (false) verdict — not a force-stamped true. (The fake executor records it;
  // the REAL firewall would `deny` on max-pro-sub + ownerConsented!==true — pinned separately in firewall.test.)
  expect(spy.chatTurns).toEqual([{ model: "fake-chat-model", hasResponseFormat: true, hasToolServer: false, ownerConsented: false }]);
});

test("F1 (room connection): the round runs on the TURN's connection (vllm), never a re-resolved global default", async ({ app, db }) => {
  // The wrong-connection half: the round used to `resolveRole({role:'chat'})` (the host's GLOBAL default), so a
  // room on vllm could run its round on the sub. Now the round rides `turnConnection.connection`. Prove it by
  // giving the turn connection a DISTINCT model the pill's `resolveChat` never returns ("fake-chat-model"): the
  // round must record the THREADED model, not the pill's — i.e. it did not re-resolve.
  const { chatId, hostId } = await seedHostGameChat(db, "f1-room-conn");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // the fold is the BORN default — this test drives the dedicated round
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They cross the bridge." });

  const vllmTurn = tc("chat-completions", {
    connection: makeResolvedConnection({
      api: "chat-completions",
      model: castId<ModelId>("threaded-vllm-model"), // NOT the pill's "fake-chat-model"
      credential: makeResolvedCredential("vllm"),
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true }, tools: { parallel: true } }),
    }),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, vllmTurn);

  // The round fired on the THREADED connection's model — proving no re-resolve of a global default.
  expect(spy.chatTurns.map((c) => c.model)).toEqual(["threaded-vllm-model"]);
});

// ── F2: a readonly (no-writer-capability) turn connection runs NO round (no per-turn failing model call) ────
test("F2 (readonly gate): a turn connection with no writer capability fires NO state round and writes nothing", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f2-readonly");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // every mode needs `tools`
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Nothing writable here." });

  // A connection that carries NO tools → every surviving mode is readonly (manual-steering). The flush must
  // skip the round entirely (no `structured`/`runChatTurn` call, no failing per-turn spend) and write no snapshot.
  const readonlyTurn = tc("chat-completions", {
    connection: makeResolvedConnection({
      api: "chat-completions",
      model: castId<ModelId>("no-tools-model"),
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true } }), // tools ABSENT
    }),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, readonlyTurn);

  // NO round fired (neither arm) — the readonly gate short-circuited before any model call.
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([]);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// W-B (§1.3) — the state round rides the turn's OWN transcript: window content · beat byte-compat · registry
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test("§1.3 (window arm): the RECENT STORY block carries the turn's transcript, name-stamped, oldest-first", async ({ app, db }) => {
  // A game defaults to extractionContext:"window" (§1.3). Thread a multi-beat transcript on the turn context;
  // the round's user prompt must carry the prior beats as name-stamped story evidence — proving the extraction
  // is no longer context-blind (it reads the arc, not just one beat).
  const { chatId, hostId } = await seedHostGameChat(db, "wb-window");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // born window (default)
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The dragon lunges." });

  const turn = tc("agent-sdk", {
    transcript: transcript([
      { speaker: "You", text: "I draw my blade and step into the ruined hall.", role: "user" },
      { speaker: "Mara", text: "Mara nocks an arrow, whispering: stay behind me." },
      { speaker: "Mara", text: "The dragon lunges." }, // the latest beat (transcript.at(-1))
    ]),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turn);

  const prompt = spy.userPrompts[0] ?? "";
  // The RECENT STORY block exists and carries the PRIOR beats (the arc), oldest-first, name-stamped.
  expect(prompt).toContain("RECENT STORY (oldest first):");
  expect(prompt).toContain("You: I draw my blade and step into the ruined hall.");
  expect(prompt).toContain("Mara: Mara nocks an arrow, whispering: stay behind me.");
  // The newest turn rides the LATEST BEAT block, not the story block (the delta target).
  expect(prompt).toContain("LATEST BEAT (the newest story turn above — your delta covers exactly this):\nThe dragon lunges.");
  // The three-block structure — CURRENT TRACKED STATE sits between story and beat.
  expect(prompt).toContain("CURRENT TRACKED STATE:");
});

test("§1.3 (beat arm): the request is BYTE-IDENTICAL to the pre-redesign shape (CURRENT STATE + one beat, no story, unstripped)", async ({ app, db }) => {
  // The escape hatch's byte-compat contract: extractionContext:"beat" reproduces today's request EXACTLY — the
  // full unstripped state JSON, no RECENT STORY block, no §4.4 strip. The verifier's diff is this equality.
  const { chatId, hostId } = await seedHostGameChat(db, "wb-beat");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, patch: { extractionContext: "beat" } });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They cross the bridge." });

  const turn = tc("agent-sdk", {
    transcript: transcript([
      { speaker: "You", text: "prior beat that must NOT appear on the beat arm", role: "user" },
      { speaker: "Mara", text: "They cross the bridge." },
    ]),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turn);

  // A fresh game's base is the default snapshot state — the round reasons against it. The beat arm's user prompt
  // is byte-identical to the pre-redesign `CURRENT STATE:\n${JSON.stringify(base)}\n\nLATEST BEAT:\n${beat}`.
  const expected = `CURRENT STATE:\n${JSON.stringify(defaultSnapshotState())}\n\nLATEST BEAT:\nThey cross the bridge.`;
  expect(spy.userPrompts[0]).toBe(expected);
  // No transcript leakage on the beat arm — the prior beat and the new-block labels are ABSENT.
  expect(spy.userPrompts[0]).not.toContain("RECENT STORY");
  expect(spy.userPrompts[0]).not.toContain("prior beat that must NOT appear");
});

test("§1.6 (plane registry): the extraction system prompt teaches the newly-covered planes (plot + emoji + reconcile)", async ({ app, db }) => {
  // The plane-under-service gap (§1.6): plot/emoji/reconcile were schema-writable but prompt-silent. The registry
  // now composes them into the system prompt. plotProgression defaults ON, so the plot clause must appear.
  const { chatId, hostId } = await seedHostGameChat(db, "wb-registry");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A new act dawns." });
  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    tc("agent-sdk", { transcript: transcript([{ speaker: "Narrator", text: "A new act dawns." }]) }),
  );

  const sys = spy.systemPrompts[0] ?? "";
  expect(sys).toContain("scene.plot"); // §1.6 gap — the plot act rail (plotProgression ON by default)
  expect(sys).toContain("emoji"); // §1.6 gap — the portrait-fallback emoji clause
  expect(sys).toContain("RECONCILE"); // the anti-drift doctrine composed by the registry
});

// ── F4: the per-call enum includes existing scene-cast + cast-actor keys (removal + cast-actor reach) ────
/** A base snapshot state carrying two tracked cast actors — one ON stage, one tracked-only — which is the
 *  ONE namespace F4's enum walks since R2 (the scene cast and the tracked cast are the same rows now). The
 *  enum offers each actor's DISPLAY name, so `presentRemove` can name an NPC and party/inventory can reach a
 *  cast actor whether or not she is standing in the scene. */
function baseWithCast(): RpgSnapshotState {
  const castRow = (castKey: string, name: string): RpgSnapshotState["actorState"][number] => ({
    actorRef: { kind: "cast", castKey },
    identity: { name, emoji: "", mood: "", relationship: { kind: "neutral", label: "" } },
    volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" },
  });
  return {
    clock: null,
    calendarDate: null,
    location: "the tavern",
    weather: null,
    presentCharacters: ["cast:bartender"],
    recentEvents: [],
    actorState: [castRow("bartender", "Bartender"), castRow("goblin", "Goblin")],
    trackerValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
  };
}

test("F4: presentRemove enum names an existing scene NPC + party.targetRef reaches an existing cast actor", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f4-cast-enum");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  const { gameId } = await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)

  // Seed a COMMITTED base snapshot carrying the scene NPC + cast actor, so the round's `baseState` (resolved via
  // the ladder) hands those keys to `resolveExtractionRefs`.
  const { messageId: baseMsg, variantId: baseVar } = await seedMessage(db, chatId, 1, { role: "assistant", content: "You reach the tavern." });
  const written = await writeStagedSnapshot(db, baseWithCast(), {
    id: castId("rpg_snapshot_f4base"),
    gameId,
    messageId: baseMsg,
    variantId: baseVar,
    now: FROZEN_AT,
  });
  expect(written.ok).toBe(true);
  await commitSnapshotForVariant(db, baseVar);

  // The NEXT turn runs the round; its baseState is the committed snapshot above.
  const { messageId, variantId } = await seedMessage(db, chatId, 2, { role: "assistant", content: "The goblin snarls; the bartender ducks." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as {
    properties?: {
      party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } };
      scene?: { properties?: { presentRemove?: { items?: { enum?: string[] } } } };
    };
  };
  // party.targetRef can reach the existing cast actor (F4 — cast-actor writes are representable).
  expect(schema.properties?.party?.items?.properties?.targetRef?.enum).toContain("Goblin");
  // scene.presentRemove can name the existing scene NPC (F4 — scene cast can shrink, not only grow).
  expect(schema.properties?.scene?.properties?.presentRemove?.items?.enum).toContain("Bartender");
});

test("R5a: the LIVE active conditions bind party[].removeCondition to an enum (a comma-joined list is untypeable)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r5a-conditions");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  const { gameId } = await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)

  // A committed base snapshot where the tracked cast actor CARRIES conditions — the only source of the enum.
  const afflicted = baseWithCast();
  const { messageId: baseMsg, variantId: baseVar } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The goblin festers." });
  const written = await writeStagedSnapshot(
    db,
    {
      ...afflicted,
      actorState: afflicted.actorState.map((a) => ({
        ...a,
        volatile: {
          ...a.volatile,
          conditions: [
            { name: "Bleeding", stat: null, modifier: 0, turnsLeft: null },
            { name: "Poisoned", stat: null, modifier: 0, turnsLeft: null },
          ],
        },
      })),
    },
    { id: castId("rpg_snapshot_r5a"), gameId, messageId: baseMsg, variantId: baseVar, now: FROZEN_AT },
  );
  expect(written.ok).toBe(true);
  await commitSnapshotForVariant(db, baseVar);

  const { messageId, variantId } = await seedMessage(db, chatId, 2, { role: "assistant", content: "The goblin's wounds close." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { removeCondition?: { enum?: string[] } } } } } };
  const enumValues = schema.properties?.party?.items?.properties?.removeCondition?.enum;
  expect(enumValues).toEqual(["Bleeding", "Poisoned"]);
  // R5b(a) — the PROMPT half of the same fact (`refEnumerationLines`): a backend whose wire can't enforce the
  // enum still reads the live list in prose, so it can only retire a condition somebody actually carries.
  expect(spy.systemPrompts[0]).toContain("Currently-active conditions (removeCondition must name EXACTLY one of these): Bleeding, Poisoned.");
});

// ── F10: a roster character literally named "Player" owns the `player` ref; the token is withheld ───────
test("F10: a roster character named 'Player' is enum-able and the semantic 'player' token is withheld (no collision)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f10-player-collision");
  // A ROSTER character literally named "Player" — `buildRosterRefIndex` gives it precedence over the self-alias,
  // so it OWNS the `player` ref. The enum must therefore offer "Player" (the char is targetable) and NOT the
  // bare `player` token (which would shadow the real roster entry — the F10 seam).
  const playerCharId = await seedCharacter(db, hostId, "Player");
  await seedParticipant(db, { chatId, key: "f10_playerchar", characterId: playerCharId, role: "member", joinSeq: 1 });

  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Player draws a blade." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } } } };
  const enumVals = schema.properties?.party?.items?.properties?.targetRef?.enum;
  expect(enumVals).toContain("Player"); // the roster char IS targetable (not dropped)
  expect(enumVals).not.toContain("player"); // the semantic token is withheld — the char owns the ref (F10)
  // The prompt does NOT emit the misleading `"player" = the human` explainer when the token isn't offered.
  expect(spy.systemPrompts[0]).not.toContain('"player" = the human');
});

// §10.1a — the DEDICATED tool round's economics record. That vehicle rides the CHAT role on a stateless
// backend, which emits neither `provider.structured-item` (the structured arms' per-item log) nor
// `provider.turn` (agent-sdk's): before this line the round's tokens and cost left NO record at all, so
// §10.1a's "recorded in the provider-observability plane" was false exactly here.
test("§10.1a: the cheap TOOL ROUND logs its usage (tokens + cost) — the vehicle no provider log covers", async ({ app, db }) => {
  const infoSpy = vi.spyOn(logger, "info");
  const { chatId, hostId } = await seedHostGameChat(db, "toolround-usage");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    cannedToolCalls: [{ name: "update_scene", arguments: JSON.stringify({ location: "the obsidian tower" }) }],
  });

  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  const line = infoSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.toolround.usage")?.[0] as Record<string, unknown> | undefined;
  expect(line).toBeDefined();
  expect(line).toMatchObject({
    chatId,
    api: "chat-completions",
    model: "fake-chat-model",
    tokensIn: 1200,
    tokensOut: 90,
    costUsd: 0.0042,
    finishReason: "stop",
  });
});

// ── R3: visibility — a zero-renderable extraction + a phantom cast mint both LOG ────────────────────────
test("R3: an extraction that writes NOTHING renderable logs rpg.extraction.empty (the silent-panel signal)", async ({ app, db }) => {
  const infoSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r3-empty");
  const spy = emptySpy();
  // Override the canned text to an EMPTY extraction (parses, but folds to zero writes).
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy, cannedText: JSON.stringify({}) });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Nothing tracked changed." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const line = infoSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.empty");
  expect(line).toBeDefined();
});

test("R5: an extraction targeting a GHOST actor is DROPPED (no cast mint) + logs rpg.extraction.phantom", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r3-phantom");
  const spy = emptySpy();
  // A phantom target "player" that the roster doesn't literally contain — but resolveActor's self-alias maps
  // it to the user, so it is NOT phantom. Use a genuinely-unknown name to force the ghost-guard canary.
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "agent-sdk",
    spy,
    // A partial extraction JSON — the schema fills the other planes with defaults on parse (a real model
    // emits exactly this shape); only `party` carries the non-roster phantom target.
    cannedText: JSON.stringify({ party: [{ targetRef: "Zzyzx the Unknown", status: "cursed" }] }),
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A stranger appears." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.phantom");
  expect(line).toBeDefined();
  expect((line?.[0] as { phantomTargets?: string[] }).phantomTargets).toContain("Zzyzx the Unknown");
  // R5: the ghost arg was DROPPED, so nothing was tracked — the panel never gains a hallucinated actor. The
  // empty-outcome line fires ALONGSIDE the ghost line (independent branches: the cause must not hide behind
  // the symptom now that a ghost-only extraction is by definition a write-nothing extraction).
  expect(warnSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "rpg.extraction.empty")).toBe(true);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.actors.some((a) => a.actorRef.kind === "cast")).toBe(false);
});

test("F3: the host is resolved by ROLE, not join order (post-handoff: first-joined human is a member)", async ({ app, db }) => {
  // Simulate a post-`acceptHostHandoff` state (D64): the first-joined human (joinSeq 0) is now a plain MEMBER,
  // and the current host joined later (joinSeq 1) — roles swapped in place, join order unchanged. The old
  // `find(kind==="user")` picked the first human (the member); the fix resolves by role='host'.
  const member = await seedUser(db, castId<Handle>("f3_member"));
  const host = await seedUser(db, castId<Handle>("f3_host"));
  const chatId = await seedChat(db, "f3");
  await seedParticipant(db, { chatId, key: "f3_member", userId: member, role: "member", joinSeq: 0 });
  await seedParticipant(db, { chatId, key: "f3_host", userId: host, role: "host", joinSeq: 1 });

  // The DIVERGENCE the bug exploited: the roster projection (join order) puts the MEMBER first — the old
  // `find(kind==="user")` would have picked it. Prove the two answers differ here.
  const rosterFirstHuman = (await app.chatRpgOps.resolveRpgRoster(chatId)).find((a) => a.actorRef.kind === "user");
  expect(rosterFirstHuman?.actorRef.kind === "user" && rosterFirstHuman.actorRef.userId).toBe(member);

  // The composed chat-side host resolver (what the rpg extraction + capability verdict read) resolves the
  // role='host' participant — NOT the first-joined human. This is the repro-gone assertion.
  expect(await app.chatRpgOps.resolveHostUserId(chatId)).toBe(host);
});

// ── D112 (as amended): the FOLD GUARD is wired end-to-end off the resolved CAPABILITY, not a source branch ──
/** Build an rpg whose ROOM connection resolves with `capability` — the wiring the `resolveStateDelivery` op
 *  reads BOTH delivery verdicts off. The state rounds are unreachable here (the gather is what's under test). */
function buildRpgWithCapability(app: ServicesResult, db: Db, capability: ModelCapability): ReturnType<typeof buildRpg> {
  return buildRpg({
    db,
    now: () => FROZEN_AT,
    rpgChatOps: app.chatRpgOps,
    connection: {
      resolveChat: () => Promise.resolve(makeResolvedConnection({ api: "chat-completions", model: castId<ModelId>("fake-chat-model"), capability })),
      getOrSkinTierModels: () => Promise.resolve({ opus: "o", sonnet: "s", haiku: "h" }),
    },
    executor: {
      structured: () => Promise.reject(new Error("unreached — the gather makes no model call")),
      runChatTurn: () => Promise.reject(new Error("unreached")),
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    resolvePresetOwned: () => Promise.resolve(false),
    copyPresetToUser: () => Promise.resolve(null),
    toolUse: { register: () => undefined },
    // R4 promotion deps — these tests exercise state rounds, never the mint; loud if ever reached.
    character: { create: () => Promise.reject(new Error("unused: promotion not exercised")), findByHandle: () => Promise.resolve(null) },
    chat: { addCharacterToChat: () => Promise.reject(new Error("unused: promotion not exercised")) },
    structuredOutputShape: () => DEFAULT_STRUCTURED_OUTPUT_SHAPE,
  });
}

test("D112 fold guard: a BORN-FOLDED game mounts terminal tools on a hosted wire and NONE on the local engine", async ({ app, db }) => {
  // The REAL descriptors from the ONE capability factory — the guard must ride the connection domain's declared
  // truth, never a `credential.source` sniff inside domain/rpg (which D112 bans outright).
  const hosted = resolveModelCapability("claude-sonnet-5", "openrouter", "chat-completions");
  const local = resolveModelCapability("Qwen/Qwen3-VL-8B-Instruct", "vllm", "chat-completions");

  const hostedChat = await seedHostGameChat(db, "guard-hosted");
  const hostedRpg = buildRpgWithCapability(app, db, hosted);
  await hostedRpg.service.createGame({ principal: hostPrincipal(hostedChat.hostId), chatId: hostedChat.chatId, mode: "lite" });
  const hostedGather = await hostedRpg.chatOps.gatherTurnContext({ chatId: hostedChat.chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  // Unchanged: the hosted wire co-emits (6/6 measured), so the born-folded game still folds.
  expect(hostedGather?.terminalTools?.length).toBeGreaterThan(0);
  expect(hostedGather?.tools).toEqual([]);

  const localChat = await seedHostGameChat(db, "guard-local");
  const localRpg = buildRpgWithCapability(app, db, local);
  await localRpg.service.createGame({ principal: hostPrincipal(localChat.hostId), chatId: localChat.chatId, mode: "lite" });
  const localGather = await localRpg.chatOps.gatherTurnContext({ chatId: localChat.chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  // Guarded: tools would silence the prose on this wire, so the character turn carries none — the state falls
  // to the flush's cheap post-commit round (the fallback arm, pinned in the flush suite).
  expect(localGather?.terminalTools).toBeUndefined();
  // The game is NOT downgraded to read-only — it keeps its write path and its reminder, exactly as before.
  expect((await localRpg.service.getGame({ principal: hostPrincipal(localChat.hostId), chatId: localChat.chatId })).trackersReadOnly).toBe(false);
  expect(localGather?.injections).toHaveLength(1);
});

// ── FIX 1: a game READ degrades to trackersReadOnly:true when the chat connection is unresolvable, never 500s ──
/** Build an rpg over the REAL chat wiring + real db, but with a `resolveChat` that THROWS `err` — the
 *  misconfigured-backend repro (a stale routing setting whose (api,source) pair maps to no coherent backend).
 *  The READ-side `trackersReadOnly` pill must catch the connection-resolution error and degrade to read-only,
 *  never let it escape as a 500. */
function buildRpgWithThrowingResolveChat(app: ServicesResult, db: Db, err: unknown): ReturnType<typeof buildRpg> {
  return buildRpg({
    db,
    now: () => FROZEN_AT,
    rpgChatOps: app.chatRpgOps,
    connection: {
      resolveChat: () => Promise.reject(err),
      getOrSkinTierModels: () => Promise.resolve({ opus: "o", sonnet: "s", haiku: "h" }),
    },
    executor: {
      structured: () => Promise.reject(new Error("unreached — the round never fires on a readonly READ")),
      runChatTurn: () => Promise.reject(new Error("unreached")),
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    resolvePresetOwned: () => Promise.resolve(false),
    copyPresetToUser: () => Promise.resolve(null),
    toolUse: { register: () => undefined },
    // R4 promotion deps — these tests exercise state rounds, never the mint; loud if ever reached.
    character: { create: () => Promise.reject(new Error("unused: promotion not exercised")), findByHandle: () => Promise.resolve(null) },
    chat: { addCharacterToChat: () => Promise.reject(new Error("unused: promotion not exercised")) },
    // D126 — the admin-tier structured-output shape, on its shipped floor (the real root reads it per call off
    // `getEffectiveConfig()`); the strict-arm pin below overrides it.
    structuredOutputShape: () => DEFAULT_STRUCTURED_OUTPUT_SHAPE,
  });
}

test("FIX 1: getGame on a game whose chat connection resolves INCOHERENTLY returns trackersReadOnly:true (READ succeeds, no 500)", async ({ app, db }) => {
  // The exact live repro: a stale dev-stack setting resolves api=agent-sdk × source=vllm — `resolveChat` throws
  // ConnectionRoutingError. The pill's honest-degrade contract ("an unresolvable connection is readonly by
  // construction") must hold: the READ returns a readable game marked read-only, never a thrown 500.
  const { chatId, hostId } = await seedHostGameChat(db, "fix1-incoherent");
  const rpgCompose = buildRpgWithThrowingResolveChat(app, db, new ConnectionRoutingError("agent-sdk", "vllm"));
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  const game = await rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId });
  expect(game.trackersReadOnly).toBe(true);

  // The tracker view READ likewise degrades (both reads share the pill) — no throw escapes.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.trackersReadOnly).toBe(true);
});

test("FIX 1: the agent-sdk model-heal failure class ALSO degrades to trackersReadOnly:true (unresolvable by construction)", async ({ app, db }) => {
  // The sibling connection-resolution failure: an agent-sdk source that reaches the fail-loud model heal.
  // Same contract — an unresolvable connection is readonly, not a 500.
  const { chatId, hostId } = await seedHostGameChat(db, "fix1-heal");
  const rpgCompose = buildRpgWithThrowingResolveChat(app, db, new AgentModelHealError("vllm"));
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  const game = await rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId });
  expect(game.trackersReadOnly).toBe(true);
});

test("FIX 1: an UNEXPECTED resolveChat failure still PROPAGATES — the catch never swallows a real bug", async ({ app, db }) => {
  // The boundary the verifier checks: the catch is SPECIFIC to the connection-resolution error classes. A
  // genuinely unexpected failure (a DB fault, a transient catalog gap, a programming bug) must escape so it is
  // surfaced/root-caused, NOT silently masked as "read-only". Drive a plain Error and assert the READ throws it.
  const { chatId, hostId } = await seedHostGameChat(db, "fix1-unexpected");
  const boom = new Error("unexpected infra fault");
  // Create the game through a NON-throwing build first (createGame also reads the pill — the unexpected error is
  // scoped to the READ under test, not birth), then READ it through a build whose resolveChat throws `boom`.
  await buildCannedRpg(app, db, "chat-completions", emptySpy()).service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const rpgCompose = buildRpgWithThrowingResolveChat(app, db, boom);

  await expect(rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId })).rejects.toBe(boom);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// R1 — the FOLDED delivery mode, COMPOSED-REAL: the real `buildFoldedTurn` + `foldTurnToolCalls` over the
// real db + the real chat ops. The one thing a fake can never prove and this must: **no model call fires**.
// Every test below asserts the executor spy is EMPTY — the calls came off the character turn, so the second
// request R1 exists to delete is gone. Degrade is the risky half: a malformed arg, a ghost actor, and zero
// calls each land here with the narrative already committed and must never fail or block anything.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** A folded character turn's co-emitted calls (the shape the engine reads off the completion). */
function foldedTurn(calls: readonly { name: string; args: unknown }[]): RpgTurnContext {
  return tc("chat-completions", {
    terminalToolCalls: calls.map((c, i) => ({ toolCallId: `call_${i}`, name: c.name, arguments: JSON.stringify(c.args) })),
  });
}

test("R1 composed-real: the character turn's own tool calls land state — and NO model call fires", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-fold");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "She fords the river as the rain starts." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([
      { name: "update_scene", args: { location: "the ford", weather: { type: "rain", label: "cold spitting rain" }, recentEvent: "forded the river" } },
      { name: "add_journal_entry", args: { type: "location", label: "", title: "The Ford", content: "They crossed at the ford in the rain." } },
    ]),
  );

  // THE R1 ASSERTION: zero requests on either executor arm. The state came from the narrative call.
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([]);
  // The state landed through the SAME fold + accumulator + flush the dedicated round uses.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford");
  // The folded tool round wrote the closed type + the model's flavor label (the weather enum on the wire).
  expect(view.ambient?.weather).toEqual({ type: "rain", label: "cold spitting rain" });
  expect(view.recentBeats).toContain("forded the river");
  const journal = await rpgCompose.service.listJournal({ principal: hostPrincipal(hostId), chatId, limit: 50 });
  expect(journal.map((j) => j.title)).toContain("The Ford");
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// R-OBS — the rpg FLIGHT RECORDER, composed-real. `RPG_TRACE` was scaffolding only (dogfood-tracking
// RPG-TRACE-DEAD: env declared, route skipped, inspector never implemented). These drive a real folded turn
// through the real compose graph with a real recorder wired and assert the ring holds what a host would need:
// what the turn MOUNTED, what the model CALLED (args verbatim + the schema's verdict), which delivery PATH the
// flush took, and what it ANNOUNCED — all joinable on one `turnId`, which is the query key the route exposes.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test("R-OBS composed-real: a folded turn records its mount, its calls, its flush path and its bus emits", async ({ app, db }) => {
  const recorder = createRpgTraceRecorder({ now: () => FROZEN_AT });
  const { chatId, hostId } = await seedHostGameChat(db, "robs-fold");
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: JSON.stringify(CANNED_EXTRACTION),
    trace: recorder.sink,
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "She fords the river." });

  // The MOUNT half runs at GATHER — the same entry point the engine drives to attach the terminal tools.
  await rpgCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([
      { name: "update_scene", args: { location: "the ford", recentEvent: "forded the river" } },
      // Valid JSON, INVALID against its own schema: the drop class this recorder was re-lit for
      // (SCENE-DROPPED cost a live session hours because the trail carried names without reasons).
      { name: "upsert_quest", args: { name: 42 } },
    ]),
  );

  const events = recorder.recent({ chatId }).map((record) => record.event);

  // 1. WHAT THE TURN COULD WRITE.
  const mount = events.find((event): event is Extract<RpgTraceEvent, { phase: "mount" }> => event.phase === "mount");
  expect(mount?.toolNames).toContain("update_scene");

  // 2. WHAT THE MODEL CALLED — args VERBATIM, and the per-call verdict beside them.
  const tool = events.find((event): event is Extract<RpgTraceEvent, { phase: "tool" }> => event.phase === "tool");
  expect(tool?.vehicle).toBe("folded extraction");
  expect(tool?.turnId).toBe(TURN);
  expect(tool?.calls.map((call) => [call.name, call.verdict])).toEqual([
    ["update_scene", "applied"],
    ["upsert_quest", "dropped"],
  ]);
  // The raw string the model sent survives — a parsed-only capture erases exactly the failing case.
  expect(tool?.calls[1]?.args).toBe(JSON.stringify({ name: 42 }));
  expect(tool?.calls[1]?.issues.join(" ")).toContain("name");

  // 3. WHICH VEHICLE ACTUALLY RAN (a `folded` game silently paying for a second call is the R1 failure).
  const flush = events.find((event): event is Extract<RpgTraceEvent, { phase: "flush" }> => event.phase === "flush");
  expect(flush).toMatchObject({ turnId: TURN, path: "folded", fallbackReason: null });

  // 4. WHAT REACHED THE PANEL.
  expect(events.filter((event) => event.phase === "bus").length).toBeGreaterThan(0);

  // …and the whole turn is joinable on ONE key — the route's `?turnId=` filter. The mount has none (it runs
  // before the turn resolves one), so it is correctly EXCLUDED rather than silently matched.
  const byTurn = recorder.recent({ turnId: TURN }).map((record) => record.event.phase);
  expect(byTurn).toContain("tool");
  expect(byTurn).toContain("flush");
  expect(byTurn).not.toContain("mount");
});

test("TOOLCALLS arm A: a folded turn RECORDS what it called, keyed to the producing variant", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "toolcalls-record");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "She fords the river." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([
      { name: "update_scene", args: { location: "the ford", recentEvent: "forded the river" } },
      // Valid JSON, INVALID against its own schema — the SCENE-DROPPED class. This is the call the user most
      // needs to see, and the reason a record gated on a successful write would be useless.
      { name: "upsert_quest", args: { name: 42 } },
    ]),
  );

  const recorded = await rpgCompose.service.listTurnToolCalls({ principal: hostPrincipal(hostId), chatId });
  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.variantId).toBe(variantId);
  expect(recorded[0]?.messageId).toBe(messageId);
  expect(recorded[0]?.calls.map((c) => [c.name, c.verdict])).toEqual([
    ["update_scene", "applied"],
    ["upsert_quest", "dropped"],
  ]);
  // The args ride VERBATIM — the failing payload is the evidence, and a parsed-only record would erase it.
  expect(recorded[0]?.calls[1]?.args).toBe(JSON.stringify({ name: 42 }));
  expect(recorded[0]?.calls[1]?.issues.join(" ")).toContain("name");
});

test("TOOLCALLS arm A: a turn whose calls ALL dropped still records — that is the turn worth seeing", async ({ app, db }) => {
  // The record is written BEFORE the staged-nothing return: this turn writes NO snapshot (nothing parsed),
  // and a record gated on a successful flush would show the user nothing at all on precisely the turn where
  // they are asking "why did nothing happen?".
  const { chatId, hostId } = await seedHostGameChat(db, "toolcalls-all-dropped");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The prose is fine." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, {
    ...tc("chat-completions"),
    terminalToolCalls: [{ toolCallId: "c1", name: "upsert_quest", arguments: JSON.stringify({ name: 42 }) }],
  });

  const recorded = await rpgCompose.service.listTurnToolCalls({ principal: hostPrincipal(hostId), chatId });
  expect(recorded[0]?.calls.map((c) => c.verdict)).toEqual(["dropped"]);
});

test("TOOLCALLS arm A: a QUIET beat records nothing (no empty disclosure on every silent turn)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "toolcalls-quiet");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They walk on." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, foldedTurn([]));

  expect(await rpgCompose.service.listTurnToolCalls({ principal: hostPrincipal(hostId), chatId })).toEqual([]);
});

test("TOOLCALLS arm A: a NON-folded (cheap) turn records nothing — the round's calls are not the turn's", async ({ app, db }) => {
  // A dedicated post-commit round makes its OWN model call; those calls are not a description of the turn the
  // user watched, so they must not appear on that turn's row.
  const { chatId, hostId } = await seedHostGameChat(db, "toolcalls-cheap");
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    cannedToolCalls: [{ name: "update_scene", arguments: JSON.stringify({ location: "the tower" }) }],
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // The state DID land (the round ran) — but no per-turn record exists.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the tower");
  expect(await rpgCompose.service.listTurnToolCalls({ principal: hostPrincipal(hostId), chatId })).toEqual([]);
});

test("R-OBS: an UNTRACED game is byte-identical — the same turn lands the same state with no sink wired", async ({ app, db }) => {
  // The zero-cost claim, asserted rather than asserted-in-a-comment: the emit sites are `deps.trace?.(…)`, so
  // with no recorder the event objects are never even constructed and the turn behaves exactly as before.
  const { chatId, hostId } = await seedHostGameChat(db, "robs-untraced");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "She fords the river." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([{ name: "update_scene", args: { location: "the ford", recentEvent: "forded the river" } }]),
  );

  expect(spy.chatTurns).toEqual([]);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford");
});

test("R1 composed-real: the same calls, folded vs a tool ROUND, produce the SAME state", async ({ app, db }) => {
  // The shared-plane proof for the new vehicle: change only the DELIVERY and the durable outcome is identical.
  const calls = [{ name: "update_scene", args: { location: "the obsidian tower", recentEvent: "arrived at the tower" } }];

  const folded = await seedHostGameChat(db, "r1-parity-fold");
  const foldCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await foldCompose.service.createGame({ principal: hostPrincipal(folded.hostId), chatId: folded.chatId, mode: "lite" });
  await foldCompose.service.updateConfig({ principal: hostPrincipal(folded.hostId), chatId: folded.chatId, extractionMode: "folded" });
  const foldSlot = await seedMessage(db, folded.chatId, 1, { role: "assistant", content: "They arrive." });
  await foldCompose.chatOps.onTurnCompleted(folded.chatId, foldSlot.messageId, foldSlot.variantId, TURN, foldedTurn(calls));

  // The DEDICATED round over the same planes (answered with the identical calls, one beat later).
  const round = await seedHostGameChat(db, "r1-parity-round");
  const roundCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    cannedToolCalls: calls.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  await roundCompose.service.createGame({ principal: hostPrincipal(round.hostId), chatId: round.chatId, mode: "lite" });
  await roundCompose.service.updateConfig({ principal: hostPrincipal(round.hostId), chatId: round.chatId, extractionMode: "cheap" });
  const roundSlot = await seedMessage(db, round.chatId, 1, { role: "assistant", content: "They arrive." });
  await roundCompose.chatOps.onTurnCompleted(round.chatId, roundSlot.messageId, roundSlot.variantId, TURN, tc("chat-completions"));

  const foldView = await foldCompose.service.getTrackerView({ principal: hostPrincipal(folded.hostId), chatId: folded.chatId });
  const roundView = await roundCompose.service.getTrackerView({ principal: hostPrincipal(round.hostId), chatId: round.chatId });
  expect(foldView.ambient?.location).toBe(roundView.ambient?.location);
  expect(foldView.recentBeats).toEqual(roundView.recentBeats);
});

test("R1 degrade: a MALFORMED tool arg is dropped + logged; the rest of the turn's state still lands", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r1-malformed");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The prose is fine." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, {
    ...tc("chat-completions"),
    terminalToolCalls: [
      // Not JSON at all — the class that would throw if the fold parsed naively.
      { toolCallId: "c1", name: "update_party", arguments: "{oops" },
      // Valid JSON, invalid against its own arg schema.
      { toolCallId: "c2", name: "upsert_quest", arguments: JSON.stringify({ name: 42 }) },
      { toolCallId: "c3", name: "update_scene", arguments: JSON.stringify({ location: "the ford" }) },
    ],
  });

  // The turn did not fail (we are here), no model call was made to recover, and the GOOD call still applied.
  expect(spy.summarizeModels).toEqual([]);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford");
  // The narrative is untouched — the flush never edits the committed variant, only the snapshot beside it.
  const rows = await db.select({ content: messageVariants.content }).from(messageVariants).where(eq(messageVariants.id, variantId));
  expect(rows[0]?.content).toBe("The prose is fine.");
  // The loss is NAMED (D109-7 totality) — both bad calls, by tool name.
  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable");
  expect((line?.[0] as { droppedTools?: string[] }).droppedTools).toEqual(["update_party", "upsert_quest"]);
});

// D112 (3) — THE SILENT FORK, closed. `z.object` is STRIP mode, so a call carrying a key the arg schema never
// declared PARSED CLEAN with that key (and its write) silently deleted: not a `malformedToolCalls` drop (the
// call succeeded), not a salvage drop (the entry conformed), not `rpg.extraction.empty` (the other writes
// landed). The measured shape is a model reaching for the tool-arg vocabulary of a DIFFERENT plane —
// `update_party {targetRef, mana:-3}` where a `trackerDeltas` entry belonged. Before this test, that beat's
// resource spend vanished into a SUCCESS record with nothing anywhere saying so.
test("D112 (3): an INVENTED key on an otherwise-valid folded call is NAMED, never silently stripped", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r1-stripped");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "He spends himself holding the line." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([
      // Top-level invented key (the wrong plane's vocabulary) beside a field that IS declared.
      { name: "update_party", args: { targetRef: "player", status: "wounded", mana: -3 } },
      // NESTED invented key, inside an array item — the depth the projection pin also covers.
      { name: "update_scene", args: { location: "the ford", presentUpsert: [{ name: "Kael", vibe: "grim" }] } },
    ]),
  );

  // The declared writes still applied — strictness would have cost the whole call (EXT-4a: drop as little as
  // possible), so detection is the closing arm, not rejection.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford");
  expect(view.actors.map((a) => a.volatile?.status ?? null)).toContain("wounded");
  // …and the vanished writes are NAMED, with the path that says which key on which tool.
  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.stripped");
  expect(line).toBeDefined();
  expect((line?.[0] as { strippedKeys?: string[] }).strippedKeys).toEqual(["update_party.mana", "update_scene.presentUpsert.0.vibe"]);
  // A strip is NOT a drop: nothing was thrown away whole, so the drop channel must stay silent about it.
  expect(warnSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable")).toBe(false);
});

test("D112 (3): the STRUCTURED arm names the same strips — incl. a whole plane sent under an undeclared root key", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "structured-stripped");
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "agent-sdk",
    spy: emptySpy(),
    cannedText: JSON.stringify({
      party: [{ targetRef: "player", status: "wounded", mana: -3 }],
      scene: { location: "the ford" },
      // A whole plane emitted under a key that names nothing — the most invisible shape, since the per-plane
      // walk never looks at it. It must still be reported, or the turn reads as a quiet beat.
      trackerDeltas: [{ key: "hp", delta: -2 }],
    }),
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "He holds the line." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford"); // the conforming writes landed
  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.stripped");
  expect(line).toBeDefined();
  expect((line?.[0] as { strippedKeys?: string[] }).strippedKeys).toEqual(["trackerDeltas", "party.0.mana"]);
});

test("R1 degrade: ZERO tool calls is a QUIET beat, not an error — its own log line, no snapshot, no model call", async ({ app, db }) => {
  const infoSpy = vi.spyOn(logger, "info");
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r1-quiet");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They talk about the weather." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, foldedTurn([]));

  expect(spy.summarizeModels).toEqual([]); // a quiet beat NEVER triggers a rescue round
  // Its OWN event — never `unparseable` (a parse failure) and never `empty` (a mis-target signal).
  expect(infoSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "rpg.extraction.folded.quiet")).toBe(true);
  expect(warnSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable")).toBe(false);
  expect(warnSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "rpg.extraction.empty")).toBe(false);
});

test("R1 degrade: a GHOST actor in a folded call is dropped (no cast mint) + logged, like the round's", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r1-ghost");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A stranger appears." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([{ name: "update_party", args: { targetRef: "Zzyzx the Unknown", status: "cursed" } }]),
  );

  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.phantom");
  expect((line?.[0] as { phantomTargets?: string[] }).phantomTargets).toContain("Zzyzx the Unknown");
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.actors.some((a) => a.actorRef.kind === "cast")).toBe(false);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EXT-4a — EQUAL DROP SEMANTICS: one malformed payload, all THREE delivery paths, identical survivors.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The defect: the structured arm validated the WHOLE extraction with one `safeParse`, so a single malformed field
// discarded all six planes — while cheap/folded, validating per call, lost only the bad call. This is the
// invariant that can never regress: change only the VEHICLE and the surviving state is byte-identical.

/** The turn's writes, as TOOL CALLS: four good planes + a content-less journal entry (MALFORMED — the whole
 *  entry is unsalvageable) + a type-less one (HEALED to `note`, the EXT-4b arm). */
const MIXED_CALLS = [
  { name: "update_party", args: { targetRef: "player", status: "wounded" } },
  { name: "update_scene", args: { location: "the ford", recentEvent: "forded the river" } },
  { name: "upsert_quest", args: { name: "Cross the river", action: "create", objectives: ["Find the ford"] } },
  { name: "add_journal_entry", args: { type: "note", title: "a title with no body" } },
  { name: "add_journal_entry", args: { content: "They forded the river." } },
];

/** The SAME writes as a structured-output payload (the shared-plane proof: an extraction is a batch of
 *  the tool calls the model would otherwise have made). Derived from `MIXED_CALLS` so the two can never drift. */
function mixedExtractionText(): string {
  const argsFor = (name: string): unknown[] => MIXED_CALLS.filter((c) => c.name === name).map((c) => c.args);
  return JSON.stringify({
    party: argsFor("update_party"),
    scene: argsFor("update_scene")[0],
    quests: argsFor("upsert_quest"),
    journal: argsFor("add_journal_entry"),
  });
}

/** The DURABLE survivors of a turn, read back through the real views — the thing the three paths must agree on
 *  (ids/timestamps excluded: they are per-run mints, not semantics). */
async function survivingState(compose: ReturnType<typeof buildRpg>, hostId: UserId, chatId: ChatId): Promise<unknown> {
  const principal = hostPrincipal(hostId);
  const view = await compose.service.getTrackerView({ principal, chatId });
  const journal = await compose.service.listJournal({ principal, chatId, limit: 50 });
  return {
    location: view.ambient?.location,
    beats: view.recentBeats,
    statuses: view.actors.map((a) => a.volatile?.status ?? null),
    quests: view.quests.map((q) => ({ name: q.name, status: q.status, objectives: q.objectives.map((o) => ({ text: o.text, completed: o.completed })) })),
    journal: journal.map((j) => ({ type: j.type, label: j.label, title: j.title, content: j.content })),
  };
}

test("EXT-4a: the SAME malformed payload leaves IDENTICAL state on all three delivery paths", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");

  // (1) STRUCTURED — the schema emission (the agent-sdk degrade), salvaged per plane / per entry.
  const rel = await seedHostGameChat(db, "ext4-structured");
  const relCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy: emptySpy(), cannedText: mixedExtractionText() });
  await relCompose.service.createGame({ principal: hostPrincipal(rel.hostId), chatId: rel.chatId, mode: "lite" });
  await relCompose.service.updateConfig({ principal: hostPrincipal(rel.hostId), chatId: rel.chatId, extractionMode: "cheap" });
  const relSlot = await seedMessage(db, rel.chatId, 1, { role: "assistant", content: "They ford the river." });
  await relCompose.chatOps.onTurnCompleted(rel.chatId, relSlot.messageId, relSlot.variantId, TURN, tc("agent-sdk"));

  // (2) CHEAP — the dedicated tool round, answered with the same writes as parallel calls.
  const cheap = await seedHostGameChat(db, "ext4-cheap");
  const cheapCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    cannedToolCalls: MIXED_CALLS.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  await cheapCompose.service.createGame({ principal: hostPrincipal(cheap.hostId), chatId: cheap.chatId, mode: "lite" });
  await cheapCompose.service.updateConfig({ principal: hostPrincipal(cheap.hostId), chatId: cheap.chatId, extractionMode: "cheap" });
  const cheapSlot = await seedMessage(db, cheap.chatId, 1, { role: "assistant", content: "They ford the river." });
  await cheapCompose.chatOps.onTurnCompleted(cheap.chatId, cheapSlot.messageId, cheapSlot.variantId, TURN, tc("chat-completions"));

  // (3) FOLDED — the character turn's own co-emitted calls.
  const fold = await seedHostGameChat(db, "ext4-folded");
  const foldCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await foldCompose.service.createGame({ principal: hostPrincipal(fold.hostId), chatId: fold.chatId, mode: "lite" });
  const foldSlot = await seedMessage(db, fold.chatId, 1, { role: "assistant", content: "They ford the river." });
  await foldCompose.chatOps.onTurnCompleted(fold.chatId, foldSlot.messageId, foldSlot.variantId, TURN, foldedTurn(MIXED_CALLS));

  const survivors = await Promise.all([
    survivingState(relCompose, rel.hostId, rel.chatId),
    survivingState(cheapCompose, cheap.hostId, cheap.chatId),
    survivingState(foldCompose, fold.hostId, fold.chatId),
  ]);
  // THE INVARIANT: three vehicles, one outcome.
  expect(survivors[1]).toEqual(survivors[0]);
  expect(survivors[2]).toEqual(survivors[0]);
  // …and that outcome is the RIGHT one: the four good planes landed, the malformed journal entry alone died,
  // and the type-less beat was healed rather than dropped. (Pre-fix, the structured arm's survivors were EMPTY.)
  expect(survivors[0]).toEqual({
    location: "the ford",
    beats: ["forded the river"],
    statuses: ["wounded"],
    quests: [{ name: "Cross the river", status: "active", objectives: [{ text: "Find the ford", completed: false }] }],
    journal: [{ type: "note", label: "", title: "They forded the river.", content: "They forded the river." }],
  });
  // Every path NAMED its loss (D109-7 totality): the structured arm itemizes plane+entry, the tool arms name
  // the tool — and the heal has its own line, so a silently-degrading model is visible on all three.
  const unparseable = warnSpy.mock.calls.filter((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable");
  expect(unparseable.length).toBe(3);
  expect((unparseable[0]?.[0] as { dropped?: { plane: string; index: number | null }[] }).dropped).toEqual([
    { plane: "journal", index: 0, issues: expect.arrayContaining([expect.stringContaining("content")]) },
  ]);
  expect((unparseable[1]?.[0] as { droppedTools?: string[] }).droppedTools).toEqual(["add_journal_entry"]);
  expect((unparseable[2]?.[0] as { droppedTools?: string[] }).droppedTools).toEqual(["add_journal_entry"]);
  const healed = warnSpy.mock.calls.filter((c) => (c[0] as { event?: string }).event === "rpg.extraction.healed");
  expect(healed).toHaveLength(3);
  expect((healed[0]?.[0] as { healedJournalTypes?: number[] }).healedJournalTypes).toEqual([0]);
});

test("EXT-4a: a totally unparseable structured payload is still one WARN + an empty delta (no partial garbage)", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "ext4-garbage");
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy: emptySpy(), cannedText: "I'm sorry, I can't do that." });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Nothing lands." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable");
  expect((line?.[0] as { dropped?: { plane: string }[] }).dropped).toEqual([{ plane: "root", index: null, issues: ["expected a JSON object"] }]);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient).toBeNull(); // nothing salvageable ⇒ no snapshot at all (the non-writing turn)
});

test("BORN FOLDED: a FRESH game on an agent-sdk wire still lands state — via the LOUD fallback round", async ({ app, db }) => {
  // Games are born `folded` (owner ruling 2026-08-01), and the stateful agent-sdk wire cannot carry terminal
  // tools — so the very first turn of a brand-new room on that backend takes the degrade arm. It must (a) still
  // write its state and (b) SAY it fell back: a delivery fork that resolves silently is BANNED (D112 (3)).
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "born-folded-sdk");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // NO updateConfig — born folded
  expect((await rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId })).extractionMode).toBe("folded");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });

  // `terminalToolCalls: null` = the character turn could not mount the tools (the agent-sdk wire).
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // The state landed anyway (cheap's round on agent-sdk rides the SAME structured extraction — shared plane).
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  // …and the extra call the fold exists to delete is VISIBLE in the trail, named.
  const path = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.path");
  expect(path?.[0]).toMatchObject({ mode: "folded", path: "tool-round", fallbackReason: "no-terminal-channel" });
});

test("EXT-4c: a quest UPDATE restating its objectives keeps the completed ones (composed-real, folded)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ext4-quest");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  // Beat 1: the quest is created with two objectives.
  const slot1 = await seedMessage(db, chatId, 1, { role: "assistant", content: "The task opens." });
  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    slot1.messageId,
    slot1.variantId,
    castId<ChatTurnId>("chat_turn_quest_1"),
    foldedTurn([{ name: "upsert_quest", args: { name: "Reach the Vault", action: "create", objectives: ["Find the road", "Enter the vault"] } }]),
  );

  // Beat 2: the model marks ONE objective done AND restates the list (the shape that used to wipe the flag).
  const slot2 = await seedMessage(db, chatId, 2, { role: "assistant", content: "The road is found." });
  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    slot2.messageId,
    slot2.variantId,
    castId<ChatTurnId>("chat_turn_quest_2"),
    foldedTurn([
      {
        name: "upsert_quest",
        args: { name: "Reach the Vault", action: "update", objectives: ["Find the road", "Enter the vault"], completeObjectives: ["Find the road"] },
      },
    ]),
  );

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.quests[0]?.objectives.map((o) => ({ text: o.text, completed: o.completed }))).toEqual([
    { text: "Find the road", completed: true },
    { text: "Enter the vault", completed: false },
  ]);
  // The ids survived the restatement too — the objective is the SAME line, not a re-mint.
  const ids = view.quests[0]?.objectives.map((o) => o.id) ?? [];
  expect(new Set(ids).size).toBe(2);
});

test("R1: the mounted terminal tools ARE the round's set, ref-constrained (the fold changes delivery, not schema)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-tools");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  // The host's opt-out (cheap) mounts NONE — the two-call arm never touches the character turn's wire.
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const built = await rpgCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  expect(built?.terminalTools).toBeUndefined();

  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const folded = await rpgCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  // The SAME tools the dedicated round sends, in the same order, incl. the `no_changes` escape. R6: this game
  // defines NO game-subject tracker, so `set_tracker` is OMITTED ENTIRELY (a disabled feature's tool is absent,
  // never an empty husk) — the rest of the round's set is byte-identical.
  expect(folded?.terminalTools?.map((t) => t.name)).toEqual([...RPG_TOOL_ROUND_TOOL_NAMES].filter((n) => n !== "set_tracker"));
  // …carrying the CACHE-STABLE ref projection (F4): the party plane is fully writable, but its scene-derived
  // enums are gone — this payload opens the character turn's cached prefix (the byte-stability pin is below).
  const party = folded?.terminalTools?.find((t) => t.name === "update_party")?.parameters as {
    properties?: { targetRef?: { enum?: string[]; type?: string }; hpDelta?: unknown; addCondition?: unknown };
  };
  expect(party.properties?.targetRef?.enum).toBeUndefined();
  expect(party.properties?.targetRef?.type).toBe("string");
  // The party plane's non-tracker arms survive; `hpDelta` does not (R3 — health rides `trackerDeltas`).
  expect(party.properties?.hpDelta).toBeUndefined();
  expect(party.properties?.addCondition).toBeDefined();
  // RV-9: `update_scene`'s description carries the WHEN — the panel's Waystone only reads as a clock if the
  // model actually advances time/weather/day, and a bare field list measurably doesn't get that written.
  const scene = folded?.terminalTools?.find((t) => t.name === "update_scene");
  expect(scene?.description).toContain("timeOfDay");
  expect(scene?.description).toContain("spends time");
  expect(scene?.description).toContain("sky turns");
  // …and that weather is the WORLD'S weather, omitted indoors. Every enum member is an outdoor condition, so
  // an interior scene has no legal value; the old copy still pushed for one, and the resulting
  // `weather.type: "indoors"` used to discard the entire `update_scene` call (location + cast + recentEvent
  // with it). The tool DESCRIPTION carries this because a schema-enforcing backend reads it, not the prose.
  expect(scene?.description).toContain("WORLD'S weather");
  expect(scene?.description).toContain("indoors or out");
  expect(scene?.description).toContain("when the story says nothing about the sky");
  // EXT-4b/4c — the new arms reach the WIRE tools too (the fold + the cheap round share this assembly, and the
  // structured schema is the same projection): the quest completion gesture is offered, and `journal[].type` is
  // marked required in the grammar even though the zod made it optional for the heal.
  const quest = folded?.terminalTools?.find((t) => t.name === "upsert_quest")?.parameters as { properties?: Record<string, unknown> };
  expect(quest.properties?.["completeObjectives"]).toBeDefined();
  const journal = folded?.terminalTools?.find((t) => t.name === "add_journal_entry")?.parameters as { required?: string[] };
  expect(journal.required).toEqual(expect.arrayContaining(["type", "content"]));
  // The registry channel stays empty — nothing here is executed or recursed on.
  expect(folded?.tools).toEqual([]);

  // R6/R2 — define a game tracker + a party tracker: the tool APPEARS, its key enum binds, and the party
  // description names the host's tracker by label AND gloss (the write surface is a per-game assembly).
  await rpgCompose.service.updateConfig({
    principal: hostPrincipal(hostId),
    chatId,
    patch: {
      trackers: [
        rpgTrackerDefSchema.parse({ key: "alarm", label: "Town alarm", shape: "meter", write: "set", subject: "game", max: 100 }),
        rpgTrackerDefSchema.parse({
          key: "grit",
          label: "Grit",
          shape: "meter",
          write: "delta",
          subject: "actor",
          appliesTo: "everyone",
          max: 10,
          hint: "resolve you spend to push through danger",
        }),
      ],
    },
  });
  const withTrackers = await rpgCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  const setTracker = withTrackers?.terminalTools?.find((t) => t.name === "set_tracker");
  expect((setTracker?.parameters as { properties?: { key?: { enum?: string[] } } }).properties?.key?.enum).toEqual(["alarm"]);
  const partyTool = withTrackers?.terminalTools?.find((t) => t.name === "update_party");
  expect(partyTool?.description).toContain("Grit");
  expect(partyTool?.description).toContain("resolve you spend to push through danger");
  const partyArms = partyTool?.parameters as { properties?: { trackerDeltas?: { items?: { properties?: { key?: { enum?: string[] } } } } } };
  expect(partyArms.properties?.trackerDeltas?.items?.properties?.key?.enum).toEqual(["grit"]);
});

// F4 (`scripts/probes/openrouter/RESULTS.md`) — the folded turn's tools are the FIRST bytes of the character
// turn's cached prompt prefix, and the probe measured that ANY change to that payload drops `cached_tokens` to
// zero and re-bills the whole prefix (~10× that turn). So the fold's payload must not move when the SCENE
// moves; the DEDICATED round — the enforcing vehicle, whose own prefix re-renders the same refs every turn
// regardless — must keep the live enums. Both halves, on one game, driven through the real graph.
test("PROMPT-CACHE (probe F4): a gained actor + condition leave the FOLDED tools byte-identical; the ROUND keeps live enums", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f4-cache-stability");
  const principal = hostPrincipal(hostId);
  const foldCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await foldCompose.service.createGame({ principal, chatId, mode: "lite" });
  await foldCompose.service.updateConfig({ principal, chatId, extractionMode: "folded" });

  // An opening beat ESTABLISHES the scene first: `establishScene` is deliberately still state-dependent (it is
  // the lever that makes a fresh game populate at all, and it settles once instead of churning per beat), so the
  // pin below is about the ONGOING-PLAY churn F4 named — a cast/condition change on an established scene.
  const open = await seedMessage(db, chatId, 1, { role: "assistant", content: "The rafters creak in the dark." });
  await foldCompose.chatOps.onTurnCompleted(
    chatId,
    open.messageId,
    open.variantId,
    TURN,
    foldedTurn([{ name: "update_scene", args: { location: "the rafters", timeOfDay: "night", presentUpsert: [{ name: "Kael" }], recentEvent: "they wait" } }]),
  );
  const before = await foldCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });

  // One beat of real play: an NPC walks on stage and someone takes a condition. This is EXACTLY the churn that
  // was re-billing the prefix — `actorRefs` gains Mira and `conditionNames` gains Bleeding.
  const slot = await seedMessage(db, chatId, 2, { role: "assistant", content: "Mira drops from the rafters; you take a cut." });
  await foldCompose.chatOps.onTurnCompleted(
    chatId,
    slot.messageId,
    slot.variantId,
    TURN,
    foldedTurn([
      { name: "update_scene", args: { presentUpsert: [{ name: "Mira", mood: "wary" }], recentEvent: "Mira dropped in" } },
      { name: "update_party", args: { targetRef: "player", addCondition: { name: "Bleeding" }, status: "bleeding" } },
    ]),
  );

  // The state genuinely moved (without this the byte-comparison below would be vacuous).
  const view = await foldCompose.service.getTrackerView({ principal, chatId });
  expect(view.actors.filter((a) => a.presence).map((a) => a.name)).toContain("Mira");

  const after = await foldCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  // The enumeration the enums used to carry is STILL delivered — in the depth-0 state block, BELOW the cache
  // breakpoint, where it costs nothing to change. That placement is what makes the schema drop honest.
  const stateBlock = after?.injections[0]?.content ?? "";
  expect(stateBlock).toContain("Mira");
  expect(stateBlock).toContain("Bleeding");
  // THE CACHE-KEY PROPERTY: the mounted payload is byte-identical across the two turns.
  expect(JSON.stringify(after?.terminalTools)).toEqual(JSON.stringify(before?.terminalTools));

  // THE ENFORCEMENT PROPERTY: the dedicated round, on this SAME state, still binds the live enums — the
  // vehicle whose backend actually grammar-enforces them loses nothing.
  const spy = emptySpy();
  const roundCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: "{}", cannedToolCalls: [] });
  await roundCompose.service.updateConfig({ principal, chatId, extractionMode: "cheap" });
  const roundSlot = await seedMessage(db, chatId, 3, { role: "assistant", content: "She presses a hand to the wound." });
  await roundCompose.chatOps.onTurnCompleted(chatId, roundSlot.messageId, roundSlot.variantId, TURN, tc("chat-completions"));
  const roundParty = spy.wireTools[0]?.find((t) => t.name === "update_party")?.parameters as {
    properties?: { targetRef?: { enum?: string[] }; removeCondition?: { enum?: string[] } };
  };
  expect(roundParty.properties?.targetRef?.enum).toContain("Mira");
  expect(roundParty.properties?.removeCondition?.enum).toEqual(["Bleeding"]);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// VER-1a — A REROLL SUPERSEDES, IT DOES NOT ACCUMULATE (+ the resync reconciler's idempotence).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The live-confirmed defect: the state round resolved its base as the resolution HEAD, so a NEW variant on an
// already-flushed slot took its own REJECTED sibling's applied extraction as base and re-applied on top —
// every reroll paraphrased the same story beat into `recentEvents` again (the owner's dogfood chat carried
// three near-identical "Niko was touched you remembered her name" beats off ONE story moment). PRE-EXISTING on
// all three vehicles, so the pin drives all three: reroll ⇒ ONE beat set, never N.

/** The turn's writes as TOOL CALLS (the cheap/folded vehicles' shape) — a scene beat + a journal entry, i.e.
 *  exactly the two APPEND-shaped planes a duplicated base re-applies. */
const REROLL_CALLS = [
  { name: "update_scene", args: { location: "the obsidian tower", recentEvent: "arrived at the tower" } },
  { name: "add_journal_entry", args: { type: "location", title: "Arrival", content: "They reached the tower." } },
];

/** The SAME writes as a structured payload (derived from the calls, so the two can never drift). */
function rerollExtractionText(): string {
  const argsFor = (name: string): unknown[] => REROLL_CALLS.filter((c) => c.name === name).map((c) => c.args);
  return JSON.stringify({ party: [], inventory: [], scene: argsFor("update_scene")[0], trackers: [], quests: [], journal: argsFor("add_journal_entry") });
}

/** Flip a slot's selected variant — the D26 pointer move (zero content copy) a swipe/reroll performs. */
async function selectVariant(db: Db, messageId: MessageId, variantId: MessageVariantId): Promise<void> {
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
}

/** The panel state a game currently projects — the two planes the accumulation bug grew. */
async function panelState(
  compose: ReturnType<typeof buildRpg>,
  hostId: UserId,
  chatId: ChatId,
): Promise<{ location: string | undefined; beats: readonly string[]; journal: readonly string[] }> {
  const principal = hostPrincipal(hostId);
  const view = await compose.service.getTrackerView({ principal, chatId });
  const journal = await compose.service.listJournal({ principal, chatId, limit: 50 });
  return { location: view.ambient?.location, beats: view.recentBeats, journal: journal.map((j) => j.title) };
}

/** Generate a turn onto a fresh slot, then REROLL it: a second variant on the SAME slot, selected, flushed
 *  again with the same writes. Returns the panel state the two flushes left. */
async function driveReroll(args: {
  readonly compose: ReturnType<typeof buildRpg>;
  readonly db: Db;
  readonly hostId: UserId;
  readonly chatId: ChatId;
  readonly turn: (calls: readonly { name: string; args: unknown }[]) => RpgTurnContext;
}): Promise<{ location: string | undefined; beats: readonly string[]; journal: readonly string[] }> {
  const { compose, db, hostId, chatId, turn } = args;
  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await compose.chatOps.onTurnCompleted(chatId, slot.messageId, slot.variantId, TURN, turn(REROLL_CALLS));
  // THE REROLL: a new variant on the same slot, selected (the rejected one stays as a dead sibling).
  const rerolled = await addVariant(db, slot.messageId, 1, "They arrive at the tower, rain-soaked.");
  await selectVariant(db, slot.messageId, rerolled);
  await compose.chatOps.onTurnCompleted(chatId, slot.messageId, rerolled, TURN, turn(REROLL_CALLS));
  return panelState(compose, hostId, chatId);
}

test("VER-1a: a REROLL supersedes the rejected variant's extraction — ONE beat set, on all three vehicles", async ({ app, db }) => {
  // (1) STRUCTURED — the schema round (the agent-sdk degrade).
  const rel = await seedHostGameChat(db, "ver1a-structured");
  const relCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy: emptySpy(), cannedText: rerollExtractionText() });
  await relCompose.service.createGame({ principal: hostPrincipal(rel.hostId), chatId: rel.chatId, mode: "lite" });
  await relCompose.service.updateConfig({ principal: hostPrincipal(rel.hostId), chatId: rel.chatId, extractionMode: "cheap" });
  const relState = await driveReroll({ compose: relCompose, db, hostId: rel.hostId, chatId: rel.chatId, turn: () => tc("agent-sdk") });

  // (2) CHEAP — the dedicated tool round, answered with the same writes as parallel calls.
  const cheap = await seedHostGameChat(db, "ver1a-cheap");
  const cheapCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    cannedToolCalls: REROLL_CALLS.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  await cheapCompose.service.createGame({ principal: hostPrincipal(cheap.hostId), chatId: cheap.chatId, mode: "lite" });
  await cheapCompose.service.updateConfig({ principal: hostPrincipal(cheap.hostId), chatId: cheap.chatId, extractionMode: "cheap" });
  const cheapState = await driveReroll({ compose: cheapCompose, db, hostId: cheap.hostId, chatId: cheap.chatId, turn: () => tc("chat-completions") });

  // (3) FOLDED — the character turn's own co-emitted calls, on the first pass AND the reroll.
  const fold = await seedHostGameChat(db, "ver1a-folded");
  const foldCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await foldCompose.service.createGame({ principal: hostPrincipal(fold.hostId), chatId: fold.chatId, mode: "lite" }); // born folded
  const foldState = await driveReroll({ compose: foldCompose, db, hostId: fold.hostId, chatId: fold.chatId, turn: (calls) => foldedTurn(calls) });

  // THE REGRESSION: the rerolled variant REPLACED the rejected one's contribution. Pre-fix the beat window read
  // ["arrived at the tower", "arrived at the tower"] on every vehicle (the base carried the dead sibling's write).
  for (const state of [relState, cheapState, foldState]) {
    expect(state.beats).toEqual(["arrived at the tower"]);
    expect(state.location).toBe("the obsidian tower");
    // The journal plane was ALREADY supersede-correct (its read projects the selected variant, so the dead
    // sibling's entry stops rendering the moment the pointer moves) — pinned here so both planes are proven to
    // agree on the same semantics, and so a future "just write journal rows unstamped" regresses loudly.
    expect(state.journal).toEqual(["Arrival"]);
  }
});

test("VER-1a: SWIPING between variants surfaces the SELECTED variant's own consequences (no double-apply)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1a-swipe");
  // Two DIFFERENT extractions on ONE slot — a compose per canned reply, both over the SAME db/game.
  const towerCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy: emptySpy(), cannedText: rerollExtractionText() });
  const fordCompose = buildCannedRpgWithText({
    app,
    db,
    api: "agent-sdk",
    spy: emptySpy(),
    cannedText: JSON.stringify({
      party: [],
      inventory: [],
      scene: { location: "the ford", recentEvent: "waded the ford" },
      trackers: [],
      quests: [],
      journal: [{ type: "location", label: "", title: "The crossing", content: "They waded the ford." }],
    }),
  });
  await towerCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await towerCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });

  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await towerCompose.chatOps.onTurnCompleted(chatId, slot.messageId, slot.variantId, TURN, tc("agent-sdk"));
  const rerolled = await addVariant(db, slot.messageId, 1, "They wade the ford instead.");
  await selectVariant(db, slot.messageId, rerolled);
  await fordCompose.chatOps.onTurnCompleted(chatId, slot.messageId, rerolled, TURN, tc("agent-sdk"));

  // The REROLLED variant is selected: its own consequences, and ONLY its own (pre-fix the ford's snapshot was
  // built on the tower's, so the panel read "the ford" with BOTH beats).
  expect(await panelState(fordCompose, hostId, chatId)).toEqual({ location: "the ford", beats: ["waded the ford"], journal: ["The crossing"] });

  // Swipe BACK — a pure pointer move, zero writes: the first variant's state + beat + journal entry return
  // whole, and nothing was re-applied (each variant's snapshot is absolute over the same pre-slot base).
  await selectVariant(db, slot.messageId, slot.variantId);
  expect(await panelState(towerCompose, hostId, chatId)).toEqual({ location: "the obsidian tower", beats: ["arrived at the tower"], journal: ["Arrival"] });
});

// ── PROSE-1 S4: a host's EXTRACTION template edit reaches the write surface ───────────────────────────
// The census rows 11-26/29-36 became slot rows in `contracts/rpg/prose.ts`, homed on the GM PRESET's
// `promptConfig.prose` and authored in the preset Templates tab. This is the END-TO-END proof for the HOST
// DOOR arm of the threading: the verb has no turn to inherit a frozen prose view from, so it resolves its own
// through chat's `resolveChatPresetProse` — which runs the SAME ladder a turn runs (the GM-voice preset
// REDIRECT first, then the owner-scoped preset read), so a table's authored copy reaches its rebuild exactly
// as it reaches its turns. Asserted through the rendered SYSTEM PROMPT the wire actually carried: the only
// place where "the host edited it" and "the model was told it" are the same fact.
test("PROSE-1: a GM-preset extraction override rides the RESYNC's system prompt, replacing the shipped default", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "prose-extract-resync");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  // The AGENT-SDK wire carries no `tools[]`, so the resync takes its STRUCTURED degrade — the arm whose
  // request has a system prompt the harness records. Same composition either way (the shared-plane proof);
  // this is the vehicle that lets the assertion read the rendered bytes rather than a tool description.
  const compose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy, cannedText: rerollExtractionText() });
  // The host authors the edit where the ruling put it: the preset's own `promptConfig.prose`, keyed by slot id.
  const presetId = castId<PresetId>("preset_prose_extract");
  await db.insert(presets).values({
    id: presetId,
    ownerId: hostId,
    name: "table voice",
    kind: "user",
    config: {
      ...DEFAULT_PROMPT_CONFIG,
      prose: {
        "rpg.extract.plane.inventory": { text: "INVENTORY — only coin and what a hand can carry. Nothing else is tracked at this table.", baseVersion: 1 },
      },
    },
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });
  await compose.service.updateConfig({ principal, chatId, extractionMode: "cheap", gmPresetId: presetId });
  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await compose.chatOps.onTurnCompleted(chatId, slot.messageId, slot.variantId, TURN, tc("agent-sdk"));
  spy.systemPrompts.length = 0; // the turn's own round is not what this asserts — the HOST DOOR is

  await compose.service.resyncFromStory({ principal, chatId });

  const prompt = spy.systemPrompts[0] ?? "";
  expect(prompt).toContain("INVENTORY — only coin and what a hand can carry.");
  // …and the shipped default is GONE, not merely joined by the override (a slot resolves two rungs deep,
  // never a cascade — the override IS the plane's teaching now).
  expect(prompt).not.toContain("recording an item the story established");
  // Every OTHER plane still ships its default in the same composition, so an edit is surgical rather than a
  // fork of the whole prompt.
  expect(prompt).toContain("PARTY — party: ONLY mechanical changes.");
});

// ── resyncFromStory: the RECONCILER lands the re-derived truth, it never appends onto it ──────────────
// The owner clicked "Resync from story" four times on an unchanged story and the panel GREW: four paraphrases
// of one beat in `recentEvents` + three near-identical journal rows (each resync minted its own anchor slot,
// so the lineage projection could not hide any of them). The reconciler now REBUILDS the beat window and
// writes NO journal, so N clicks == 1 click.

test("VER-1a: resyncFromStory is IDEMPOTENT — two consecutive resyncs leave byte-identical state", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1a-resync");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: rerollExtractionText(),
    cannedToolCalls: REROLL_CALLS.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });
  await compose.service.updateConfig({ principal, chatId, extractionMode: "cheap" });
  // A real story beat first, so the resync reconciles against a populated panel (not a born-empty game).
  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await compose.chatOps.onTurnCompleted(chatId, slot.messageId, slot.variantId, TURN, tc("chat-completions"));

  await compose.service.resyncFromStory({ principal, chatId });
  // THE CATCH-UP ROUND IS A TOOL ROUND (owner ruling 2026-08-03): on a wire that carries `tools[]` the resync
  // asks for several SMALL per-plane calls instead of one 46-optional structured monolith — the shape both
  // hosted grammar walls are made of. The `structured` dispatcher is untouched on this wire.
  expect(spy.summarizeModels).toEqual([]);
  const first = await panelState(compose, hostId, chatId);
  await compose.service.resyncFromStory({ principal, chatId });
  const second = await panelState(compose, hostId, chatId);

  // IDEMPOTENT: the second pass landed the same truth, it did not append onto the first's.
  expect(second).toEqual(first);
  // …and the truth is the REBUILT window (one beat, not the turn's beat plus a paraphrase of it), with the
  // archive untouched by the rebuild (the turn's own entry, exactly once).
  expect(first).toEqual({ location: "the obsidian tower", beats: ["arrived at the tower"], journal: ["Arrival"] });
});

// RESYNC-OR — the END-TO-END loudness proof, through the REAL compose op. The provider refusing the structured
// call is exactly what the host hit live (OpenRouter 400'd every `response_format: json_schema` extraction on
// the default hosted model); the op swallowed it into an empty delta and the verb reported "nothing to resync".
test("RESYNC-OR: a provider refusal reaches the HOST as a reason — never a silent 'nothing changed'", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-or-loud");
  const principal = hostPrincipal(hostId);
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    // The catch-up round rides the CHAT role now; a provider refusal lands there.
    chatThrows: new Error("openrouter item 0 failed: Provider returned error"),
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });

  const verdict = await compose.service.resyncFromStory({ principal, chatId });

  expect(verdict.ok).toBe(false);
  // The provider's own sentence rides out — the host learns the MODEL CALL died, not that their story was clean.
  expect(verdict).toMatchObject({ ok: false, reason: expect.stringContaining("openrouter item 0 failed") });
  // …and the failed round still writes nothing (the no-op tail is unchanged; only the silence is gone).
  expect(await panelState(compose, hostId, chatId)).toMatchObject({ beats: [], journal: [] });
});

// The STRUCTURED degrade survives whole — a wire with no `tools[]` (the agent-sdk host, or a structured-only
// endpoint) still rebuilds through the projected schema, and its refusal is equally loud. Both arms of the
// resync's write-path gate are proven: this one, and the tool round above.
test("RESYNC-OR: the STRUCTURED degrade still runs (and still reports its refusal) on a tools-less wire", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-structured-degrade");
  const principal = hostPrincipal(hostId);
  const structuredOnly = makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true } });
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    capability: structuredOnly,
    structuredThrows: new Error("openrouter structured item 0 failed: Provider returned error"),
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });

  const verdict = await compose.service.resyncFromStory({ principal, chatId });
  expect(verdict).toMatchObject({ ok: false, reason: expect.stringContaining("openrouter structured item 0 failed") });
});

// A wire with NEITHER write path refuses BEFORE spending anything — the capability gate, widened to cover both
// vehicles (it used to key on the structured writer alone, which would now hide the tool round from a
// tools-only connection).
test("RESYNC: a connection with no write path at all refuses legibly and calls no model", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-no-writer");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 } } }),
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });

  const verdict = await compose.service.resyncFromStory({ principal, chatId });
  expect(verdict).toMatchObject({ ok: false, reason: expect.stringContaining("can't write game state") });
  expect(spy.chatTurns).toEqual([]);
  expect(spy.summarizeModels).toEqual([]);
});

// THE CATCH-UP ROUND'S VEHICLE, pinned at the request: the per-plane tool SET (the same definitions the in-turn
// vehicles mount) + `tool_choice:"required"` + NO response_format, and the host's own consent.
test("RESYNC: the catch-up round sends the per-plane TOOLS (not a monolithic schema) and folds their calls", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-tool-round");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    cannedToolCalls: [
      { name: "update_scene", arguments: JSON.stringify({ location: "the obsidian tower", recentEvent: "arrived at the tower" }) },
      { name: "add_journal_entry", arguments: JSON.stringify({ type: "location", title: "Arrival", content: "They reached the tower." }) },
    ],
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });

  const verdict = await compose.service.resyncFromStory({ principal, chatId });
  expect(verdict.ok).toBe(true);

  // ONE chat turn, carrying wire tools and NO responseFormat — the monolithic structured payload is gone from
  // this path (that payload is what 400'd on the default hosted model).
  expect(spy.chatTurns).toEqual([{ model: "fake-chat-model", hasResponseFormat: false, hasToolServer: false, ownerConsented: true }]);
  expect(spy.schemas).toEqual([]);
  const roundTools = spy.wireTools.at(0) ?? [];
  expect(roundTools.map((t) => t.name)).toEqual(
    expect.arrayContaining(["update_party", "update_inventory", "update_scene", "upsert_quest", "add_journal_entry"]),
  );
  // Every per-plane schema is SMALL — that is the whole point of the round (the 46-optional monolith is what
  // Anthropic's grammar compiler refused). None of them is the whole extraction object.
  for (const tool of roundTools) {
    expect(Object.keys((tool.parameters["properties"] ?? {}) as Record<string, unknown>)).not.toContain("journal");
  }
  // …and the calls folded through the SAME tail the in-turn vehicles use: the state plane landed. (The
  // JOURNAL stays empty by design — a rebuild re-derives the state window and never appends archive rows,
  // VER-1a; that is unchanged by the vehicle swap.)
  expect(await panelState(compose, hostId, chatId)).toEqual({
    location: "the obsidian tower",
    beats: ["arrived at the tower"],
    journal: [],
  });
});

test("VER-1a: resyncFromStory COLLAPSES an already-accumulated beat window (the owner's one-click cleanup)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1a-resync-cleanup");
  const principal = hostPrincipal(hostId);
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: rerollExtractionText(),
    // The resync's catch-up round rides the TOOL vehicle on this wire — same writes, the calls shape.
    cannedToolCalls: REROLL_CALLS.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  const { gameId } = await compose.service.createGame({ principal, chatId, mode: "lite" });
  await compose.service.updateConfig({ principal, chatId, extractionMode: "cheap" });

  // The dev-db shape the bug left behind: ONE story moment, paraphrased into the window once per reroll/resync.
  const dup = "Niko was touched you remembered her name";
  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "Niko blinks at you." });
  const written = await writeStagedSnapshot(
    db,
    { ...defaultSnapshotState(), location: "the konbini", recentEvents: [`${dup}, then asked about drinks.`, `${dup} and dropped the cat-bit.`, `${dup}.`] },
    { id: castId("rpg_snapshot_ver1a_dup"), gameId, messageId: slot.messageId, variantId: slot.variantId, now: FROZEN_AT },
  );
  expect(written.ok).toBe(true);
  await commitSnapshotForVariant(db, slot.variantId);

  await compose.service.resyncFromStory({ principal, chatId });

  // ONE click re-derives the window from the story — the three duplicates are gone (no migration code needed;
  // the reconciler IS the cleanup). The journal rows the same bug left are NOT the resync's to remove: they are
  // durable archive rows on live anchor slots, and the host clears those with `deleteJournalEntry`.
  expect(await panelState(compose, hostId, chatId)).toEqual({ location: "the obsidian tower", beats: ["arrived at the tower"], journal: [] });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// VER-1b — A REGEN IS GENERATED AGAINST THE STATE AS OF BEFORE ITS SLOT (the READ twin of VER-1a).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// VER-1a fixed the WRITE base; the turn's READ still resolved the head, which on a swipe/reroll IS the
// abandoned variant's snapshot (still selected while the replacement generates). So the reminder taught the
// model the beats + state of the very prose it was being asked to write DIFFERENTLY — owner-observed live in
// the model's own reasoning ("a system note describing a moment that hasn't been written yet"), and every
// reroll got railroaded into paraphrasing the rejected variant. The gather now cuts its state at the slot,
// exactly where the canon context is already cut, and exactly where the flush will apply the new variant.

/** Flush ONE beat onto a fresh assistant slot through the real folded vehicle: a scene write (location +
 *  a recorded beat) that the next gather's reminder + delta must reflect. */
async function driveBeat(args: {
  readonly compose: ReturnType<typeof buildRpg>;
  readonly db: Db;
  readonly chatId: ChatId;
  readonly seq: number;
  readonly location: string;
  readonly beat: string;
}): Promise<{ messageId: MessageId; variantId: MessageVariantId }> {
  const { compose, db, chatId, seq } = args;
  const slot = await seedMessage(db, chatId, seq, { role: "assistant", content: `Beat ${seq}.` });
  await compose.chatOps.onTurnCompleted(
    chatId,
    slot.messageId,
    slot.variantId,
    castId<ChatTurnId>(`chat_turn_ver1b_${seq}`),
    foldedTurn([{ name: "update_scene", args: { location: args.location, recentEvent: args.beat } }]),
  );
  return slot;
}

/** The depth-0 state reminder the gather contributes — the exact text the model is handed. */
function reminderText(gathered: { readonly injections: readonly { readonly content: string }[] } | null): string {
  return gathered?.injections[0]?.content ?? "";
}

test("VER-1b: a REGEN's reminder + delta read the state BEFORE the slot, never the abandoned variant's", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1b-regen");
  const compose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await compose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // born folded

  // Three beats. The third is the slot a swipe will re-generate; its variant A is the one being abandoned.
  await driveBeat({ compose, db, chatId, seq: 1, location: "the crossroads", beat: "met the peddler at the crossroads" });
  await driveBeat({ compose, db, chatId, seq: 2, location: "the rope bridge", beat: "crossed the rope bridge" });
  const slotC = await driveBeat({ compose, db, chatId, seq: 3, location: "the obsidian tower", beat: "confessed to Niko at the tower" });

  // The FRESH-turn arm is UNTOUCHED: the head is correct there — the next beat is written knowing beat 3 happened.
  const fresh = reminderText(await compose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false }));
  expect(fresh).toContain("confessed to Niko at the tower");
  expect(fresh).toContain("the obsidian tower");
  expect(fresh).toContain("CHANGES SINCE LAST BEAT: location → the obsidian tower");

  // THE REGEN of slot C: the same gather, told which slot it is re-generating.
  const regen = reminderText(
    await compose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, regenSlotMessageId: slotC.messageId }),
  );
  // THE DEFECT: variant A's beat + the state it wrote are GONE from what the model is told (pre-fix both were
  // present — the model was handed the confession beat while being asked to write that same moment afresh).
  expect(regen).not.toContain("confessed to Niko at the tower");
  expect(regen).not.toContain("the obsidian tower");
  // …and what IS there is the state as of the slot's start — beat 2's world, the same one variant A was written against.
  expect(regen).toContain("crossed the rope bridge");
  expect(regen).toContain("the rope bridge");
  // THE DELTA PAIR is pre-slot-consistent too (prev→cur = beat 1→beat 2), so "CHANGES SINCE LAST BEAT" never
  // describes the abandoned variant's own changes — it is byte-identically the block variant A was generated with.
  expect(regen).toContain("CHANGES SINCE LAST BEAT: location → the rope bridge");
});

test("VER-1b: the regen read is the SAME state the flush applies onto (read base == write base)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1b-base-parity");
  const compose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await compose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  await driveBeat({ compose, db, chatId, seq: 1, location: "the rope bridge", beat: "crossed the rope bridge" });
  const slot = await driveBeat({ compose, db, chatId, seq: 2, location: "the obsidian tower", beat: "confessed to Niko at the tower" });

  // The reroll: a second variant on slot 2, selected, flushed with ITS OWN beat — the gather that generated it
  // read pre-slot state, and VER-1a's write base applied its writes onto that same pre-slot state.
  const regen = reminderText(
    await compose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, regenSlotMessageId: slot.messageId }),
  );
  expect(regen).toContain("crossed the rope bridge");
  expect(regen).not.toContain("confessed to Niko at the tower");
  const rerolled = await addVariant(db, slot.messageId, 2, "She says nothing at all.");
  await selectVariant(db, slot.messageId, rerolled);
  await compose.chatOps.onTurnCompleted(
    chatId,
    slot.messageId,
    rerolled,
    castId<ChatTurnId>("chat_turn_ver1b_reroll"),
    foldedTurn([{ name: "update_scene", args: { location: "the tower stair", recentEvent: "turned away on the stair" } }]),
  );

  // The rerolled variant SUPERSEDES: one beat per moment, and the abandoned variant's beat/location are gone
  // from the panel — the read the model got and the state its writes landed on describe the same world.
  expect(await panelState(compose, hostId, chatId)).toEqual({
    location: "the tower stair",
    beats: ["crossed the rope bridge", "turned away on the stair"],
    journal: [],
  });
});

test("VER-1b: the regen read is mode-INDEPENDENT — one gather, identical reminder on both vehicles", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1b-modes");
  const compose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await compose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // born folded
  // ONE game, ONE state history (landed through the fold), then the host flips the delivery mode under it.
  await driveBeat({ compose, db, chatId, seq: 1, location: "the rope bridge", beat: "crossed the rope bridge" });
  const slot = await driveBeat({ compose, db, chatId, seq: 2, location: "the obsidian tower", beat: "confessed to Niko at the tower" });

  const reminders: string[] = [];
  for (const mode of ["folded", "cheap"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: each pass flips the game's mode and re-gathers under it — inherently sequential.
    await compose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: mode });
    reminders.push(
      reminderText(
        await compose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, regenSlotMessageId: slot.messageId }),
      ),
    );
  }
  // The delivery mode picks the WRITE vehicle; it never changes what the turn READS. The pre-slot cut therefore
  // rides both without a per-mode arm (the reminder is one gather — this pins that it stays one).
  expect(new Set(reminders).size).toBe(1);
  expect(reminders[0]).toContain("crossed the rope bridge");
  expect(reminders[0]).not.toContain("confessed to Niko at the tower");
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// POPULATE-FROM-CHARACTER (owner ruling 2026-08-01) — the host BORN-STATE round, driven END-TO-END.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The verb's own int test fakes the round; THIS drives the REAL one (the [ct-stub-lie] antidote): the real
// corpus read (card prose + the room's opening line off the real db), the real prompt + constrained grammar on
// the wire, the real `salvagePopulate` (which must throw away the live-play planes a wire volunteered), the
// real title→className mapping, and the real two-door write tail.

/** A canned POPULATE payload — the identity + born gear the card implies, PLUS a `scene` write no card read is
 *  allowed to make (a non-enforcing wire volunteering one). What lands proves the strip is structural. */
const CANNED_POPULATE = {
  sheet: { title: "Warden of House Vane", level: 3 },
  inventory: [
    {
      targetRef: "mara",
      add: [{ name: "Bone key", description: "cold to the touch", quantity: 1, location: "belt pouch" }],
      walletDeltas: [{ name: "gold", delta: 20 }],
    },
  ],
  quests: [{ name: "Reach the Vault of Ash", action: "create", objectives: ["Find the road north"] }],
  scene: { location: "SHOULD NEVER LAND", recentEvent: "SHOULD NEVER LAND" },
  party: [{ targetRef: "mara", trackerDeltas: [{ key: "hp", delta: -5 }] }],
  journal: [{ type: "note", title: "nope", content: "SHOULD NEVER LAND" }],
};

test("POPULATE (real round): the card's identity + gear land, and the live-play planes it volunteered do NOT", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "populate");
  // A real CARD the host owns, with prose the corpus read renders, seated in the room.
  // A REAL minted TypeID: the snapshot write re-validates the volatile `actorRef`, so a fabricated
  // `character_<key>` id would be dropped at the F1 backstop and the gear would silently vanish.
  const characterId = await seedCharacter(db, hostId, "mara", { id: mintTypeId(ID_PREFIX.character) });
  await db.update(characters).set({ description: "A warden of a fallen house, sworn to a dead name." }).where(eq(characters.id, characterId));
  await seedParticipant(db, { chatId, key: "populate_char", characterId, joinSeq: 1 });
  // The room's OPENING line (the first canon slot) — the second half of the corpus.
  await seedMessage(db, chatId, 1, { role: "assistant", content: "You meet Mara at the ford, her cloak heavy with rain." });

  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: JSON.stringify(CANNED_POPULATE) });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  const verdict = await rpgCompose.service.populateFromCharacter({ principal: hostPrincipal(hostId), chatId, actorRef: { kind: "character", characterId } });

  // POPLOUD — the REAL round reports its ending as data: this one filled (the client's success signal).
  expect(verdict).toEqual({ ok: true, populated: true });
  // The round rode the `structured` dispatcher (a non-agent-sdk wire) with the POPULATE grammar: the sheet
  // plane is REQUIRED (the xgrammar lever) and the one target is the whole inventory ref enum.
  expect(spy.summarizeModels).toEqual(["fake-chat-model"]);
  const schema = spy.schemas[0] as {
    required?: string[];
    properties: { sheet: { required?: string[] }; inventory: { items: { properties: { targetRef: { enum?: string[] } } } } };
  };
  expect(schema.required).toContain("sheet");
  expect((schema.properties.sheet.required ?? []).toSorted()).toEqual(["level", "title"]);
  expect(schema.properties.inventory.items.properties.targetRef.enum).toEqual(["mara"]);
  // The prompt carried BOTH halves of the corpus — the card prose and the room's opening line.
  expect(spy.userPrompts[0]).toContain("sworn to a dead name");
  expect(spy.userPrompts[0]).toContain("her cloak heavy with rain");

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  const actor = view.actors.find((a) => a.name === "mara");
  // The WIRE said `title`; the SHEET stores `className` (the one mapping, at the parse seam).
  expect(actor?.sheet.className).toBe("Warden of House Vane");
  expect(actor?.sheet.level).toBe(3);
  expect(actor?.volatile?.inventory.map((i) => i.name)).toEqual(["Bone key"]);
  expect(actor?.volatile?.wallet).toEqual([{ name: "gold", amount: 20 }]);
  expect(view.quests.map((q) => q.name)).toEqual(["Reach the Vault of Ash"]);
  // …and NOTHING the live-play planes volunteered landed: no scene move, no hp write, no journal beat.
  expect(view.ambient?.location ?? "").toBe("");
  expect(actor?.volatile?.trackerValues["hp"] ?? null).toBeNull();
  expect(await rpgCompose.service.listJournal({ principal: hostPrincipal(hostId), chatId, limit: 50 })).toEqual([]);
});

test("POPULATE (real round): a connection with NO structured writer runs no round at all (honest no-op)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "populate-readonly");
  const characterId = await seedCharacter(db, hostId, "vesna", { id: mintTypeId(ID_PREFIX.character) });
  await seedParticipant(db, { chatId, key: "populate_ro_char", characterId, joinSeq: 1 });
  const spy = emptySpy();
  const rpgCompose = buildRpg({
    db,
    now: () => FROZEN_AT,
    rpgChatOps: app.chatRpgOps,
    connection: {
      // Tools but NO structured output — the populate round's own capability gate must refuse it.
      resolveChat: () =>
        Promise.resolve(
          makeResolvedConnection({
            api: "chat-completions",
            model: castId<ModelId>("fake-chat-model"),
            capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 } }, tools: { parallel: true } }),
          }),
        ),
      getOrSkinTierModels: () => Promise.resolve({ opus: "o", sonnet: "s", haiku: "h" }),
    },
    executor: {
      structured: (req): Promise<SummarizeResult> => {
        spy.summarizeModels.push(req.model);
        return Promise.resolve({
          items: [{ text: "{}", usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
          model: "fake-chat-model",
        } satisfies SummarizeResult);
      },
      runChatTurn: (): Promise<ChatResult> => {
        spy.chatTurns.push({ model: "fake-chat-model", hasResponseFormat: false, hasToolServer: false, ownerConsented: false });
        // FABRICATION-OK: this arm must never fire on this test — a minimal double proves it by staying unused.
        return Promise.resolve({ reply: "" } as unknown as ChatResult);
      },
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    resolvePresetOwned: () => Promise.resolve(false),
    copyPresetToUser: () => Promise.resolve(null),
    toolUse: { register: () => undefined },
    // R4 promotion deps — these tests exercise state rounds, never the mint; loud if ever reached.
    character: { create: () => Promise.reject(new Error("unused: promotion not exercised")), findByHandle: () => Promise.resolve(null) },
    chat: { addCharacterToChat: () => Promise.reject(new Error("unused: promotion not exercised")) },
    // D126 — the admin-tier structured-output shape, on its shipped floor (the real root reads it per call off
    // `getEffectiveConfig()`); the strict-arm pin below overrides it.
    structuredOutputShape: () => DEFAULT_STRUCTURED_OUTPUT_SHAPE,
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  const verdict = await rpgCompose.service.populateFromCharacter({ principal: hostPrincipal(hostId), chatId, actorRef: { kind: "character", characterId } });

  // POPLOUD — the REAL compose op REFUSES legibly instead of degrading to an empty delta the verb could only
  // read as "this card had nothing to fill". The host reads this sentence; the `rpg.populate.readonly` warn is
  // the log half of the same branch.
  expect(verdict).toEqual({ ok: false, reason: expect.stringContaining("can't write structured state") });
  // NO model call was paid on a wire that could only have produced garbage, and nothing was written.
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([]);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.actors.find((a) => a.name === "vesna")?.sheet.className).toBe("");
  // …and the panel says so honestly: the born-state button is disabled on this connection.
  const game = await rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId });
  expect(game.canPopulate).toBe(false);
});

// HOST HANDOFF × the GM-voice knob (stickler 2026-08-03 F1) — the COMPOSED-REAL wiring proof for the heal that
// mirrors `resolveForkGmPreset`. `chat.acceptHostHandoff` moves room authority; `rpg_games.gmPresetId` is then
// resolved under the NEW host (`resolvePresetOverride` → the owner-scoped `preset.get`), so a preset the new
// host cannot read is a dead knob: the GM voice silently degrades to their default while `getConfigView` keeps
// serving an unreadable id. Driven through the REAL services graph (chat's verb, rpg's injected op, the real
// `resolvePresetOwned`) — a stubbed seam here would be exactly the [compose-stub-goes-stale] lie.
test("HOST HANDOFF nulls a gmPresetId the new host cannot read, and keeps one they own (composed-real)", async ({ services, db }) => {
  // The chat ids are REAL minted TypeIDs: the notifications `record` this flow delivers (`handoff-nominated` /
  // `handoff-accepted`) re-parses `chatId` through the TypeID schema, which the readable `chat_<key>` seed fails.
  const nominee = await seedUser(db, castId<Handle>("hoffnominee"));
  const seedPreset = async (id: string, ownerId: UserId): Promise<PresetId> => {
    const presetId = castId<PresetId>(id);
    await db
      .insert(presets)
      .values({ id: presetId, ownerId, name: id, kind: "user", config: DEFAULT_PROMPT_CONFIG, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
    return presetId;
  };
  /** A game room whose GM knob points at `presetOwner`'s preset, with the nominee seated + nominated. */
  const seedHandoffGame = async (key: string, presetOwner: "host" | "nominee"): Promise<{ chatId: ChatId; presetId: PresetId }> => {
    const hostId = await seedUser(db, castId<Handle>(`${key}host`));
    const chatId = await seedChat(db, key, { id: mintTypeId(ID_PREFIX.chat) });
    await seedParticipant(db, { chatId, key: `${key}host`, userId: hostId, role: "host", joinSeq: 0 });
    await seedParticipant(db, { chatId, key: `${key}nominee`, userId: nominee, role: "member", joinSeq: 0 });
    const presetId = await seedPreset(`preset_${key}`, presetOwner === "host" ? hostId : nominee);
    await services.rpg.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
    await services.rpg.updateConfig({ principal: hostPrincipal(hostId), chatId, gmPresetId: presetId });
    await services.chat.nominateHostHandoff({ principal: hostPrincipal(hostId), chatId, userId: nominee });
    return { chatId, presetId };
  };

  const foreign = await seedHandoffGame("hoffforeign", "host");
  const owned = await seedHandoffGame("hoffowned", "nominee");

  await services.chat.acceptHostHandoff({ principal: hostPrincipal(nominee), chatId: foreign.chatId });
  await services.chat.acceptHostHandoff({ principal: hostPrincipal(nominee), chatId: owned.chatId });

  // The old host's private preset no longer rides the new host's turns — and the knob stops lying.
  expect((await findGameByChat(db, foreign.chatId))?.gmPresetId).toBeNull();
  expect((await services.rpg.getConfigView({ principal: hostPrincipal(nominee), chatId: foreign.chatId })).gmPresetId).toBeNull();
  // A knob the new host CAN read is untouched — the heal is conditional, never a blanket clear.
  expect((await findGameByChat(db, owned.chatId))?.gmPresetId).toBe(owned.presetId);
});
