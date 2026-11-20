// The composed RPG state round on the SHIPPED DeepSeek row: a real `deepseek` provider connection (no declared
// override — the curated row plus the banked live `/v1/models` fold is the capability), the cheap round riding
// production's vehicle planner, and genuine DeepSeek reply bytes at the fetch seam. Rebuilds the restoration
// register's row-76 "composed planner" remainders on a row shape no existing case covers: no structured-output
// write path, no honoured forced choice, and a plain tool round that rides thinking-on because the row's
// requiresReasoningOff gates only the structured plan's vehicles (proved at the wire: effort `high` rides).
// Reference: legacy `server/entry/compose/rpg-state-round-structured.int.test.ts` (0511), rebuilt for today's
// composed root per item 3571. The folded-mode pair covers the SHIPPED delivery default (D112 mount + the
// announced `no-terminal-calls` escalation), which the live vendor walk exercised on 2026-11-17.
// @subject packages/server/src/domain/rpg/tools/rounds/tool-round.ts
// @subject packages/server/src/domain/rpg/substrate/readonly-axis.ts

import { promises as dnsPromises } from "node:dns";
import process from "node:process";
import type { ConnectionApi } from "@orb/contracts/inference";
import { RPG_LITE_TOOL_NAMES, RPG_NO_CHANGES_TOOL, RPG_TOOL_ROUND_TOOL_NAMES } from "@orb/contracts/rpg";
import { jsonValueSchema } from "@orb/kit/json";
import { appendedBy, finiteReplies } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  SECRET_BOX_TEST_KEY,
} from "@orb/testkit/node/composed";
import type { ResponsesReply } from "@orb/testkit/node/helpers";
import { openAiResponsesServer, terminalSseLine } from "@orb/testkit/node/helpers";
import { RPG_STATE_CHANGES_FIELD } from "#contracts/rpg/structured-round.ts";
import type { CoreWireReply } from "../../chat/engine/core-physical.ts";
import { CORE_ROOM_GROUP, coreFrame, coreProse, coreSse } from "../../chat/engine/core-physical.ts";

// biome-ignore lint/style/noProcessEnv: a live provider key the person running the check exports, not application configuration.
const PROBE_KEY = process.env["DEEPSEEK_PROBE_KEY"];
const DEEPSEEK_ORIGIN = "https://api.deepseek.com";
const DEEPSEEK_ADDRESS = "93.184.215.14";
const DEEPSEEK_PROVIDER = "deepseek";
const DEEPSEEK_MODEL = "deepseek-flash";
const SCENE_TOOL = RPG_LITE_TOOL_NAMES[2];

/** The live `GET /v1/models` body banked 2026-11-17 — the advertised tier the reader folds from the real list. */
const BANKED_LISTING = {
  data: [
    {
      id: "deepseek-flash",
      object: "model",
      ["owned_by"]: "deepseek",
      name: "DeepSeek-V4.1-Flash",
      ["context_window"]: 1_048_576,
      ["max_output_tokens"]: 393_216,
      ["input_modalities"]: ["text", "image"],
      ["output_modalities"]: ["text"],
      effort: { ["supported_levels"]: ["low", "high", "max"], ["default_level"]: "high" },
      ["api_capabilities"]: { ["anthropic_messages"]: { ["system_prompt_update"]: "in-history", ["tool_update"]: "addition-only" } },
    },
    {
      id: "deepseek-v4-pro",
      object: "model",
      ["owned_by"]: "deepseek",
      name: "DeepSeek-V4.1-Pro",
      ["context_window"]: 1_048_576,
      ["max_output_tokens"]: 393_216,
      ["input_modalities"]: ["text"],
      ["output_modalities"]: ["text"],
      effort: { ["supported_levels"]: ["low", "high", "max"], ["default_level"]: "high" },
      ["api_capabilities"]: { ["anthropic_messages"]: { ["system_prompt_update"]: "in-history", ["tool_update"]: "addition-only" } },
    },
  ],
};

/** One silent-round answer: a content frame and the shared terminal line (no tool calls), streamed the way
 *  the vendor streams. Composed through the testkit terminal so the fixture cannot go terminal-less. */
