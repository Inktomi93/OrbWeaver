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

import type { AssembleContext, ChatBusEvent, ChatContentPart } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { CustomParameters, NamesBehavior, PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRunChatTurnBridge } from "@orb/server/entry/compose";
import type { ChatRequest, ChatResult, OrSkinTierModels } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import { createAgentSdkBackend } from "@orb/server/infra/providers/backends/agent-sdk";
import { createCustomByoBackend } from "@orb/server/infra/providers/backends/custom-byo";
import type { OrClient } from "@orb/server/infra/providers/backends/openrouter";
import { createOpenRouterBackend } from "@orb/server/infra/providers/backends/openrouter";
import { createVllmChat } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe, vi } from "vitest";
import type { AssembledPrompt } from "../../../../packages/contracts/src/chat/index";
import type { TurnMessage, TurnRequest, TurnStreamChunk } from "../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../packages/server/src/domain/chat/engine/engine";
import { driveRound } from "../../../../packages/server/src/domain/chat/engine/round";
import { loadWitnessHorizons } from "../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../packages/server/src/domain/chat/memory/recall/recall";
import { loadCanonHistory } from "../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedUser, stubRunCompaction, TEST_CAPABILITY, testConnection } from "./_support";

const HOST = castId<UserId>("user_host");
const ARIA = castId<CharacterId>("character_aria");
const TEST_MODEL = castId<ModelId>("test-model");
// A leading "Author: " prefix on wire content (the `content` names-mode fingerprint). Bounded, no nesting.
const AUTHOR_PREFIX_RE = /^[^:\n]{1,40}: /u;

/** One captured provider wire body + the ASSEMBLE-layer TurnRequest that produced it. */
interface Captured {
  readonly turnRequest: TurnRequest;
  readonly wireBody: Record<string, unknown>;
}

/** The one-slot capture sink a surface writes the recorded wire body into. */
interface WireSink {
  body?: Record<string, unknown>;
}

/** An infra chat surface built over its REAL backend factory + a capture sink. The compose bridge calls this
 *  as its leaf `runChatTurn`; the surface records the wire body into the sink then (usually) rejects — the
 *  fidelity target is the CAPTURED body, not a reply. */
type SurfaceFactory = (sink: WireSink) => (req: ChatRequest) => Promise<ChatResult>;

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

/** The DEFAULT surface: the REAL vllm infra surface (buildBody + the TASK-24 capture sink → WIRE layer). The
 *  capturing client records the FINAL posted body (the fidelity target) into the sink. Non-rejecting — its
 *  canned SSE reply completes the turn so the DB layer persists. */
const vllmSurface: SurfaceFactory = (sink) =>
  createVllmChat({
    client: capturingClient(sink),
    now: () => 1000,
    captureWire: (entry) => {
      sink.body = entry.body;
    },
  });

/** A minimal REAL {@link OrSkinTierModels} map for the agent-sdk arm (the bridge derives it from live catalogs
 *  in prod; here a hermetic constant — the map's contents don't ride the captured SDK query body). */
const AGENT_SKIN_TIERS: OrSkinTierModels = { opus: "or/opus", sonnet: "or/sonnet", haiku: "or/haiku" };

/** The domain `runChatTurn` for the harness — the REAL compose bridge (`createRunChatTurnBridge`), NOT a
 *  facsimile: it runs the actual domain→infra `ChatRequest` map (the agent-sdk split, the passthrough spreads
 *  for customParameters/tools/toolChoice/responseFormat/cacheBreakpoint, the final-chunk economics) that every
 *  live turn flows through. The ONLY injected fakes are the two leaves: the surface (a REAL backend factory +
 *  capture sink + a minimal/throwing leaf, per {@link SurfaceFactory}) and the OR-skin tier map (a real map for
 *  the agent-sdk arm; unreached on chat-completions/responses where the bridge short-circuits it). A thin
 *  wrapper records the input `TurnRequest` for the ASSEMBLE-layer assertion — pure observation, prod underneath. */
function harnessRunChatTurn(surfaceFactory: SurfaceFactory, requests: TurnRequest[], wireSink: WireSink): ReturnType<typeof makeChatContext>["runChatTurn"] {
  const bridge = createRunChatTurnBridge({
    runChatTurn: surfaceFactory(wireSink),
    getOrSkinTierModels: () => Promise.resolve(AGENT_SKIN_TIERS),
  });
  return (req: TurnRequest): AsyncIterable<TurnStreamChunk> => {
    requests.push(req);
    return bridge(req);
  };
}

