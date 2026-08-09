// @live BACKEND ROUTE×SKIN MATRIX PROOF — real inference, opt-in (E2E_LIVE=1), mirroring the e2e `@live`
// convention (playwright.config.ts `e2eLive`): the default battery COLLECTS this file but every suite is
// skip-gated, so routine `pnpm test` spends zero model credits. Run with:
//   E2E_LIVE=1 npx vitest run --config vitest.config.ts tests/e2e/backend-matrix.live.int.test.ts
//
// Proves, per (route × skin), that TOOLS + STRUCTURED OUTPUT actually work end to end through OUR
// production dispatch (`createProviderExecutor` → firewall → deriveRunner → the sealed backend), not a
// facsimile. The FIVE valid cells:
//   1. agent-sdk × max-pro-sub       — the owner's Claude subscription (host OAuth).
//   2. agent-sdk × openrouter        — the OR Anthropic skin (key material: OPENROUTER_PROBE_KEY in the root .env).
//   3. chat-completions × vllm       — THE local wire (guided decoding + hermes parallel tools).
//   4. chat-completions × openrouter — the hosted OR array wire (the OR SDK client).
//   5. responses × openrouter        — the OpenAI Responses wire (OpenRouter-only by dispatch); its tool
//      finish signal is the function_call items themselves (the mapper fix this file live-proved).
// Each valid cell drives a real turn that MUST tool-call (asserted at the executed HANDLER / the surfaced
// tool_calls) and a real structured turn (asserted by PARSING the reply against the schema) — never just
// "didn't throw". The NOT-A-VALID-COMBO set (deriveRunner-throws pins) documents the retired/illegal routes,
// incl. `agent-sdk × vllm` (REMOVED 2026-07-27 by owner ruling — local vLLM is chat-completions-only; the
// loopback SDK skin hung the small model on real structured schemas while chat-completions handles all of
// it). Homed in tests/e2e/ (the non-mirror tree) because it proves a cross-package live path.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env as processEnv } from "node:process";
import type { ChatApi, ModelCapability } from "@orb/contracts/connection";
import { rpgExtractionSchema } from "@orb/contracts/rpg";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { env as orbEnv } from "@orb/server/foundation/env";
import type { AgentToolResult, ChatRequest } from "@orb/server/infra/providers";
import { createAgentToolServer, createBackendRegistry, createProviderExecutor, deriveRunner } from "@orb/server/infra/providers";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { makeModelCapability, makeOpenRouterCredential, makeResolvedCredential } from "../support/factories/resolved-connection.ts";
import { wireSchema } from "../support/wire-ready.ts";

const LIVE = processEnv["E2E_LIVE"] === "1";
const TURN_TIMEOUT_MS = 300_000;

// Probe-key convention: the runtime env may be unwired (`OPENROUTER_API_KEY` unset) while the key MATERIAL
// lives in the root `.env` as *_PROBE_KEY — the ambient env wins, the file is the fallback (never committed).
const OPENROUTER_PROBE_KEY = processEnv["OPENROUTER_PROBE_KEY"] ?? fromDotEnv("OPENROUTER_PROBE_KEY");

function fromDotEnv(name: string): string {
  try {
    const envFile = readFileSync(join(import.meta.dirname, "..", "..", ".env"), "utf8");
    const match = envFile.match(new RegExp(`^${name}=(.*)$`, "m"));
    return (match?.[1]?.trim() ?? "").replace(/^"|"$/g, "");
  } catch {
    return "";
  }
}

// ONE registry + executor for the whole file — the real production dispatch (real SDK query, real engine
// client). vllmDisabled:false ADOPTS the warm engines (never spawns here; the client just POSTs loopback).
const { backends } = createBackendRegistry({ now: () => Date.now(), vllmDisabled: false });
const executor = createProviderExecutor({ backends });

const CAPABILITY: ModelCapability = makeModelCapability({
  output: { maxTokens: { min: 1, max: 2048 }, structured: true },
  context: { window: 32_000 },
  tools: { parallel: true },
});