function deepseekReply(content: string): CoreWireReply {
  return () => coreSse([coreFrame({ choices: [{ delta: { content } }] }), terminalSseLine({ usage: { promptTokens: 900, completionTokens: 20 } })]);
}

/** One round answer: the tool-call delta exactly as the vendor streams it (index-keyed accumulation), prose
 *  alongside or absent, closed by the shared `tool_calls` terminal. */
function deepseekToolCallReply(calls: readonly string[], prose: string | null): CoreWireReply {
  return () =>
    coreSse([
      coreFrame({
        choices: [
          {
            delta: {
              ...(prose === null ? {} : { content: prose }),
              ["tool_calls"]: calls.map((name, index) => ({
                index,
                id: `call_${String(index)}`,
                type: "function",
                function: { name, arguments: name === SCENE_TOOL ? JSON.stringify({ location: "The flooded undercroft" }) : "{}" },
              })),
            },
          },
        ],
      }),
      terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 1200, completionTokens: 40 } }),
    ]);
}

/** One `/responses` protocol reply: streamed through the testkit's responses door, so the frame sequence
 *  is the SDK's own modeled spelling and cannot drift from the chunk union that parses it. */
function responsesReply(reply: ResponsesReply): CoreWireReply {
  return async (request) => {
    using server = openAiResponsesServer([], () => reply);
    return await server.execute(request);
  };
}

interface DeepseekRoom extends AsyncDisposable {
  readonly root: Awaited<ReturnType<typeof createChatRoot>>["root"];
  readonly owner: Awaited<ReturnType<typeof createChatRoot>>["owner"];
  readonly chatId: Awaited<ReturnType<typeof createChatRoot>>["chatId"];
  /** Every DeepSeek chat-completion POST, oldest first; read only bracketed by the act that sent it. */
  readonly calls: readonly Request[];
}

/** The real graph with the real DeepSeek row dialed at the fetch seam: the listing answers from the banked
 *  bytes, the provider POSTs spend the finite plan on the connection's own protocol — a chat-completions
 *  plan replies with chat SSE, a responses plan with responses SSE. The narrative and the round ride the
 *  same api; the plan's order is the turn's order. */