function realEngine(database: Db, surfaceFactory: SurfaceFactory, requests: TurnRequest[], wireSink: WireSink): ReturnType<typeof createTurnEngine> {
  const ctx = makeChatContext(database, {
    runChatTurn: harnessRunChatTurn(surfaceFactory, requests, wireSink),
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
  await seedUser(database, castId<Handle>("host"));
  await seedCharacter(database, HOST, "aria");
  const chatId = await seedChat(database, "c");
  await seedMessage(database, chatId, 1, { role: "user", authorUserId: HOST, content: "hello there" });
  await seedMessage(database, chatId, 2, { characterId: ARIA, content: "well met, traveler" });

  const assembleContext: AssembleContext = {
    character: { name: "Aria", description: "a bold knight" },
    promptConfig: opts.promptConfig,
    activePersona: { name: "Alex", description: "the user" },
    recentMessages: [],
  };
  const requests: TurnRequest[] = [];
  const wireSink: WireSink = {};
  const outcome = await driveRound({
    engine: realEngine(database, vllmSurface, requests, wireSink),
    base: { chatId, assembleContext, connection: testConnection(), triggeredBy: HOST, runAsUserId: HOST, kind: "auto", intent: opts.intent },
    group: DEFAULT_GROUP_CONFIG,
    speakers: [{ ref: { kind: "character", characterId: ARIA }, name: "Aria" }],
    groupCharacterId: null,
    castName: "Aria",
    narratorMemberNames: [],
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

// ── The WIRE-focused surfaces (openrouter / custom-byo / agent-sdk) ─────────────────────────────────────
// Each is the REAL backend factory + a `captureWire` that writes `entry.body` into the sink + a minimal leaf
// that lets the turn reach the capture then fail harmlessly (the caller catches; the assertion is on the
// captured body, never a reply). captureWire fires BEFORE the external call on every backend (commit 20ac4154).

/** A non-retryable reject — dodges the pre-commit retry backoff so the capture-then-fail turn is prompt. */
const rejectNonRetryable = (): Promise<never> => Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: "harness: capture-only" }));

/** OpenRouter: the SDK client's `chat.send` / `beta.responses.send` reject non-retryably; captureWire fires
 *  before `.send` and records the body reparsed through the SDK's `$outboundSchema` (the TRUE snake_case wire). */
const openRouterSurface: SurfaceFactory = (sink) => {
  // FABRICATION-OK: minimal SDK client — only chat.send/beta.responses.send are reached (reject AFTER capture); real backend builds the wire.
  const fakeOrClient = {
    chat: { send: rejectNonRetryable },
    beta: { responses: { send: rejectNonRetryable } },
    // fake reaches only chat.send / beta.responses.send (both reject AFTER capture); the REAL backend builds the wire.
  } as unknown as OrClient; // FABRICATION-OK: minimal SDK client double
  const backend = createOpenRouterBackend({
    now: () => 1000,
    getClient: () => fakeOrClient,
    captureWire: (entry) => {
      sink.body = entry.body;
    },
  });
  // biome-ignore lint/style/noNonNullAssertion: the openrouter backend always implements runChatTurn.
  return backend.runChatTurn!;
};

/** custom-byo: captureWire fires after buildBody, before the global `fetch`. The stubbed `fetch` rejects with a
 *  non-transient, status-less error → classified non-retryable → no retry. */
const customByoSurface: SurfaceFactory = (sink) => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("harness: capture-only")));
  const backend = createCustomByoBackend({
    now: () => 1000,
    captureWire: (entry) => {
      sink.body = entry.body;
    },
  });
  // biome-ignore lint/style/noNonNullAssertion: the custom-byo backend always implements runChatTurn.
  return backend.runChatTurn!;
};

/** agent-sdk: `captureAgentSdkWire` fires before `deps.query`, recording the SDK QUERY INPUT (prompt +
 *  systemPrompt + options). The fake `query` yields nothing (the turn completes with an empty reply — the
 *  captured input is the fidelity target); `refreshHostSubToken` is a hermetic no-op (no live OAuth). */