/** The dice tool every tools-cell mounts: the HANDLER is the proof point (a live invocation = the loop ran). */
function diceTool(invocations: Record<string, unknown>[]): ReturnType<typeof createAgentToolServer> {
  return createAgentToolServer({
    tools: [
      {
        name: "roll_dice",
        description: "Roll a die with the given number of sides. ALWAYS call this tool when asked to roll dice.",
        inputSchema: { sides: z.number() },
        handler: (args: Record<string, unknown>): Promise<AgentToolResult> => {
          invocations.push(args);
          return Promise.resolve({ content: [{ type: "text", text: JSON.stringify({ roll: 17 }) }] });
        },
      },
    ],
  });
}

const TOOL_PROMPT = "Roll a 20-sided die using the roll_dice tool, then state the exact number rolled.";
// Typed as the wire `schema` shape so `responseFormat.schema` assigns directly (no double-cast — the schema
// is real JSON Schema, not a fabricated typed value).
const STRUCTURED_SCHEMA = wireSchema({
  type: "object",
  properties: { mood: { type: "string" }, hp: { type: "number" } },
  required: ["mood", "hp"],
  additionalProperties: false,
});
const STRUCTURED_PROMPT = 'Report the character status: mood is "fierce" and hp is 42. Output only the structured object.';
const structuredZ = z.object({ mood: z.string(), hp: z.number() });

const OR_TIER_MODELS = {
  opus: "anthropic/claude-opus-4.8",
  sonnet: "anthropic/claude-sonnet-5",
  haiku: "anthropic/claude-haiku-4.5",
};

function agentReq(model: string, over: Partial<ChatRequest & { api: "agent-sdk" }>): ChatRequest {
  // FABRICATION-OK: a valid ChatRequest arm; the `as` is load-bearing only because the `...over` Partial spread over a discriminated union defeats `satisfies`.
  return {
    api: "agent-sdk",
    prompt: TOOL_PROMPT,
    model: castId<ModelId>(model),
    // Placeholder credential — every agent-sdk cell overrides it with its own skin (sub / OR); vllm is no
    // longer a valid agent-sdk source, so the default just satisfies the shape.
    credential: makeResolvedCredential("max-pro-sub"),
    capability: CAPABILITY,
    params: { maxOutputTokens: 1024 },
    systemPrompt: { static: "You are a precise game assistant.", dynamic: "" },
    orSkinTierModels: OR_TIER_MODELS,
    ownerConsented: true,
    ...over,
  } as ChatRequest;
}

interface MatrixCell {
  readonly name: string;
  readonly model: () => string;
  readonly credential: () => ChatRequest["credential"];
}

// The vLLM gen model the local engine serves (what production sends on the chat-completions vllm turn — the
// full slashed id; the engine also serves the slash-free alias). agent-sdk×vllm is NOT a valid combo (the
// loopback skin was retired 2026-07-27), so vLLM appears ONLY on the chat-completions cells below.
const VLLM_GEN_MODEL = orbEnv.VLLM_GEN_MODEL;

// The agent-sdk skins share ONE test body per axis — the cell rows differ only in model + credential. vLLM is
// ABSENT: it is chat-completions-only (owner ruling); a would-be agent-sdk×vllm turn is pinned in the
// not-a-valid-combo section (deriveRunner throws).
const AGENT_CELLS: readonly MatrixCell[] = [
  { name: "max-pro-sub (owner Claude subscription)", model: () => "claude-haiku-4-5", credential: () => makeResolvedCredential("max-pro-sub") },
  {
    name: "openrouter (OR Anthropic skin, OPENROUTER_PROBE_KEY)",
    model: () => "claude-haiku-4-5",
    credential: () => makeOpenRouterCredential({ apiKey: OPENROUTER_PROBE_KEY }),
  },
];

describe.skipIf(!LIVE)("@live agent-sdk skins — tools + structured output through the real dispatch", () => {
  for (const cell of AGENT_CELLS) {
    test(`${cell.name}: a real tool_use turn runs the in-process MCP handler and narrates the roll`, { timeout: TURN_TIMEOUT_MS }, async () => {
      const invocations: Record<string, unknown>[] = [];
      const result = await executor.runChatTurn(agentReq(cell.model(), { credential: cell.credential(), toolServer: diceTool(invocations), toolTurnLimit: 3 }));
      // The handler RAN (the SDK loop invoked our in-process MCP tool) and the reply narrates the result.
      expect(invocations.length).toBeGreaterThanOrEqual(1);
      expect(result.reply.length).toBeGreaterThan(0);
      expect(result.reply).toContain("17");
    });

    test(`${cell.name}: outputFormat json_schema yields a schema-conforming object`, { timeout: TURN_TIMEOUT_MS }, async () => {
      const result = await executor.runChatTurn(
        agentReq(cell.model(), {
          credential: cell.credential(),
          prompt: STRUCTURED_PROMPT,
          responseFormat: { name: "status", schema: STRUCTURED_SCHEMA },
        }),
      );
      const parsed = structuredZ.parse(JSON.parse(result.reply));
      expect(parsed.hp).toBe(42);
      expect(parsed.mood.toLowerCase()).toContain("fierce");
    });
  }
});

