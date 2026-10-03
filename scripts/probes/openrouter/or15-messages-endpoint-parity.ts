// OR-15 — can an OpenRouter connection serve Claude over OpenRouter's Anthropic-compatible Messages endpoint
// (`/api/v1/messages`) through the existing anthropic-messages backend without losing what ADR 0174 says it loses?
// Each arm answers one question:
//
//   raw   auth: `x-api-key` (what @ai-sdk/anthropic `apiKey` sends) vs `Authorization: Bearer` (`authToken`)
//   raw   routing: `provider.only` to Anthropic, to Vertex, to Bedrock, and `provider.ignore` Anthropic; the serving
//         provider is read back from `GET /generation?id=` (`provider_name`)
//   raw   fallback: `models` with a second vendor's id, under a `provider.only` the primary cannot meet
//   raw   cost: `usage.cost` in the body, and `GET /generation?id=` on the response id
//   raw   headers: every response header name, and the `x-*` values
//   raw   streaming: the SSE `message_start` id and any cost on the stream
//   sdk   the real `runAnthropicChatTurn` against the OpenRouter origin: off (between_tools), adaptive, a tool loop
//
// The backend arms pass the OpenRouter key through the backend's own `apiKey`, so they also answer the auth question
// for the shipped code. Small max_tokens everywhere: well under a cent.

import { providerIdSchema } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { InferenceLog, Resolved, WireCaptureSink } from "@orb/inference";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { runAnthropicChatTurn } from "../../../packages/inference/src/backends/anthropic-messages/chat.ts";
import { detectModelFamily } from "../../../packages/inference/src/capability/families.ts";
import { applyEndpointPosture } from "../../../packages/inference/src/capability/floor.ts";
import { curatedRows } from "../../../packages/inference/src/capability/sources/curated/loader.ts";
import { measuredRows } from "../../../packages/inference/src/capability/sources/measured/loader.ts";
import { synthesizeCapability } from "../../../packages/inference/src/capability/synthesize.ts";
import type { AnthropicChatRequest, ChatResult } from "../../../packages/inference/src/contract/chat.ts";
import { makeApiKeySecret, makeResolved } from "../../../tests/support/factories/resolved-connection.ts";
import { addSpend, jsonl, printTable, readEnvKey, totalSpend } from "./_kit.ts";

export const id = "or15";
export const title = "OpenRouter Messages endpoint: auth, routing, fallback, cost, headers, and the anthropic-messages backend against it";

const OR_ORIGIN = "https://openrouter.ai/api/v1";
const MESSAGES_URL = `${OR_ORIGIN}/messages`;
const GENERATION_URL = `${OR_ORIGIN}/generation`;
const MODEL = process.env["OR15_MODEL"] ?? "anthropic/claude-sonnet-5.5";
const FALLBACK_MODEL = "openai/gpt-4.1-mini";
const FALLBACK_PROVIDER = "openai";
const ANTHROPIC_VERSION = "2023-06-01";
const SHORT_MAX_TOKENS = 64;
const LOOP_MAX_TOKENS = 600;
const PROMPT = "Name one primary colour. One word.";
const LOOP_PROMPT = "Check the weather in Paris with the tool, then answer in one sentence.";
// The generation record lags the reply by minutes on this endpoint, so the lookup runs once after every arm.
const GENERATION_LOOKUP_TRIES = 10;
const GENERATION_LOOKUP_DELAY_MS = 30_000;
const HEADER_VALUE_LIMIT = 200;

const WEATHER_TOOL = {
  name: "get_weather",
  description: "Current weather for a city.",
  parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false },
};

interface MessagesResponse {
  readonly id?: string;
  readonly model?: string;
  readonly provider?: string;
  readonly content?: readonly { readonly type?: string; readonly text?: string }[];
  readonly usage?: Record<string, unknown>;
  readonly error?: unknown;
}

interface GenerationLookup {
  readonly status: number;
  readonly providerName: string | null;
  readonly totalCost: number | null;
  readonly model: string | null;
}

interface RawOutcome {
  readonly status: number;
  readonly generationId: string | null;
  readonly model: string | null;
  readonly bodyProvider: string | null;
  readonly usageKeys: string;
  readonly usageCost: number | null;
  readonly error: string | null;
  readonly headerNames: string;
  readonly xHeaders: Readonly<Record<string, string>>;
  readonly text: string;
}

type Auth = "x-api-key" | "bearer";

function authHeaders(auth: Auth, key: string): Record<string, string> {
  return auth === "bearer" ? { Authorization: `Bearer ${key}` } : { "x-api-key": key };
}