const agentSdkSurface: SurfaceFactory = (sink) => {
  // An empty async iterable (no frames) — capture already fired upstream, so the reducer returns an
  // empty-reply ChatResult. A hand-rolled iterator (not a generator) keeps `useYield` happy.
  const fakeQuery = (): AsyncIterable<never> => ({
    [Symbol.asyncIterator]: (): AsyncIterator<never> => ({
      next: (): Promise<IteratorResult<never>> => Promise.resolve({ done: true, value: undefined }),
    }),
  });
  const backend = createAgentSdkBackend({
    now: () => 1000,
    // FABRICATION-OK: the agent-sdk query seam; captureWire fires BEFORE query, so an empty-iterable fake suffices.
    query: fakeQuery as unknown as NonNullable<Parameters<typeof createAgentSdkBackend>[0]["query"]>,
    refreshHostSubToken: () => Promise.resolve(false),
    captureWire: (entry) => {
      sink.body = entry.body;
    },
  });
  // biome-ignore lint/style/noNonNullAssertion: the agent-sdk backend always implements runChatTurn.
  return backend.runChatTurn!;
};

/** A `custom_openai` {@link ResolvedCredential} double — only the fields the custom-byo runner reads. */
function customOpenAiCredential(): ResolvedCredential {
  // FABRICATION-OK: custom_openai credential double — the runner reads only source/baseUrl/includeBody/excludeBody.
  return {
    source: "custom_openai",
    baseUrl: "http://127.0.0.1:0",
    apiKey: null,
    headers: null,
    credentialId: castId("cred_custom"),
    contextWindow: undefined,
    model: undefined,
    includeBody: null,
    excludeBody: null,
    responseMap: null,
    // runner reads only source/baseUrl/includeBody/excludeBody off this credential.
  } as unknown as ResolvedCredential; // FABRICATION-OK: custom_openai credential double
}

/** A {@link ResolvedConnection} over {@link TEST_CAPABILITY} with an explicit source/api/credential. */
function connectionFor(source: string, api: ResolvedConnection["api"], credential?: ResolvedCredential): ResolvedConnection {
  const base = testConnection(source, api);
  return credential === undefined ? base : { ...base, credential };
}

/** Build a minimal WIRE-layer {@link TurnRequest} directly (bypassing assembly): the bridge reads only
 *  connection / prompt.static+dynamic / history / intent / customParameters / responseFormat / the flags. */
function wireTurnRequest(opts: {
  readonly connection: ResolvedConnection;
  readonly history: readonly TurnMessage[];
  readonly intent?: UserIntent;
  readonly customParameters?: CustomParameters;
  readonly responseFormat?: ResponseFormat;
  readonly agentTerminalTools?: TurnRequest["agentTerminalTools"];
}): TurnRequest {
  // FABRICATION-OK: minimal AssembledPrompt — the bridge reads only prompt.static + prompt.dynamic.
  const prompt = { static: "You are a test.", dynamic: "" } as unknown as AssembledPrompt;
  return {
    connection: opts.connection,
    chatId: castId<ChatId>("chat_wire"),
    prompt,
    history: opts.history,
    intent: opts.intent ?? {},
    ...(opts.customParameters !== undefined ? { customParameters: opts.customParameters } : {}),
    ...(opts.responseFormat !== undefined ? { responseFormat: opts.responseFormat } : {}),
    ...(opts.agentTerminalTools !== undefined ? { agentTerminalTools: opts.agentTerminalTools } : {}),
    kind: "auto",
    ownerConsented: false,
    cacheBreakpointFromEnd: null,
  };
}

/** Drive one WIRE-layer turn through the REAL compose bridge over `surfaceFactory`, capturing the wire body.
 *  The minimal leaf rejects after capture, so draining the bridge THROWS — swallowed; the sink is the payload. */
async function captureWireVia(surfaceFactory: SurfaceFactory, req: TurnRequest): Promise<Record<string, unknown>> {
  const sink: WireSink = {};
  const bridge = createRunChatTurnBridge({
    runChatTurn: surfaceFactory(sink),
    getOrSkinTierModels: () => Promise.resolve(AGENT_SKIN_TIERS),
  });
  try {
    for await (const _chunk of bridge(req)) {
      // drain to completion (or to the post-capture reject) — the wire body is captured before the leaf fails.
    }
  } catch {
    // the minimal leaf rejects after capture; the assertion is on the captured body, not on a reply.
  } finally {
    // custom-byo's surface stubs global `fetch` — restore it so no stub leaks into a sibling row.
    vi.unstubAllGlobals();
  }
  if (sink.body === undefined) {
    throw new Error("surface produced no captured wire body");
  }
  return sink.body;
}