describe.skipIf(!LIVE)("@live chat-completions × vllm (OpenAI-compat surface)", () => {
  function ccReq(over: Partial<ChatRequest & { api: "chat-completions" }>): ChatRequest {
    // FABRICATION-OK: a valid ChatRequest arm; the `...over` Partial spread over a discriminated union defeats `satisfies`.
    return {
      api: "chat-completions",
      model: castId<ModelId>(VLLM_GEN_MODEL),
      credential: makeResolvedCredential("vllm"),
      capability: CAPABILITY,
      params: { maxOutputTokens: 1024 },
      systemPrompt: { static: "You are a precise game assistant.", dynamic: "" },
      ownerConsented: true,
      history: [{ role: "user", content: [{ type: "text", text: TOOL_PROMPT }] }],
      ...over,
    } as ChatRequest;
  }

  test("tools: the engine surfaces a real tool_calls request (finishReason tool)", { timeout: TURN_TIMEOUT_MS }, async () => {
    const result = await executor.runChatTurn(
      ccReq({
        tools: [
          {
            name: "roll_dice",
            description: "Roll a die with the given number of sides. ALWAYS call this tool when asked to roll dice.",
            parameters: { type: "object", properties: { sides: { type: "number" } }, required: ["sides"] },
          },
        ],
        toolChoice: { mode: "auto" },
      }),
    );
    expect(result.finishReason).toBe("tool");
    expect(result.toolCalls?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(result.toolCalls?.[0]?.name).toBe("roll_dice");
    expect(() => JSON.parse(result.toolCalls?.[0]?.arguments ?? "")).not.toThrow();
  });

  test("structured: response_format json_schema (guided decoding) yields a schema-conforming object", { timeout: TURN_TIMEOUT_MS }, async () => {
    const result = await executor.runChatTurn(
      ccReq({
        history: [{ role: "user", content: [{ type: "text", text: STRUCTURED_PROMPT }] }],
        responseFormat: { name: "status", schema: STRUCTURED_SCHEMA },
      }),
    );
    const parsed = structuredZ.parse(JSON.parse(result.reply));
    expect(parsed.hp).toBe(42);
    expect(parsed.mood.toLowerCase()).toContain("fierce");
  });
});

// ── The hosted OpenRouter ARRAY-WIRE routes (the OR SDK client, not the agent-sdk skin) ────────────────
// Route legality (deriveRunner): chat-completions serves {openrouter, vllm, custom_openai}; the `responses`
// api is OpenRouter-ONLY. The illegal (api × source) routes are pinned in the not-a-valid-combo section
// (deriveRunner throws). One VALID cell is deliberately not LIVE-driven: `chat-completions × custom_openai`
// — a BYO endpoint with no live server to hit (its translator is the same raw openai-compat body builder
// the vllm cell exercises), so a live cell would add nothing the vllm cell doesn't already prove.
const OR_MODEL = "anthropic/claude-haiku-4.5";

// The OR array-wire apis (`ChatApi` minus the agent-sdk arm) — derived, never re-spelled.
type OrArrayApi = Exclude<ChatApi, "agent-sdk">;

function orArrayReq(api: OrArrayApi, over: Partial<ChatRequest & { api: OrArrayApi }>): ChatRequest {
  // FABRICATION-OK: a valid ChatRequest arm; the `...over` Partial spread over a discriminated union defeats `satisfies`.
  return {
    api,
    model: castId<ModelId>(OR_MODEL),
    credential: makeOpenRouterCredential({ apiKey: OPENROUTER_PROBE_KEY }),
    capability: CAPABILITY,
    params: { maxOutputTokens: 1024 },
    systemPrompt: { static: "You are a precise game assistant.", dynamic: "" },
    ownerConsented: true,
    history: [{ role: "user", content: [{ type: "text", text: TOOL_PROMPT }] }],
    ...over,
  } as ChatRequest;
}

for (const api of ["chat-completions", "responses"] as const) {
  describe.skipIf(!LIVE)(`@live ${api} × openrouter (the hosted array wire)`, () => {
    test("tools: the wire surfaces a real tool_calls request (finishReason tool)", { timeout: TURN_TIMEOUT_MS }, async () => {
      const result = await executor.runChatTurn(
        orArrayReq(api, {
          tools: [
            {
              name: "roll_dice",
              description: "Roll a die with the given number of sides. ALWAYS call this tool when asked to roll dice.",
              parameters: { type: "object", properties: { sides: { type: "number" } }, required: ["sides"] },
            },
          ],
          toolChoice: { mode: "auto" },
        }),
      );
      expect(result.finishReason).toBe("tool");
      expect(result.toolCalls?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(result.toolCalls?.[0]?.name).toBe("roll_dice");
      expect(() => JSON.parse(result.toolCalls?.[0]?.arguments ?? "")).not.toThrow();
    });

    test("structured: response_format json_schema yields a schema-conforming object", { timeout: TURN_TIMEOUT_MS }, async () => {
      const result = await executor.runChatTurn(
        orArrayReq(api, {
          history: [{ role: "user", content: [{ type: "text", text: STRUCTURED_PROMPT }] }],
          responseFormat: { name: "status", schema: STRUCTURED_SCHEMA },
        }),
      );
      const parsed = structuredZ.parse(JSON.parse(result.reply));
      expect(parsed.hp).toBe(42);
      expect(parsed.mood.toLowerCase()).toContain("fierce");
    });
  });
}

// ── PARALLEL vs SEQUENTIAL tool-calling characterization (per route × skin) ────────────────────────────
// The rpg CHEAP mode fires MULTIPLE state tools in one turn, so the per-route mode is load-bearing:
//   • array wires — evidence = result.toolCalls.length from ONE turn (2+ ⇒ parallel emission).
//   • agent-sdk  — the SDK owns the loop; evidence = result.numTurns after BOTH handlers ran
//     (both-in-one-round ⇒ numTurns ≤ 2 ⇒ parallel/interleaved; one-per-round ⇒ numTurns ≥ 3 ⇒ sequential).
// Both handlers running is ASSERTED; the mode itself is CHARACTERIZED (logged as MATRIX-EVIDENCE) — a
// model may legitimately serialize, so the mode line is the deliverable, not a pass/fail.
const MULTI_TOOL_PROMPT =
  "Set the scene state: use the set_mood tool with mood 'tense' AND the set_weather tool with weather 'storm'. You must call BOTH tools.";

function sceneTools(moodCalls: unknown[], weatherCalls: unknown[]): ReturnType<typeof createAgentToolServer> {
  const ok = (): Promise<AgentToolResult> => Promise.resolve({ content: [{ type: "text", text: '{"ok":true}' }] });
  return createAgentToolServer({
    tools: [
      {
        name: "set_mood",
        description: "Set the scene mood. ALWAYS call when asked to set the mood.",
        inputSchema: { mood: z.string() },
        handler: (args): Promise<AgentToolResult> => {
          moodCalls.push(args);
          return ok();
        },
      },
      {
        name: "set_weather",
        description: "Set the scene weather. ALWAYS call when asked to set the weather.",
        inputSchema: { weather: z.string() },
        handler: (args): Promise<AgentToolResult> => {
          weatherCalls.push(args);
          return ok();
        },
      },
    ],
  });
}

const SCENE_WIRE_TOOLS = [
  {
    name: "set_mood",
    description: "Set the scene mood. ALWAYS call when asked to set the mood.",
    parameters: { type: "object", properties: { mood: { type: "string" } }, required: ["mood"] },
  },
  {
    name: "set_weather",
    description: "Set the scene weather. ALWAYS call when asked to set the weather.",
    parameters: { type: "object", properties: { weather: { type: "string" } }, required: ["weather"] },
  },
];

describe.skipIf(!LIVE)("@live tool-mode characterization — parallel vs sequential per cell", () => {
  for (const cell of AGENT_CELLS) {
    test(`agent-sdk × ${cell.name}: both tools run; numTurns reveals the mode`, { timeout: TURN_TIMEOUT_MS }, async () => {
      const moodCalls: unknown[] = [];
      const weatherCalls: unknown[] = [];
      const result = await executor.runChatTurn(
        agentReq(cell.model(), { credential: cell.credential(), prompt: MULTI_TOOL_PROMPT, toolServer: sceneTools(moodCalls, weatherCalls), toolTurnLimit: 4 }),
      );
      expect(moodCalls.length).toBeGreaterThanOrEqual(1);
      expect(weatherCalls.length).toBeGreaterThanOrEqual(1);
      const mode = result.numTurns <= 2 ? "PARALLEL (both tools in one round)" : `SEQUENTIAL (${result.numTurns} rounds)`;
      console.info(`MATRIX-EVIDENCE agent-sdk × ${cell.name}: numTurns=${result.numTurns} → ${mode}`);
    });
  }

  const arrayCells: readonly { name: string; req: () => ChatRequest }[] = [
    {
      name: "chat-completions × vllm",
      req: (): ChatRequest => ({
        api: "chat-completions",
        model: castId<ModelId>(VLLM_GEN_MODEL),
        credential: makeResolvedCredential("vllm"),
        capability: CAPABILITY,
        params: { maxOutputTokens: 1024 },
        systemPrompt: { static: "You are a precise game assistant.", dynamic: "" },
        ownerConsented: true,
        history: [{ role: "user", content: [{ type: "text", text: MULTI_TOOL_PROMPT }] }],
        tools: SCENE_WIRE_TOOLS,
        toolChoice: { mode: "auto" },
      }),
    },
    {
      name: "chat-completions × openrouter",
      req: (): ChatRequest =>
        orArrayReq("chat-completions", {
          history: [{ role: "user", content: [{ type: "text", text: MULTI_TOOL_PROMPT }] }],
          tools: SCENE_WIRE_TOOLS,
          toolChoice: { mode: "auto" },
        }),
    },
    {
      name: "responses × openrouter",
      req: (): ChatRequest =>
        orArrayReq("responses", {
          history: [{ role: "user", content: [{ type: "text", text: MULTI_TOOL_PROMPT }] }],
          tools: SCENE_WIRE_TOOLS,
          toolChoice: { mode: "auto" },
        }),
    },
  ];

  for (const cell of arrayCells) {
    test(`${cell.name}: a multi-tool turn surfaces N tool_calls (N reveals the mode)`, { timeout: TURN_TIMEOUT_MS }, async () => {
      const result = await executor.runChatTurn(cell.req());
      expect(result.finishReason).toBe("tool");
      const calls = result.toolCalls ?? [];
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const mode = calls.length >= 2 ? "PARALLEL (multi-call emission)" : "SEQUENTIAL (one call per turn)";
      console.info(`MATRIX-EVIDENCE ${cell.name}: toolCalls=${calls.map((c) => c.name).join(",")} (${calls.length}) → ${mode}`);
    });
  }
});

// ── The rpg RELIABLE-mode extraction round-trip (the exact production schema) ──────────────────────────
// Proves the SHIPPED `rpgExtractionSchema` (not a toy schema) round-trips through the agent-sdk structured-
// output path the rerouted `runExtraction` drives on a max-pro-sub-class host connection (a local-vLLM host
// routes extraction through the summarize/chat-completions path — agent-sdk×vllm is retired). The extraction
// is READ-ONLY (system + one user turn, responseFormat, NO tool server) — a real state delta emission, then
// the reply is PARSED BACK through the real schema (the impl's exact belt).
const EXTRACTION_SYSTEM =
  "You are a game-state extractor. Read the latest story beat and the current tracked state, then output ONLY " +
  "the changes this beat made to the game state, as a single structured object matching the schema. Emit an " +
  "empty object when nothing tracked changed. Never invent state the beat does not support.";
const EXTRACTION_BEAT =
  "CURRENT STATE:\n{}\n\nLATEST BEAT:\nThe party crosses the threshold into the obsidian tower. Kael draws his blade as the door seals behind them.";

// The extraction routes through `runChatTurn` (the rerouted `buildRunExtraction` agent-sdk arm) on EVERY
// skin — CODE-correctness = the SHIPPED schema round-trips (projects clean incl. the `$schema` strip, the
// SDK accepts the outputFormat, the reply parses back through `rpgExtractionSchema`). Proven across all three
// agent-sdk skins so it isn't hostage to the weak LOCAL model: the required cell is any-skin-green; the vLLM
// cell is a HONEST characterization of the local Qwen3-VL-8B on this large nested schema (may be slow/refuse —
// that's a model-capacity fact, not a routing defect; the delta then stays empty by the errors-as-data belt).
function extractionReq(cell: MatrixCell): ChatRequest {
  return {
    api: "agent-sdk",
    model: castId<ModelId>(cell.model()),
    credential: cell.credential(),
    capability: { ...CAPABILITY, output: { maxTokens: { min: 1, max: 1024 }, structured: true } },
    params: {},
    systemPrompt: { static: EXTRACTION_SYSTEM, dynamic: "" },
    prompt: EXTRACTION_BEAT,
    orSkinTierModels: OR_TIER_MODELS,
    ownerConsented: true,
    responseFormat: { name: "rpg_state_extraction", schema: projectJsonSchema(rpgExtractionSchema) },
  };
}

// The real schema MUST round-trip on every agent-sdk skin (projects clean incl. the `$schema` strip, the SDK
// accepts the outputFormat, the reply parses back through `rpgExtractionSchema`) — proving the reroute's CODE
// path end to end. The rerouted `runExtraction` uses THIS path on a max-pro-sub host connection; local vLLM
// hosts route extraction through the summarize/chat-completions path (agent-sdk×vllm is retired), so there is
// no agent-sdk×vllm extraction cell — its characterization moved to the not-a-valid-combo section below.
describe.skipIf(!LIVE)("@live rpg structured extraction — the real rpgExtractionSchema round-trips through the chat structured path", () => {
  for (const cell of AGENT_CELLS) {
    test(`${cell.name}: a read-only structured extraction turn emits schema-conforming JSON (no tool server mounted)`, {
      timeout: TURN_TIMEOUT_MS,
    }, async () => {
      const result = await executor.runChatTurn(extractionReq(cell));
      const parsed = rpgExtractionSchema.safeParse(JSON.parse(result.reply));
      expect(parsed.success).toBe(true);
      console.info(`MATRIX-EVIDENCE rpg-extraction agent-sdk × ${cell.name}: reply=${result.reply}`);
    });
  }
});

// ── NOT-A-VALID-COMBO: the routes deriveRunner rejects (documented, no live call) ──────────────────────
// A pin per illegal (api × source), so a future re-add of a retired/illegal route trips HERE. These are
// pure dispatch assertions — no engine, no credits. The set (why each is illegal):
//   • agent-sdk × vllm            — RETIRED 2026-07-27 (owner ruling): local vLLM is chat-completions-only.
//   • agent-sdk × local-light     — the in-process derive tier never serves a chat turn.
//   • agent-sdk × custom_openai   — the BYO OpenAI endpoint is not a Claude runtime.
//   • responses × vllm            — the Responses api is OpenRouter-only.
//   • chat-completions × max-pro-sub — the metered sub is reachable only through agent-sdk.
const WHY_VLLM_AGENT = /chat-completions api|retired/i;
const WHY_LOCAL_LIGHT = /local-light/i;
const WHY_CUSTOM_OPENAI = /custom_openai/i;
const WHY_OR_ONLY = /OpenRouter-only/i;
const WHY_AGENT_ONLY = /agent-sdk/i;
const ILLEGAL_COMBOS: readonly { api: ChatApi; source: Parameters<typeof deriveRunner>[1]; why: RegExp }[] = [
  { api: "agent-sdk", source: "vllm", why: WHY_VLLM_AGENT },
  { api: "agent-sdk", source: "local-light", why: WHY_LOCAL_LIGHT },
  { api: "agent-sdk", source: "custom_openai", why: WHY_CUSTOM_OPENAI },
  { api: "responses", source: "vllm", why: WHY_OR_ONLY },
  { api: "chat-completions", source: "max-pro-sub", why: WHY_AGENT_ONLY },
];

describe("not-a-valid-combo — deriveRunner rejects the retired/illegal routes (no live call)", () => {
  for (const { api, source, why } of ILLEGAL_COMBOS) {
    test(`${api} × ${source} throws at deriveRunner (never reaches a backend)`, () => {
      expect(() => deriveRunner(api, source)).toThrow(why);
    });
  }
});