function headerFacts(headers: Headers): { readonly headerNames: string; readonly xHeaders: Record<string, string> } {
  const names: string[] = [];
  const xHeaders: Record<string, string> = {};
  headers.forEach((value, name) => {
    names.push(name);
    if (name.startsWith("x-") || name === "request-id") {
      xHeaders[name] = value.slice(0, HEADER_VALUE_LIMIT);
    }
  });
  return { headerNames: names.sort().join(","), xHeaders };
}

async function raw(key: string, auth: Auth, body: Record<string, unknown>): Promise<RawOutcome> {
  const response = await fetch(MESSAGES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": ANTHROPIC_VERSION, ...authHeaders(auth, key) },
    body: JSON.stringify({ model: MODEL, max_tokens: SHORT_MAX_TOKENS, messages: [{ role: "user", content: PROMPT }], ...body }),
  });
  const text = await response.text();
  let json: MessagesResponse = {};
  try {
    json = JSON.parse(text) as MessagesResponse;
  } catch {
    json = { error: text.slice(0, 600) };
  }
  const cost = typeof json.usage?.["cost"] === "number" ? json.usage["cost"] : null;
  addSpend(cost ?? 0);
  return {
    status: response.status,
    generationId: json.id ?? null,
    model: json.model ?? null,
    bodyProvider: json.provider ?? null,
    usageKeys: Object.keys(json.usage ?? {}).join(","),
    usageCost: cost,
    error: json.error === undefined ? null : JSON.stringify(json.error).slice(0, 600),
    ...headerFacts(response.headers),
    text: (json.content ?? []).flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join("").slice(0, 80),
  };
}

interface StreamOutcome {
  readonly status: number;
  readonly generationId: string | null;
  readonly eventTypes: string;
  readonly costOnStream: number | null;
  readonly usageKeys: string;
  readonly headerNames: string;
  readonly xHeaders: Readonly<Record<string, string>>;
}

async function rawStream(key: string): Promise<StreamOutcome> {
  const response = await fetch(MESSAGES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "anthropic-version": ANTHROPIC_VERSION, ...authHeaders("bearer", key) },
    body: JSON.stringify({ model: MODEL, max_tokens: SHORT_MAX_TOKENS, stream: true, messages: [{ role: "user", content: PROMPT }] }),
  });
  const text = await response.text();
  let generationId: string | null = null;
  let costOnStream: number | null = null;
  const types = new Set<string>();
  const usageKeys = new Set<string>();
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data: ")) {
      continue;
    }
    // OpenRouter ends the Anthropic-shaped stream with the OpenAI terminator, which Anthropic itself never sends.
    if (line === "data: [DONE]") {
      types.add("[DONE]");
      continue;
    }
    const event = JSON.parse(line.slice("data: ".length)) as {
      readonly type?: string;
      readonly message?: { readonly id?: string; readonly usage?: Record<string, unknown> };
      readonly usage?: Record<string, unknown>;
    };
    types.add(event.type ?? "?");
    generationId = event.message?.id ?? generationId;
    for (const usage of [event.message?.usage, event.usage]) {
      for (const [k, v] of Object.entries(usage ?? {})) {
        usageKeys.add(k);
        if (k === "cost" && typeof v === "number") {
          costOnStream = v;
        }
      }
    }
  }
  addSpend(costOnStream ?? 0);
  return {
    status: response.status,
    generationId,
    eventTypes: [...types].join(","),
    costOnStream,
    usageKeys: [...usageKeys].join(","),
    ...headerFacts(response.headers),
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function lookupOnce(key: string, generationId: string): Promise<GenerationLookup> {
  const response = await fetch(`${GENERATION_URL}?id=${encodeURIComponent(generationId)}`, { headers: authHeaders("bearer", key) });
  const json = (await response.json()) as { readonly data?: { readonly provider_name?: string; readonly total_cost?: number; readonly model?: string } };
  return { status: response.status, providerName: json.data?.provider_name ?? null, totalCost: json.data?.total_cost ?? null, model: json.data?.model ?? null };
}

/** Polls every id until each resolves or the tries run out; a 404 here is lag, not absence, until the last try. */
async function lookupGenerations(key: string, ids: readonly string[]): Promise<Map<string, GenerationLookup>> {
  const found = new Map<string, GenerationLookup>();
  const pending = (): readonly string[] => ids.filter((candidate) => found.get(candidate)?.status !== 200);
  for (let i = 0; i < GENERATION_LOOKUP_TRIES && pending().length > 0; i += 1) {
    await sleep(GENERATION_LOOKUP_DELAY_MS);
    for (const generationId of pending()) {
      found.set(generationId, await lookupOnce(key, generationId));
    }
  }
  return found;
}

const silent: InferenceLog = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };

function openRouterMessagesConnection(key: string): Resolved<"chat"> {
  const base = makeResolved({ providerId: "openrouter" });
  const model = castId<ModelId>(MODEL);
  // The capability the flagged resolve would fold: the anthropic-messages rows for this id, not the OpenRouter route's.
  const query = { model, providerId: providerIdSchema.parse("anthropic"), wire: "anthropic-messages" as const, api: "anthropic-messages" as const };
  const synthesized = synthesizeCapability("generation", detectModelFamily(model), { measured: measuredRows(query), curated: curatedRows(query) });
  return makeResolved({
    providerId: "openrouter",
    wire: "anthropic-messages",
    api: "anthropic-messages",
    model,
    factsModel: model,
    baseUrl: OR_ORIGIN,
    capability: applyEndpointPosture(base.provider, synthesized.capability, false),
    credential: makeApiKeySecret(key),
  });
}

interface BackendOutcome {
  readonly status: "ok" | "error";
  readonly generationId: string | null;
  readonly thinkingSent: string | null;
  readonly appliedEffort: string | null;
  readonly measuredCost: number | null;
  readonly finish: string | null;
  readonly toolCalls: number;
  readonly reply: string;
  readonly error: string | null;
  readonly xHeaders: Readonly<Record<string, string>>;
  readonly result: ChatResult | null;
}

async function backendTurn(key: string, params: UserIntent, history: AnthropicChatRequest["history"], withTools: boolean): Promise<BackendOutcome> {
  const capture: { body: Record<string, unknown> | null; headers: Readonly<Record<string, string>> } = { body: null, headers: {} };
  const sink: WireCaptureSink = (entry) => {
    capture.body = entry.body;
    capture.headers = entry.responseHeaders ?? {};
  };
  const connection = openRouterMessagesConnection(key);
  const req: AnthropicChatRequest = {
    api: "anthropic-messages",
    connection,
    params,
    systemPrompt: { static: "You are terse.", dynamic: "" },
    history,
    ...(withTools ? { tools: [WEATHER_TOOL] } : {}),
  };
  const xHeaders = (): Record<string, string> =>
    Object.fromEntries(Object.entries(capture.headers).filter(([name]) => name.startsWith("x-") || name === "request-id"));
  try {
    const result = await runAnthropicChatTurn(req, { now: Date.now, log: silent, transport: { fetch: globalThis.fetch, captureWire: sink } });
    return {
      status: "ok",
      generationId: result.generationId ?? null,
      thinkingSent: JSON.stringify(capture.body?.["thinking"] ?? null),
      appliedEffort: result.appliedEffort,
      measuredCost: result.usage.costUsd ?? null,
      finish: result.finishReason,
      toolCalls: result.toolCalls?.length ?? 0,
      reply: result.reply.slice(0, 80),
      error: null,
      xHeaders: xHeaders(),
      result,
    };
  } catch (err) {
    return {
      status: "error",
      generationId: null,
      thinkingSent: JSON.stringify(capture.body?.["thinking"] ?? null),
      appliedEffort: null,
      measuredCost: null,
      finish: null,
      toolCalls: 0,
      reply: "",
      error: (err instanceof Error ? err.message : String(err)).slice(0, 600),
      xHeaders: xHeaders(),
      result: null,
    };
  }
}