async function deepseekRoom(
  replies: readonly CoreWireReply[],
  vehicle: "tools" | "structured",
  live: boolean,
  options: { readonly mode?: "cheap" | "folded"; readonly api?: Exclude<ConnectionApi, "auto"> } = {},
): Promise<DeepseekRoom> {
  const { mode = "cheap", api = "chat-completions" } = options;
  await using construction = new AsyncDisposableStack();
  const nextReply = construction.use(finiteReplies("deepseek round", replies)).take;
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "No unplanned foreground reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const deepseekCalls: Request[] = [];
  const room = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      group: CORE_ROOM_GROUP,
      // The sealed-credential write path needs the secret box; the harness default (null) boots credentials off.
      server: {
        rpgTrace: true,
        secretBoxKey: SECRET_BOX_TEST_KEY,
        // The vendor host is external, so the SSRF-safe dial asks the resolver seam; the corpus endpoint is
        // loopback and never reaches it. Scripted mode pins a banked address (nothing connects); live mode
        // must resolve REAL — the sandboxed connector pins the fetch to whatever the seam returns, and the
        // banked example.com address black-holed the forwarded round (600s stall; curl of the same body
        // returned in 3.7s, measured 2026-11-17).
        networkExecution: {
          resolver: (hostname: string): Promise<string[]> => {
            if (hostname !== "api.deepseek.com") {
              return Promise.reject(new Error(`unscripted address: ${hostname}`));
            }
            return live
              ? dnsPromises.lookup("api.deepseek.com", { all: true }).then((rows) => rows.map((row) => row.address))
              : Promise.resolve([DEEPSEEK_ADDRESS]);
          },
        },
      },
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.origin !== DEEPSEEK_ORIGIN) {
          return await corpus.execute(request);
        }
        if (request.method === "GET" && url.pathname === "/v1/models") {
          return Response.json(BANKED_LISTING);
        }
        if (live && request.method === "POST" && url.pathname.endsWith("/chat/completions")) {
          // The capstone spends ONLY on the rounds: a tool-carrying dial forwards verbatim to the real API
          // (the connection already carries the real sealed key); the narratives ride the finite plan, so
          // the round's input prompt is deterministic and the spend is exactly the rounds.
          const body: unknown = await request.clone().json();
          const toolCarrying = body !== null && typeof body === "object" && !Array.isArray(body) && "tools" in body;
          if (toolCarrying) {
            deepseekCalls.push(request.clone());
            return await fetch(request.clone());
          }
        }
        if (request.method === "POST") {
          deepseekCalls.push(request.clone());
          return await nextReply()(request);
        }
        throw new Error(`unscripted deepseek request: ${request.method} ${url.pathname}`);
      },
    }),
  );
  const credential = await room.root.services.credentials.add({
    principal: room.owner,
    provider: DEEPSEEK_PROVIDER,
    key: live && PROBE_KEY !== undefined ? PROBE_KEY : "sk-composed-probe-key",
  });
  const connection = await room.root.services.connection.create({
    principal: room.owner,
    providerId: DEEPSEEK_PROVIDER,
    credentialId: credential.id,
    baseUrl: null,
    model: DEEPSEEK_MODEL,
    api,
  });
  await room.root.services.connection.setBinding({ principal: room.owner, task: "chat", connectionId: connection.id });
  await room.root.services.rpg.createGame({ principal: room.owner, chatId: room.chatId, mode: "lite" });
  await room.root.services.rpg.updateConfig({ principal: room.owner, chatId: room.chatId, extractionMode: mode, patch: { stateCaptureVehicle: vehicle } });
  const lifetime = construction.move();
  return {
    root: room.root,
    owner: room.owner,
    chatId: room.chatId,
    calls: deepseekCalls,
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

/** The recorded DeepSeek bodies in dial order: what the round actually sent, oldest first. */
async function bodiesOf(requests: readonly Request[]): Promise<readonly Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const request of requests) {
    const body = jsonValueSchema.parse(await request.json());
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("a DeepSeek dial carried a non-object body");
    }
    out.push(body);
  }
  return out;
}

/** The state tools actually on the wire: name, strict flag and parameters-type, read off the round body. */
function wireToolSurface(round: Record<string, unknown>): { readonly name: string; readonly strict: unknown; readonly paramType: unknown }[] {
  const wire = jsonValueSchema.parse(round["tools"]);
  if (!Array.isArray(wire)) {
    throw new Error("the state round dial carried no tools array");
  }
  const out: { readonly name: string; readonly strict: unknown; readonly paramType: unknown }[] = [];
  for (const entry of wire) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("a tools-array entry was not an object");
    }
    const fn = entry["function"];
    if (fn === null || typeof fn !== "object" || Array.isArray(fn)) {
      throw new Error("a tools-array entry carried no function object");
    }
    const name = fn["name"];
    if (typeof name !== "string") {
      throw new Error("a wire tool carried no name");
    }
    const parameters = fn["parameters"];
    const paramType = parameters !== null && typeof parameters === "object" && !Array.isArray(parameters) ? parameters["type"] : "missing";
    out.push({ name, strict: fn["strict"], paramType });
  }
  return out;
}

/** Every human-readable string a view holds (at least four characters), for diffing what a round actually wrote. */
function stringLeaves(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.length >= 4) {
      into.push(value);
    }
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      stringLeaves(item, into);
    }
    return into;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) {
      stringLeaves(item, into);
    }
  }
  return into;
}

/** Generate with the caller as principal; the params every turn in this file passes. */
function turnParams(h: DeepseekRoom): Parameters<DeepseekRoom["root"]["services"]["chat"]["generate"]>[0] {
  return { principal: h.owner, chatId: h.chatId };
}

