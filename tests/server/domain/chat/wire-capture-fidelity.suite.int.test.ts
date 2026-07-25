// TASK-24 — the FOUR-LAYER round-trip fidelity harness (DETERMINISTIC, gates in the battery; the @live e2e
// leg is only a thin real-stack proof). Proves a preset/intent setting propagates TRUTHFULLY through every
// layer into the REAL provider wire body + the persisted canon. For each matrix row it drives ONE round
// through the REAL engine (assembly → SHAPE → the domain→infra ChatRequest map → the REAL vllm surface's
// buildBody → my TASK-24 capture sink) and asserts the setting's fingerprint at each of the four layers:
//   1. FE       — the input the harness built (namesBehavior on the preset / maxOutputTokens on the intent).
//   2. ASSEMBLE — the SHAPEd `TurnRequest.history` the engine produced (name-stamped, spliced) — the wire
//                 history's immediate source, captured off the domain→infra seam.
//   3. WIRE      — the captured openai-compat request body (`messages[]` with `name` fields / "Author: "
//                 inline prefixes / a literal `max_tokens`) — the REAL bytes buildBody produced, via the
//                 compose-injected `captureWire` sink (bypasses the WIRE_CAPTURE env — the drive-kit pattern).
//   4. DB        — the persisted canon rows (`chat.listMessages` equivalent — loadCanonHistory).
// CONSISTENCY ACROSS LAYERS is the deliverable; a divergence between any two is the bug class this catches.
//
// This uses NO live model + NO GPU + NO env flag: the vllm surface runs the REAL buildBody, but its
// VllmEngineClient is a fake that RECORDS the request body then returns a canned SSE stream (the request body
// is captured at dispatch BEFORE any response — a fidelity test needs the assembled wire, not a real reply).
// The capture sink is injected directly into the surface (compose's `captureWire` shape), the authoritative
// home the env comment names. names-behavior manifests in the STATELESS (openai-compat) `messages[]` wire —
// the agent-sdk path collapses history into a session prompt string — so the harness drives chat-completions.

import type { AssembleContext, ChatBusEvent } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { NamesBehavior, PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRunChatTurnBridge } from "@orb/server/entry/compose";
import { createVllmChat } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import type { TurnMessage, TurnRequest, TurnStreamChunk } from "../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../packages/server/src/domain/chat/engine/engine";
import { driveRound } from "../../../../packages/server/src/domain/chat/engine/round";
import { loadWitnessHorizons } from "../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../packages/server/src/domain/chat/memory/recall/recall";
import { loadCanonHistory } from "../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedUser, stubRunCompaction, testConnection } from "./_support";

const HOST = castId<UserId>("user_host");
const ARIA = castId<CharacterId>("character_aria");
// A leading "Author: " prefix on wire content (the `content` names-mode fingerprint). Bounded, no nesting.
const AUTHOR_PREFIX_RE = /^[^:\n]{1,40}: /u;

/** One captured provider wire body + the ASSEMBLE-layer TurnRequest that produced it. */
interface Captured {
  readonly turnRequest: TurnRequest;
  readonly wireBody: Record<string, unknown>;
}

/** The wire `messages[]` array (openai-compat), typed to the fields the harness reads. */
interface WireMessage {
  readonly role: string;
  readonly content: string;
  readonly name?: string;
}
function wireMessages(body: Record<string, unknown>): readonly WireMessage[] {
  return (body["messages"] as readonly WireMessage[] | undefined) ?? [];
}

/** A fake VllmEngineClient that RECORDS the request body (the WIRE layer) into `sink`, then returns a canned
 *  one-token SSE reply so the turn completes + persists. The request body is exactly what the REAL buildBody
 *  produced — the fidelity target. */
function capturingClient(sink: { body?: Record<string, unknown> }): VllmEngineClient {
  const canned = 'data: {"choices":[{"delta":{"content":"ok"}},{"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}\ndata: [DONE]\n';
  return {
    enginePost: (): Promise<never> => Promise.reject(new Error("chat must stream")),
    engineStream: (_lane, _path, body): Promise<ReadableStream<Uint8Array>> => {
      sink.body = body as Record<string, unknown>;
      return Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(canned));
            controller.close();
          },
        }),
      );
    },
    baseUrl: () => "http://127.0.0.1:0",
  };
}