export async function run(): Promise<object> {
  const key = readEnvKey("OPENROUTER_PROBE_KEY") || readEnvKey("OPENROUTER_API_KEY");
  const out = jsonl(id);
  if (key.length === 0) {
    console.log("no OPENROUTER_PROBE_KEY / OPENROUTER_API_KEY: nothing fired");
    return { kind: "verdict", probe: id, skipped: true };
  }
  const rows: Record<string, unknown>[] = [];
  const record = (arm: string, fields: object): void => {
    const row = { kind: "arm", probe: id, model: MODEL, arm, ...fields };
    out.append(row);
    rows.push(row);
  };

  const ask = async (arm: string, auth: Auth, body: Record<string, unknown>): Promise<void> => {
    const o = await raw(key, auth, body);
    record(arm, o);
  };

  await ask("auth-x-api-key", "x-api-key", {});
  await ask("auth-bearer", "bearer", {});
  await ask("route-only-anthropic", "bearer", { provider: { only: ["anthropic"], allow_fallbacks: false } });
  await ask("route-only-vertex", "bearer", { provider: { only: ["google-vertex"], allow_fallbacks: false } });
  await ask("route-only-bedrock", "bearer", { provider: { only: ["amazon-bedrock"], allow_fallbacks: false } });
  await ask("route-ignore-anthropic", "bearer", { provider: { ignore: ["anthropic"] } });
  // The primary has no endpoint on the only allowed provider, so a served reply can only come from the `models` chain.
  await ask("fallback-models", "bearer", { models: [MODEL, FALLBACK_MODEL], provider: { only: [FALLBACK_PROVIDER] } });
  await ask("fallback-control-no-models", "bearer", { provider: { only: [FALLBACK_PROVIDER] } });
  await ask("between-tools", "bearer", { thinking: { type: "between_tools" } });
  const streamed = await rawStream(key);
  record("stream", streamed);

  const user = (text: string): AnthropicChatRequest["history"][number] => ({ role: "user", content: [{ type: "text", text }] });
  const backend = async (arm: string, params: UserIntent, history: AnthropicChatRequest["history"], withTools: boolean): Promise<BackendOutcome> => {
    const o = await backendTurn(key, params, history, withTools);
    const { result: _result, ...fields } = o;
    record(arm, fields);
    return o;
  };
  await backend("backend-off", { effort: "none", maxOutputTokens: SHORT_MAX_TOKENS }, [user(PROMPT)], false);
  await backend("backend-adaptive-low", { effort: "low", maxOutputTokens: LOOP_MAX_TOKENS }, [user(PROMPT)], false);
  const hop1 = await backend("backend-tool-hop1", { effort: "none", maxOutputTokens: LOOP_MAX_TOKENS }, [user(LOOP_PROMPT)], true);
  const call = hop1.result?.toolCalls?.[0];
  if (call !== undefined && hop1.result !== null) {
    await backend(
      "backend-tool-hop2",
      { effort: "none", maxOutputTokens: LOOP_MAX_TOKENS },
      [
        user(LOOP_PROMPT),
        {
          role: "assistant",
          content: [...(hop1.result.reasoningParts ?? []), { type: "tool-call", toolCallId: call.toolCallId, name: call.name, arguments: call.arguments }],
        },
        { role: "tool", content: [{ type: "tool-result", toolCallId: call.toolCallId, content: "14 C, light rain" }] },
      ],
      true,
    );
  }

  const ids = rows.flatMap((r) => (r["status"] === 200 || r["status"] === "ok") && typeof r["generationId"] === "string" ? [r["generationId"]] : []);
  const lookups = await lookupGenerations(key, ids);
  for (const r of rows) {
    const lookup = typeof r["generationId"] === "string" ? lookups.get(r["generationId"]) : undefined;
    if (lookup !== undefined) {
      r["generation"] = lookup;
      out.append({ kind: "lookup", probe: id, arm: r["arm"], generationId: r["generationId"], ...lookup });
    }
  }

  const verdict = {
    kind: "verdict",
    probe: id,
    at: new Date().toISOString(),
    model: MODEL,
    arms: rows.map((r) => `${String(r["arm"])} status=${String(r["status"])}`),
    openrouterSpend: totalSpend(),
  };
  out.append(verdict);
  printTable(
    rows.map((r) => {
      const generation = r["generation"] as GenerationLookup | null | undefined;
      return {
        arm: r["arm"],
        status: r["status"],
        id: r["generationId"],
        servedBy: generation?.providerName ?? null,
        lookupCost: generation?.totalCost ?? null,
        bodyCost: r["usageCost"] ?? r["costOnStream"] ?? r["measuredCost"] ?? null,
        model: r["model"] ?? generation?.model ?? null,
      };
    }),
  );
  for (const r of rows) {
    console.log(`${String(r["arm"])}: ${JSON.stringify({ error: r["error"], thinkingSent: r["thinkingSent"], appliedEffort: r["appliedEffort"], usageKeys: r["usageKeys"], text: r["text"] ?? r["reply"] })}`);
  }
  console.log(`header names (auth-bearer): ${String(rows.find((r) => r["arm"] === "auth-bearer")?.["headerNames"])}`);
  console.log(`x-headers (auth-bearer): ${JSON.stringify(rows.find((r) => r["arm"] === "auth-bearer")?.["xHeaders"])}`);
  console.log(`x-headers (backend-off): ${JSON.stringify(rows.find((r) => r["arm"] === "backend-off")?.["xHeaders"])}`);
  return verdict;
}