/** One foreground turn plus its background round, bracketed: the returned entries are ONLY this turn's calls. */
async function runTurn(h: DeepseekRoom, params: Parameters<DeepseekRoom["root"]["services"]["chat"]["generate"]>[0]): Promise<readonly Request[]> {
  return (
    await appendedBy(h.calls, async (): Promise<void> => {
      await h.root.services.chat.generate(params);
      await h.root.settleBackground();
    })
  ).entries;
}

test("the cheap round on the DeepSeek row sends its tools un-forced with thinking riding the advertised default, and a silent round leaves the state untouched", async () => {
  await using h = await deepseekRoom(
    [(): Response => coreProse("Corvin's blade catches Mira's arm."), deepseekReply("The guards exchange glances, unsure what changed.")],
    "tools",
    false,
  );
  const params = turnParams(h);
  const turn = await runTurn(h, params);
  expect(turn).toHaveLength(2);
  const bodies = await bodiesOf(turn);
  const narrative = bodies[0];
  const round = bodies[1];
  if (narrative === undefined || round === undefined) {
    throw new Error("the narrative or the state round never dialed the provider");
  }
  // Positive control beside every round-wire absence: the narrative is the toolless dial.
  expect(narrative["tools"]).toBeUndefined();
  // The row claims no forced choice, so the round's `required` must NOT ride the wire as forced.
  // The round sends un-forced with thinking ON: `requiresReasoningOff` gates only the STRUCTURED plan's
  // vehicles (structured/plan.ts:195) and the vendor accepts tools+thinking (measured live 2026-11-16). The
  // pinned `high` is the effort-default fold reaching the wire — the banked listing's `default_level` wins
  // and this row's curated `reasoning.defaultEffort` is the fallback when the list states none; flipping
  // each source in turn moved the wire and the assertion caught it (red-proofs 2026-11-17).
  expect(round["tool_choice"]).toBe("auto");
  // FULL SURFACE: the round carries EVERY production state tool, each with its whole schema (the ref enums
  // and the EXAMPLES inside the descriptions ride) and the strict flag the row's plan keeps true — one bad
  // schema anywhere shows up here as a missing or malformed entry.
  const surface = wireToolSurface(round);
  // The surface is the production state-tool list MINUS what this game's shape cannot see: `roll_dice`
  // never rides a state round (zero-state — contracts/rpg/extraction.ts) and `set_tracker` binds only
  // unlocked GAME trackers, which a fresh lite game has none of.
  expect(surface.map((tool) => tool.name).toSorted()).toStrictEqual(RPG_TOOL_ROUND_TOOL_NAMES.filter((name) => name !== "set_tracker").toSorted());
  for (const tool of surface) {
    expect(tool.paramType).toBe("object");
    expect(tool.strict).toBe(true);
  }
  expect(round["reasoning_effort"]).toBe("high");
  expect(round["thinking"]).toBeUndefined();

  const before = await h.root.services.rpg.getTrackerView(params);
  expect(JSON.stringify(before.actors)).not.toContain("flooded undercroft");
  const trace = (h.root.app.rpgTrace?.recent({ chatId: h.chatId }) ?? []).map(({ event }) => event);
  expect(trace).toContainEqual(expect.objectContaining({ phase: "tool", calls: [] }));
});

test("the round's real tool-call answer writes through the fold, and the next round dials with the written state in its prompt", async () => {
  await using h = await deepseekRoom(
    [
      (): Response => coreProse("Corvin takes the rusted sword from the rack."),
      deepseekToolCallReply([SCENE_TOOL], null),
      (): Response => coreProse("Rats scatter before the drawn blade."),
      deepseekToolCallReply([RPG_NO_CHANGES_TOOL], null),
    ],
    "tools",
    false,
  );
  const params = turnParams(h);
  const first = await runTurn(h, params);
  expect(first).toHaveLength(2);
  const view = await h.root.services.rpg.getTrackerView(params);
  expect(JSON.stringify(view)).toContain("The flooded undercroft");

  // Turn two: the second round's prompt must carry the state the first one wrote — the replay leg of the
  // register's composed-planner case, pinned on what the REQUEST says, not on what the model chose to answer.
  const second = await runTurn(h, params);
  expect(second).toHaveLength(2);
  const bodies = await bodiesOf(second);
  expect(bodies[0]?.["tools"]).toBeUndefined();
  const secondRound = bodies[1];
  if (secondRound === undefined) {
    throw new Error("the second turn's state round never dialed the provider");
  }
  expect(JSON.stringify(secondRound)).toContain("The flooded undercroft");
});