/** The domain `runChatTurn` for the harness — the REAL compose bridge (`createRunChatTurnBridge`), NOT a
 *  facsimile: it runs the actual domain→infra `ChatRequest` map (the agent-sdk split, the passthrough spreads
 *  for customParameters/tools/toolChoice/responseFormat/cacheBreakpoint, the final-chunk economics) that every
 *  live turn flows through. The ONLY injected fakes are the two leaves: the infra vllm surface's engine client
 *  (a canned SSE reply — no GPU) and the OR-skin tier map (unreached here; the harness drives chat-completions,
 *  where the bridge short-circuits `getOrSkinTierModels`). A thin wrapper records the input `TurnRequest` for
 *  the ASSEMBLE-layer assertion — pure observation, the code path underneath is prod. */
function harnessRunChatTurn(requests: TurnRequest[], wireSink: { body?: Record<string, unknown> }): ReturnType<typeof makeChatContext>["runChatTurn"] {
  // The REAL leaf infra surface: buildBody + my TASK-24 capture sink → WIRE layer. The capturing client
  // records the FINAL posted body (the fidelity target) into `wireSink`.
  const surface = createVllmChat({
    client: capturingClient(wireSink),
    now: () => 1000,
    captureWire: (entry) => {
      wireSink.body = entry.body;
    },
  });
  const bridge = createRunChatTurnBridge({
    runChatTurn: surface,
    getOrSkinTierModels: () => Promise.reject(new Error("agent-sdk arm is not driven by this harness")),
  });
  return (req: TurnRequest): AsyncIterable<TurnStreamChunk> => {
    requests.push(req);
    return bridge(req);
  };
}