/** A one-text-part history row (optionally name-stamped). */
function textRow(role: TurnMessage["role"], text: string, name?: string): TurnMessage {
  const content: ChatContentPart[] = [{ type: "text", text }];
  return name === undefined ? { role, content } : { role, content, name };
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

  // ── openrouter chat-completions ──────────────────────────────────────────────────────────────────────

  test("openrouter cc — customParameters are FULLY DROPPED at the wire (the lockdown proof)", async () => {
    // A preset customParameters carrying BOTH a colliding key (would hijack the owned model/messages) AND a
    // non-colliding key (`top_a`). OpenRouter's wire is official-only: the whole blob is dropped (D41), so
    // NEITHER survives — not just the collision.
    const customParameters: CustomParameters = {
      model: "HIJACK",
      messages: [{ role: "user", content: "INJECTED" }],
      // biome-ignore lint/style/useNamingConvention: a literal OpenRouter wire key (snake_case by protocol), not a JS identifier.
      top_a: 0.5,
    };
    const wire = await captureWireVia(
      openRouterSurface,
      wireTurnRequest({
        connection: connectionFor("openrouter", "chat-completions"),
        history: [textRow("user", "hello there")],
        intent: { maxOutputTokens: 64 },
        customParameters,
      }),
    );
    // The owned test model wins — NOT the hijack value.
    expect(wire["model"]).toBe(TEST_MODEL);
    expect(wire["model"]).not.toBe("HIJACK");
    // No injected messages: the sole wire message is the owned user turn, never the customParameters "INJECTED".
    const msgs = wireMessages(wire).filter((m) => m.role !== "system");
    expect(msgs.every((m) => m.content !== "INJECTED")).toBe(true);
    // The non-colliding key is ABSENT too — the blob is dropped whole, not merely collision-firewalled.
    expect(wire["top_a"]).toBeUndefined();
    // The body is the TRUE snake_case wire (SDK `$outboundSchema` reparse), not the camelCase SDK input:
    // OpenRouter's chat-completions cap field is `max_completion_tokens` (snake_case), never `maxCompletionTokens`.
    expect(wire["max_completion_tokens"]).toBe(64);
    expect(wire["maxCompletionTokens"]).toBeUndefined();
  });

  test("openrouter cc — a `name`-stamped row maps to the wire `name`; an inline-prefix row keeps it verbatim", async () => {
    const wire = await captureWireVia(
      openRouterSurface,
      wireTurnRequest({
        connection: connectionFor("openrouter", "chat-completions"),
        // A seeded assistant line (history present) + a name-stamped user row + an inline-"Author: " user row.
        history: [textRow("assistant", "well met, traveler"), textRow("user", "hail", "Alex"), textRow("user", "Bram: greetings")],
      }),
    );
    const msgs = wireMessages(wire).filter((m) => m.role !== "system");
    // completion-style: the `name` label rides the wire `name` field.
    expect(msgs.some((m) => m.name === "Alex")).toBe(true);
    // content-style: the inline "Author: " prefix survives verbatim on the wire content.
    expect(msgs.some((m) => AUTHOR_PREFIX_RE.test(m.content))).toBe(true);
    // The seeded history is present, not vacuous-empty.
    expect(msgs.some((m) => m.content.includes("well met, traveler"))).toBe(true);
  });

  // ── openrouter responses ─────────────────────────────────────────────────────────────────────────────

  test("openrouter responses — responseFormat lands on the responses wire `text.format`", async () => {
    const responseFormat: ResponseFormat = { name: "verdict", schema: { type: "object", properties: { ok: { type: "boolean" } } }, strict: true };
    const wire = await captureWireVia(
      openRouterSurface,
      wireTurnRequest({
        connection: connectionFor("openrouter", "responses"),
        history: [textRow("user", "decide")],
        responseFormat,
      }),
    );
    // The responses arm maps responseFormat onto `text.format` (json_schema) — snake_case wire via the reparse.
    const text = wire["text"] as { format?: { type?: string; name?: string } } | undefined;
    expect(text?.format?.type).toBe("json_schema");
    expect(text?.format?.name).toBe("verdict");
    // The responses wire keys the transcript on `input`, never chat-completions `messages`.
    expect(wire["input"]).toBeDefined();
    expect(wire["messages"]).toBeUndefined();
  });

  // ── custom-byo (BYOK) ────────────────────────────────────────────────────────────────────────────────

  test("custom-byo cc — customParameters WIN over the owned wire (the BYOK proof)", async () => {
    // The exact opposite of openrouter: BYOK = your endpoint, your risk — the preset's blob deep-merges over the
    // built body and WINS, including over `model`/`temperature`.
    const customParameters: CustomParameters = {
      model: "OVERRIDE",
      temperature: 0.99,
      // biome-ignore lint/style/useNamingConvention: a literal BYO endpoint wire key (user-defined, snake_case), not a JS identifier.
      custom_key: 1,
    };
    const wire = await captureWireVia(
      customByoSurface,
      wireTurnRequest({
        connection: connectionFor("custom_openai", "chat-completions", customOpenAiCredential()),
        history: [textRow("user", "hello there")],
        intent: { temperature: 0.1 },
        customParameters,
      }),
    );
    expect(wire["model"]).toBe("OVERRIDE");
    expect(wire["temperature"]).toBe(0.99);
    expect(wire["custom_key"]).toBe(1);
  });

  // ── agent-sdk ────────────────────────────────────────────────────────────────────────────────────────

  test("agent-sdk — history collapses into the prompt/seed; a name rides as a text prefix, NOT a `name` field", async () => {
    const wire = await captureWireVia(
      agentSdkSurface,
      wireTurnRequest({
        connection: connectionFor("max-pro-sub", "agent-sdk"),
        // An assistant line then a name-stamped trailing user row: split → seed = [.. assistant], prompt = the user tail.
        history: [textRow("assistant", "well met, traveler"), textRow("user", "how goes it?", "Alex")],
      }),
    );
    // The SDK query input carries a single `prompt` string — the trailing user row, NOT a messages[] array.
    expect(typeof wire["prompt"]).toBe("string");
    expect(wire["messages"]).toBeUndefined();
    // The participant name is stamped as a text prefix on the prompt (agent-sdk seed frames carry no `name` field).
    expect(wire["prompt"]).toContain("Alex: how goes it?");
    expect(wire["name"]).toBeUndefined();
  });

  test("agent-sdk — a folded turn's TERMINAL tools reach the SDK query input MOUNTED (D112 R1)", async () => {
    // The bridge maps the domain's `agentTerminalTools` onto the agent-sdk ChatRequest, and the backend mounts
    // them (its own MCP server + the deny hook) BEFORE the query — so the captured query input is the proof
    // that a folded turn on this wire actually carries its state channel instead of falling back to a round.
    const wire = await captureWireVia(
      agentSdkSurface,
      wireTurnRequest({
        connection: connectionFor("max-pro-sub", "agent-sdk"),
        history: [textRow("user", "she draws her blade")],
        agentTerminalTools: [
          { name: "update_scene", description: "record the scene", parameters: { type: "object", properties: { weather: { type: "string" } } } },
        ],
      }),
    );
    expect(wire["terminalTools"]).toEqual(["update_scene"]);
    expect(wire["terminalToolsMounted"]).toBe(true);
    // The turn ceiling carries the degrade budget (the deny hook ends it at depth 0; a ceiling of 1 would turn
    // a hook miss into `error_max_turns` and take the narrative with it).
    expect(wire["maxTurns"]).toBe(2);
  });

  test("agent-sdk — a turn with NO terminal tools reports an absent channel (byte-identical to pre-fold)", async () => {
    const wire = await captureWireVia(
      agentSdkSurface,
      wireTurnRequest({ connection: connectionFor("max-pro-sub", "agent-sdk"), history: [textRow("user", "hello")] }),
    );
    expect(wire["terminalTools"]).toBeNull();
    expect(wire["terminalToolsMounted"]).toBe(false);
    expect(wire["maxTurns"]).toBe(1);
  });
});