test("a game that asks for the structured vehicle on a row without a structured-output writer degrades to the tool round and still lands state", async () => {
  await using h = await deepseekRoom(
    [(): Response => coreProse("Corvin's blade catches Mira's arm."), deepseekToolCallReply([SCENE_TOOL], "I note the changes.")],
    "structured",
    false,
  );
  const params = turnParams(h);
  const turn = await runTurn(h, params);
  expect(turn).toHaveLength(2);
  const bodies = await bodiesOf(turn);
  expect(bodies[0]?.["tools"]).toBeUndefined();
  const round = bodies[1];
  if (round === undefined) {
    throw new Error("the state round never dialed the provider");
  }
  // The row's `output.structured` is false (the json_schema carrier 400s — curated 2026-11-16), so the
  // vehicle degrades to tools, NOT to a response_format the vendor refuses.
  expect(round["response_format"]).toBeUndefined();
  expect(Array.isArray(round["tools"])).toBe(true);
  const view = await h.root.services.rpg.getTrackerView(params);
  expect(JSON.stringify(view)).toContain("The flooded undercroft");
});

// The tool round on the responses arm: the round rides the connection's own api, so its tools go out in the
// Responses top-level shape (`{type:"function", name, parameters, strict}` — the SDK's `prepareFunctionTool`,
// no nested `function` object) and the answer comes back as `function_call` items, not chat deltas. This is
// the composed pair to the transport suite's fetch-seam proof: the vehicle planner, the mount and the state
// fold working TOGETHER on the protocol where the structured vehicle also exists.
test("the cheap round on the responses arm carries its tools in the top-level Responses shape and lands state through the function_call fold", async () => {
  await using h = await deepseekRoom(
    [
      responsesReply({ kind: "text", text: "Corvin's blade catches Mira's arm." }),
      responsesReply({ kind: "tool-call", name: SCENE_TOOL, arguments: JSON.stringify({ location: "The flooded undercroft" }) }),
    ],
    "tools",
    false,
    { api: "responses" },
  );
  const params = turnParams(h);
  const turn = await runTurn(h, params);
  expect(turn).toHaveLength(2);
  const bodies = await bodiesOf(turn);
  const narrative = bodies[0];
  const round = bodies[1];
  if (narrative === undefined || round === undefined) {
    throw new Error("the narrative or the state round never dialed the provider");
  }
  // The RESPONSES protocol on both dials (positive control: the narrative carries no tools), and the stateless pin.
  expect(Array.isArray(narrative["input"])).toBe(true);
  expect(narrative["tools"]).toBeUndefined();
  expect(Array.isArray(round["input"])).toBe(true);
  expect(round["messages"]).toBeUndefined();
  expect(round["store"]).toBe(false);
  // Un-forced like the chat arm: the row claims no honoured forced choice.
  expect(round["tool_choice"]).toBe("auto");
  // The Responses tool shape: name/parameters/strict on the entry itself, no nested `function` object.
  const wire = jsonValueSchema.parse(round["tools"]);
  if (!Array.isArray(wire)) {
    throw new Error("the responses round dial carried no tools array");
  }
  const surface: { readonly name: string; readonly strict: unknown }[] = [];
  for (const entry of wire) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("a responses tools-array entry was not an object");
    }
    expect(entry["function"]).toBeUndefined();
    const name = entry["name"];
    if (typeof name !== "string") {
      throw new Error("a responses wire tool carried no top-level name");
    }
    surface.push({ name, strict: entry["strict"] });
  }
  expect(surface.map((tool) => tool.name).toSorted()).toStrictEqual(RPG_TOOL_ROUND_TOOL_NAMES.filter((name) => name !== "set_tracker").toSorted());
  for (const tool of surface) {
    expect(tool.strict).toBe(true);
  }
  // The chat arm's effort-default fold reaches THIS wire too — as the `reasoning.effort` arm the SDK's own
  // catalog gate drops for off-catalog ids and the body seam writes back. Red-proof 2026-11-17: flipping the
  // deepseek row's effort spelling (`features.effort` in builtin-providers) removed the arm and this caught it.
  expect(round["reasoning"]).toEqual({ effort: "high" });
  const view = await h.root.services.rpg.getTrackerView(params);
  expect(JSON.stringify(view)).toContain("The flooded undercroft");
});