function realEngine(database: Db, requests: TurnRequest[], wireSink: { body?: Record<string, unknown> }): ReturnType<typeof createTurnEngine> {
  const ctx = makeChatContext(database, {
    runChatTurn: harnessRunChatTurn(requests, wireSink),
    applyStatsDelta: (): void => undefined,
  });
  return createTurnEngine(ctx, {
    emit: (_e: ChatBusEvent): Promise<void> => Promise.resolve(),
    debitBudget: (): Promise<void> => Promise.resolve(),
    resolveTurnPolicy: async () => ({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "tester",
    lockTtlMs: 1000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
    runCompaction: stubRunCompaction,
  });
}

/** Seed a 2-author chat: a user turn + an Aria turn (so names-behavior has an assistant-authored row to
 *  stamp), then drive one round with the given preset config + intent. Returns all four layers. */
async function driveRow(opts: {
  promptConfig: PromptConfig;
  intent: TurnRequest["intent"];
}): Promise<Captured & { canon: readonly { role: string; content: string; model: string | null }[] }> {
  const database = await freshDb();
  await seedUser(database, "host");
  await seedCharacter(database, HOST, "aria");
  const chatId = await seedChat(database, "c");
  await seedMessage(database, chatId, 1, { role: "user", authorUserId: HOST, content: "hello there" });
  await seedMessage(database, chatId, 2, { characterId: ARIA, content: "well met, traveler" });

  const assembleContext: AssembleContext = {
    character: { name: "Aria", description: "a bold knight" },
    promptConfig: opts.promptConfig,
    activePersona: { name: "Nate", description: "the user" },
    recentMessages: [],
  };
  const requests: TurnRequest[] = [];
  const wireSink: { body?: Record<string, unknown> } = {};
  const outcome = await driveRound({
    engine: realEngine(database, requests, wireSink),
    base: { chatId, assembleContext, connection: testConnection(), triggeredBy: HOST, runAsUserId: HOST, kind: "auto", intent: opts.intent },
    group: DEFAULT_GROUP_CONFIG,
    speakers: [{ ref: { kind: "character", characterId: ARIA }, name: "Aria" }],
    groupCharacterId: null,
    castName: "Aria",
  });
  expect(outcome.aborted).toBe(false);
  const turnRequest = requests[0];
  const wireBody = wireSink.body;
  if (turnRequest === undefined || wireBody === undefined) {
    throw new Error("harness produced no TurnRequest / wire body");
  }
  const canon = (await loadCanonHistory(database, chatId)).map((r) => ({ role: r.role, content: r.content, model: r.model }));
  return { turnRequest, wireBody, canon };
}

function withNames(mode: NamesBehavior): PromptConfig {
  return { ...DEFAULT_PROMPT_CONFIG, namesBehavior: mode };
}

/** The name-stamp fingerprint of the ASSEMBLE layer (the SHAPEd history) — does any row carry a `name` field
 *  or an inline "Author: " prefix? Reads the domain TurnMessage content parts. */
function assembleHasNameField(history: readonly TurnMessage[]): boolean {
  return history.some((m) => (m as { name?: string }).name !== undefined);
}
function assembleContentText(history: readonly TurnMessage[]): string[] {
  return history.map((m) => m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));
}

describe("TASK-24 four-layer round-trip fidelity (deterministic, real buildBody + capture seam)", () => {
  test("names 'completion' — the `name` field agrees across ASSEMBLE, WIRE; DB persists the reply", async () => {
    const config = withNames("completion");
    const { turnRequest, wireBody, canon } = await driveRow({ promptConfig: config, intent: {} });

    // FE — the harness built completion mode on the preset (the input under test).
    expect(config.namesBehavior).toBe("completion");
    // ASSEMBLE — the SHAPEd history carries a `name` field (the completion-mode name stamp).
    expect(assembleHasNameField(turnRequest.history)).toBe(true);
    // WIRE — a non-system wire message carries a `name` field; NO inline "Author: " prefix.
    const msgs = wireMessages(wireBody).filter((m) => m.role !== "system");
    expect(msgs.some((m) => m.name !== undefined && m.name.length > 0)).toBe(true);
    expect(msgs.every((m) => !AUTHOR_PREFIX_RE.test(m.content))).toBe(true);
    // DB — the round persisted a new assistant row with the connection model.
    expect(canon.some((r) => r.role === "assistant" && r.model !== null)).toBe(true);
  });

  test("names 'content' — an inline 'Author: ' prefix agrees across ASSEMBLE + WIRE; no `name` field", async () => {
    const { turnRequest, wireBody } = await driveRow({ promptConfig: withNames("content"), intent: {} });

    // ASSEMBLE — a shaped row's content is prefixed "<Author>: …".
    expect(assembleContentText(turnRequest.history).some((t) => AUTHOR_PREFIX_RE.test(t))).toBe(true);
    // WIRE — the prefix is on a wire message content, and NO message carries a `name` field.
    const msgs = wireMessages(wireBody).filter((m) => m.role !== "system");
    expect(msgs.some((m) => AUTHOR_PREFIX_RE.test(m.content))).toBe(true);
    expect(msgs.every((m) => m.name === undefined)).toBe(true);
  });

  test("names 'default' (solo) — NEITHER a `name` field NOR an inline prefix in the wire (the null fingerprint)", async () => {
    const { wireBody } = await driveRow({ promptConfig: withNames("default"), intent: {} });
    const msgs = wireMessages(wireBody).filter((m) => m.role !== "system");
    // default: a solo user turn (author == persona) and a solo assistant turn get NO stamp.
    expect(msgs.every((m) => m.name === undefined)).toBe(true);
    expect(msgs.every((m) => !AUTHOR_PREFIX_RE.test(m.content))).toBe(true);
  });

  test("caps maxOutputTokens — the per-send intent flows to the wire `max_tokens` (FE → WIRE agreement)", async () => {
    const cap = 64;
    const { turnRequest, wireBody } = await driveRow({ promptConfig: DEFAULT_PROMPT_CONFIG, intent: { maxOutputTokens: cap } });
    // FE — the intent under test.
    expect(turnRequest.intent.maxOutputTokens).toBe(cap);
    // WIRE — the literal openai-compat max_tokens equals the cap.
    expect(wireBody["max_tokens"]).toBe(cap);
  });

  test("the four layers agree on the seeded history content (the consistency isn't vacuous-empty)", async () => {
    const { turnRequest, wireBody, canon } = await driveRow({ promptConfig: withNames("content"), intent: {} });
    // ASSEMBLE + WIRE both carry the seeded Aria line; DB still holds it.
    const wireText = wireMessages(wireBody)
      .map((m) => m.content)
      .join("\n");
    expect(assembleContentText(turnRequest.history).join("\n")).toContain("well met, traveler");
    expect(wireText).toContain("well met, traveler");
    expect(canon.some((r) => r.content.includes("well met, traveler"))).toBe(true);
  });
});