// The responses arm is the ONLY DeepSeek route with a native structured-output carrier (the chat route's
// json_schema carrier 400s — curated row and `deepseek-api-surface.md`), so this is the composed proof the
// structured vehicle SURVIVES planning instead of degrading: the api-scoped cell flips `output.structured`,
// the planner puts `response-format` first, the round dials `/v1/responses` with the strict projection of
// the union grammar in `text.format`, and the state lands from the decoded JSON with no tools array.
test("the structured vehicle on the responses arm rides the native json_schema carrier, not a degraded tool round, and lands state", async () => {
  await using h = await deepseekRoom(
    [
      responsesReply({ kind: "text", text: "Corvin's blade catches Mira's arm." }),
      responsesReply({
        kind: "text",
        text: JSON.stringify({ [RPG_STATE_CHANGES_FIELD]: [{ tool: SCENE_TOOL, args: { location: "The flooded undercroft" } }] }),
      }),
    ],
    "structured",
    false,
    { mode: "cheap", api: "responses" },
  );
  const params = turnParams(h);
  const turn = await runTurn(h, params);
  expect(turn).toHaveLength(2);
  const bodies = await bodiesOf(turn);
  const narrative = bodies[0];
  const round = bodies[1];
  if (narrative === undefined || round === undefined) {
    throw new Error("the narrative or the state round never dialed the provider");
  }
  // Both dials ride the RESPONSES protocol — the round rides the connection's own api, not the chat route.
  expect(Array.isArray(round["input"])).toBe(true);
  expect(round["messages"]).toBeUndefined();
  // The non-degraded vehicle: the native carrier rides, the degraded tool round does NOT. Positive control
  // beside both absences: the narrative is the formatless dial of the same protocol.
  expect(narrative["text"]).toBeUndefined();
  expect(round["tools"]).toBeUndefined();
  const text = jsonValueSchema.parse(round["text"]);
  if (text === null || typeof text !== "object" || Array.isArray(text)) {
    throw new Error("the structured round dialed without a text object");
  }
  const format = text["format"];
  if (format === null || typeof format !== "object" || Array.isArray(format)) {
    throw new Error("the structured round's text object carried no format");
  }
  expect(format["type"]).toBe("json_schema");
  expect(format["strict"]).toBe(true);
  const schema = JSON.stringify(format["schema"]);
  expect(schema).toContain(RPG_STATE_CHANGES_FIELD);
  expect(schema).toContain(SCENE_TOOL);
  // The stateless-send ruling rides the composed round too, and the `reasoning` arm is the side-generation
  // posture's floor (resolve-chat.ts postureIntent: an unchoosing side-gen turn runs EFFORT_OFF) spelled
  // through the body seam's re-injection — the vendor's `/responses` off-word, so the round pays no thinking.
  expect(round["store"]).toBe(false);
  expect(round["reasoning"]).toEqual({ effort: "none" });
  const view = await h.root.services.rpg.getTrackerView(params);
  expect(JSON.stringify(view)).toContain("The flooded undercroft");
});

// The SHIPPED delivery default on the responses arm: the absent `silencesProse` cell says the wire co-emits
// prose with tools, so the fold MOUNTS the state tools on the foreground dial, and a prose-only foreground
// is not trusted — the flush announces the escalation and the dedicated round lands the state. Both legs
// ride `/responses`. The mount decision (`coEmitsProseWithTools`) is a wire fact independent of the api, and
// the red-proof 2026-11-17 flipped it off (`silencesProse: true` on the row) and the foreground's mounted
// surface went missing here.
test("a folded game on the responses arm mounts the state tools on the foreground and escalates a prose-only beat to the dedicated round", async () => {
  await using h = await deepseekRoom(
    [
      responsesReply({ kind: "text", text: "Corvin takes the rusted sword from the rack." }),
      responsesReply({ kind: "tool-call", name: SCENE_TOOL, arguments: JSON.stringify({ location: "The flooded undercroft" }) }),
    ],
    "tools",
    false,
    { mode: "folded", api: "responses" },
  );
  const params = turnParams(h);
  const turn = await runTurn(h, params);
  expect(turn).toHaveLength(2);
  const bodies = await bodiesOf(turn);
  const foreground = bodies[0];
  const round = bodies[1];
  if (foreground === undefined || round === undefined) {
    throw new Error("the folded turn's foreground or fallback round never dialed the provider");
  }
  // The mount: the FOREGROUND dial on `/responses` itself carries the offered state surface, un-forced.
  expect(Array.isArray(foreground["input"])).toBe(true);
  expect(Array.isArray(foreground["tools"])).toBe(true);
  expect(foreground["tool_choice"]).toBe("auto");
  // The pair the chat arm measures: the foreground rides the chat preset's reasoning-off, the fallback
  // round the effort-default fold — both spelled as the `reasoning.effort` arm on this protocol.
  expect(foreground["reasoning"]).toEqual({ effort: "none" });
  expect(round["reasoning"]).toEqual({ effort: "high" });
  const trace = (h.root.app.rpgTrace?.recent({ chatId: h.chatId }) ?? []).map(({ event }) => event);
  expect(trace).toContainEqual(expect.objectContaining({ phase: "flush", path: "tool-round", fallbackReason: "no-terminal-calls" }));
  const view = await h.root.services.rpg.getTrackerView(params);
  expect(JSON.stringify(view)).toContain("The flooded undercroft");
});

// The SHIPPED delivery default (`extractionMode: "folded"`, D112): the row's absent `silencesProse` cell says
// the wire co-emits prose with tools (contracts/inference `coEmitsProseWithTools`), so the fold MOUNTS the
// state tools on the foreground dial instead of always paying a second call. The live vendor walk of this
// mode (2026-11-17) answered the mounted foreground prose-only, escalated through the announced
// `no-terminal-calls` fallback, and the round wrote a coherent scene — the pair below pins both the mount +
// escalation and the true fold on the scripted seam, one forward per dial.
test("a folded game mounts the state tools on the foreground, and a prose-only foreground escalates through the announced fallback to the dedicated round", async () => {
  await using h = await deepseekRoom(
    [(): Response => coreProse("Corvin takes the rusted sword from the rack."), deepseekToolCallReply([SCENE_TOOL], null)],
    "tools",
    false,
    { mode: "folded" },
  );
  const params = turnParams(h);
  const turn = await runTurn(h, params);
  expect(turn).toHaveLength(2);
  const bodies = await bodiesOf(turn);

  // The mount: the FOREGROUND dial itself carries the offered state surface — every round tool minus the
  // trackers a fresh lite game cannot see, exactly the round's visible set — offered, never forced.
  const foreground = bodies[0];
  const round = bodies[1];
  if (foreground === undefined || round === undefined) {
    throw new Error("the folded turn's foreground or fallback round never dialed the provider");
  }
  const mounted = wireToolSurface(foreground);
  expect(mounted.map((tool) => tool.name).toSorted()).toStrictEqual(RPG_TOOL_ROUND_TOOL_NAMES.filter((name) => name !== "set_tracker").toSorted());
  expect(foreground["tool_choice"]).toBe("auto");
  // The pair the live walk measured (2026-11-17): the foreground rides the chat preset's reasoning-off while
  // the fallback round rides the effort-default fold — if either source moves, this catches it.
  expect(foreground["reasoning_effort"]).toBe("none");
  expect(round["reasoning_effort"]).toBe("high");

  // A prose-only foreground is NOT trusted as a quiet beat: the flush ANNOUNCES the escalation, then the
  // dedicated round lands the state. The trace is the law here — a silent fallback would pass a view diff.
  const trace = (h.root.app.rpgTrace?.recent({ chatId: h.chatId }) ?? []).map(({ event }) => event);
  expect(trace).toContainEqual(expect.objectContaining({ phase: "flush", path: "tool-round", fallbackReason: "no-terminal-calls" }));
  expect(trace).toContainEqual(expect.objectContaining({ phase: "tool", calls: [expect.objectContaining({ name: SCENE_TOOL })] }));
  const view = await h.root.services.rpg.getTrackerView(params);
  expect(JSON.stringify(view)).toContain("The flooded undercroft");
});

test("a folded foreground that emits its own state calls folds them with NO second dial", async () => {
  await using h = await deepseekRoom([deepseekToolCallReply([SCENE_TOOL], "Corvin takes the rusted sword from the rack.")], "tools", false, { mode: "folded" });
  const params = turnParams(h);
  const turn = await runTurn(h, params);
  // The true fold: the beat's calls rode the foreground completion, so the room never pays the second dial.
  expect(turn).toHaveLength(1);
  const trace = (h.root.app.rpgTrace?.recent({ chatId: h.chatId }) ?? []).map(({ event }) => event);
  expect(trace).toContainEqual(expect.objectContaining({ phase: "flush", path: "folded", fallbackReason: null }));
  const view = await h.root.services.rpg.getTrackerView(params);
  expect(JSON.stringify(view)).toContain("The flooded undercroft");
});

test.skipIf(PROBE_KEY === undefined)(
  "a live DeepSeek round lands parseable calls across the full lite surface and the next round replays the written state",
  // A full RPG round is a multi-thousand-token tool-schema prompt into a thinking model, twice, and the
  // transport treats DeepSeek's queue 503s as retryable — the clock buys all of that (a 240s budget died
  // mid-retry 2026-11-17; the LiteRouter 60s precedent is a listing plus a short turn, a different animal).
  { tags: ["live"], timeout: 600_000 },
  async () => {
    // One dense beat: a wound, a party change, an item, coin, a scene name and a quest, so the real model
    // has the whole surface to choose from. The NARRATIVE is scripted — only the tool rounds dial the API.
    await using h = await deepseekRoom(
      [
        (): Response =>
          coreProse(
            "Corvin draws the rusted sword from the rack and slashes his palm; it bleeds freely. Mira steps in beside him and takes the lantern. From the sea chest they lift thirty gold and a wrapped vial of oil, which Corvin stows in his belt pouch. Tamsin stays at the door to keep watch. A carved stone names this cellar the Flooded Undercroft, and the promise is struck: clear it before the tide turns.",
          ),
        (): Response => coreProse("The party catches its breath at the head of the stair."),
      ],
      "tools",
      true,
    );
    const params = turnParams(h);
    const before = JSON.stringify(await h.root.services.rpg.getTrackerView(params));

    const first = await runTurn(h, params);
    expect(first).toHaveLength(2);

    // PARSEABLE is the bar the vendor can silently fail: garbage args flush as a failed round.
    const flushed = (h.root.app.rpgTrace?.recent({ chatId: h.chatId }) ?? []).map(({ event }) => event).filter((event) => "outcome" in event);
    expect(flushed).not.toContainEqual(expect.objectContaining({ outcome: "failed" }));

    // At least one real write landed on this dense beat — diffed off the view's own strings, whatever the
    // model chose to name them.
    const written = stringLeaves(await h.root.services.rpg.getTrackerView(params)).filter((value) => !before.includes(value));
    expect(written.length).toBeGreaterThan(0);

    // Replay leg: the second round must dial with what the first one wrote inside its prompt.
    const second = await runTurn(h, params);
    expect(second).toHaveLength(2);
    const secondRound = (await bodiesOf(second))[1];
    if (secondRound === undefined) {
      throw new Error("the second turn's state round never dialed the provider");
    }
    const roundPrompt = JSON.stringify(secondRound);
    expect(written.some((value) => roundPrompt.includes(value))).toBe(true);
  },
);
