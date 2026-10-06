import { appendFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { ChatHistoryMessage, ChatRequest, ChatResult, Resolved, ToolChoice } from "@orb/inference";
import { createInferenceRuntime, planStructuredFor } from "@orb/inference";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { z } from "zod";
import { fakeApiKeySecret, fakeConnection, fakeDeps, newUserId } from "../../../tests/inference/_support.ts";
import { principal } from "../../../tests/support/factories/principal.ts";
import { wireSchema } from "../../../tests/support/wire-ready.ts";
import { readEnvKey } from "../openrouter/_kit.ts";
import { EXPECTED_VALUES, ordinaryTurn, registryFor, TOOL_NAMES } from "./scenario.ts";

const ROUTES = [
  { id: "native-flash", provider: "google", model: "gemini-3.8-flash", key: "GEMINI_PROBE_KEY" },
  { id: "native-pro", provider: "google", model: "gemini-3.1-pro-preview", key: "GEMINI_PROBE_KEY" },
  { id: "openrouter-flash", provider: "openrouter", model: "google/gemini-3.8-flash", key: "OPENROUTER_PROBE_KEY" },
  { id: "openrouter-pro", provider: "openrouter", model: "google/gemini-3.1-pro-preview", key: "OPENROUTER_PROBE_KEY" },
] as const;
const PROBE_TIMEOUT_MS = 120_000;
const routingStrict = process.argv.includes("--routing-strict");
const MATRIX_REQUEST_CAP = 28;
const MATRIX_ROUTE_CAP = 7;
const STRICT_REQUEST_CAP = 2;
const STRICT_ROUTE_CAP = 1;
const TOTAL_CAP = routingStrict ? STRICT_REQUEST_CAP : MATRIX_REQUEST_CAP;
const ROUTE_CAP = routingStrict ? STRICT_ROUTE_CAP : MATRIX_ROUTE_CAP;
const RESULTS = fileURLToPath(new URL("./results.jsonl", import.meta.url));
const owner = principal(newUserId());
const tools = registryFor(owner);
const object = z.record(z.string(), z.unknown());
const shape = wireSchema({
  type: "object",
  properties: {
    label: { $ref: "#/$defs/Label" },
    note: { type: "string" },
    nullable: { type: ["string", "null"] },
    count: { type: "integer", minimum: 1, maximum: 3 },
  },
  required: ["label", "nullable", "count"],
  additionalProperties: false,
  $defs: { Label: { type: "string", enum: ["ORBIT"] } },
});
const format = { name: "record_result", description: "Record the complete result.", schema: shape };
const expected = z.object({ label: z.literal("ORBIT"), note: z.string().optional(), nullable: z.null(), count: z.literal(2) });
const run = mintTypeId(ID_PREFIX.chatTurn);
const fixture = process.argv.includes("--fixture");
let total = 0;
let routeCount = 0;
let active = "";
let ordinary = false;
let ordinarySends = 0;
let mode = "";
let lastChoice: ToolChoice | undefined;
const sends: object[] = [];
const replies: object[] = [];
let opaqueDetails: Record<string, unknown>[] = [];
const turns: ChatResult[] = [];

function record(fields: object): void {
  const row = { run, fixture, route: active, case: mode, ...fields };
  if (!fixture) {
    appendFileSync(RESULTS, `${JSON.stringify(row)}\n`);
  }
  console.log(JSON.stringify(row));
}

function asObject(value: unknown): Record<string, unknown> {
  const parsed = object.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asObject) : [];
}

function nativeCalls(body: Record<string, unknown>): Record<string, unknown>[] {
  return rows(body["contents"])
    .filter((r) => r["role"] === "model")
    .flatMap((r) => rows(r["parts"]))
    .filter((p) => p["functionCall"] !== undefined);
}

function gatewayCalls(body: Record<string, unknown>): Record<string, unknown>[] {
  return rows(body["messages"])
    .filter((r) => r["role"] === "assistant")
    .flatMap((r) => rows(r["tool_calls"]));
}

function gatewaySignature(call: Record<string, unknown>): boolean {
  return typeof asObject(asObject(call["extra_content"])["google"])["thought_signature"] === "string";
}

function safeBodySummary(body: Record<string, unknown>): object {
  const gen = asObject(body["generationConfig"]);
  const messages = rows(body["messages"]);
  const contents = rows(body["contents"]);
  const native = nativeCalls(body);
  const gateway = gatewayCalls(body);
  return {
    choice: asObject(body["toolConfig"])["functionCallingConfig"] ?? body["tool_choice"] ?? null,
    parallelControl: body["parallel_tool_calls"] ?? null,
    nativeSchema: gen["responseJsonSchema"] !== undefined,
    responseFormat: asObject(body["response_format"])["type"] ?? null,
    replayIds: [...native.map((p) => String(asObject(p["functionCall"])["id"] ?? "(absent)")), ...gateway.map((c) => String(c["id"]))],
    replaySignatures: [...native.map((p) => typeof p["thoughtSignature"] === "string"), ...gateway.map(gatewaySignature)],
    reasoningFormats: messages.flatMap((r) => rows(r["reasoning_details"]).map((d) => `${String(d["type"])}:${String(d["format"] ?? "unspecified")}`)),
    sentinelPresent: JSON.stringify(body).includes("skip_thought_signature_validator"),
    topKeys: Object.keys(body),
    messageRoles: messages.map((r) => r["role"]),
    contentRoles: contents.map((r) => r["role"]),
    contentParts: contents.map((r) => rows(r["parts"]).map((p) => Object.keys(p).filter((k) => k !== "thoughtSignature"))),
    generationKeys: Object.keys(gen),
    thinkingConfig: gen["thinkingConfig"] ?? null,
    cap: gen["maxOutputTokens"] ?? body["max_tokens"] ?? null,
    provider: body["provider"] ?? null,
    toolNames: rows(body["tools"]).flatMap((tool) => {
      if (tool["function"] !== undefined) {
        return [asObject(tool["function"])["name"]];
      }
      return rows(tool["functionDeclarations"]).map((declaration) => declaration["name"]);
    }),
  };
}

const DATA_PREFIX = "data: ";
function framesOf(text: string): Record<string, unknown>[] {
  return text
    .split(/\r?\n/u)
    .filter((l) => l.startsWith(DATA_PREFIX) && l !== "data: [DONE]")
    .map((l) => asObject(JSON.parse(l.slice(DATA_PREFIX.length))));
}

function safeReplySummary(text: string): object {
  const frames = framesOf(text);
  const echoes = frames
    .map((f) => asObject(f["debug"])["echo_upstream_body"])
    .filter((e) => e !== undefined)
    .map((e) => safeBodySummary(asObject(e)));
  const deltas = frames.flatMap((f) => rows(f["choices"])).map((c) => asObject(c["delta"]));
  const calls = deltas.flatMap((d) => rows(d["tool_calls"])).filter((c) => c["id"] !== undefined);
  const reasoning = deltas.flatMap((d) => rows(d["reasoning_details"]));
  if (ordinary && ordinarySends === 1) {
    opaqueDetails = reasoning.filter((detail) => detail["type"] === "reasoning.encrypted" && detail["format"] === "google-gemini-v1");
  }
  return {
    upstream: echoes.length === 0 ? "unavailable" : echoes,
    providers: [...new Set(frames.map((f) => f["provider"]).filter((p) => typeof p === "string"))],
    signedToolParts: calls.map(gatewaySignature),
    reasoningFormats: [...new Set(reasoning.map((d) => `${String(d["type"])}:${String(d["format"] ?? "unspecified")}`))],
  };
}

function stream(parts: readonly object[], native: boolean): Response {
  if (native) {
    return new Response(
      `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10, totalTokenCount: 40 } })}\n\n`,
      { headers: { "content-type": "text/event-stream" } },
    );
  }
  const text = parts
    .map((p) => object.parse(p)["text"])
    .filter((t) => typeof t === "string")
    .join("");
  const calls = parts
    .flatMap((p) => {
      const part = object.parse(p);
      const call = object.safeParse(part["functionCall"]);
      return call.success
        ? [
            {
              index: 0,
              id: call.data["id"],
              type: "function",
              function: { name: call.data["name"], arguments: JSON.stringify(call.data["args"]) },
              extra_content: { google: { thought_signature: part["thoughtSignature"] } },
            },
          ]
        : [];
    })
    .map((c, index) => ({ ...c, index }));
  const frame = {
    id: "fixture-id",
    model: "fixture",
    choices: [
      {
        index: 0,
        delta: {
          content: text || null,
          ...(calls.length > 0
            ? {
                tool_calls: calls,
                reasoning_details: [{ type: "reasoning.encrypted", data: "fixture-signature", id: calls[0]?.id, format: "google-gemini-v1", index: 0 }],
              }
            : {}),
        },
        finish_reason: calls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
  };
  return new Response(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
}

function spendRequest(): void {
  if (total >= TOTAL_CAP || routeCount >= ROUTE_CAP || (ordinary && ordinarySends >= 2)) {
    throw new Error("Gemini capability probe request cap reached");
  }
  total += 1;
  routeCount += 1;
  if (ordinary) {
    ordinarySends += 1;
  }
}

async function refusalSummary(response: Response): Promise<object> {
  if (response.ok) {
    return {};
  }
  const error = asObject(asObject(await response.clone().json())["error"]);
  const message = typeof error["message"] === "string" ? error["message"] : "";
  const unsupported = message.includes("support") && message.includes("parameters");
  return { errorCode: error["code"] ?? null, routingRefusal: unsupported ? "unsupported-parameters" : "unclassified" };
}

function fixtureToolNames(): readonly string[] {
  if (routingStrict) {
    return [TOOL_NAMES[0]];
  }
  return lastChoice?.mode === "tool" ? [lastChoice.name] : TOOL_NAMES;
}

const transport: typeof fetch = async (url, init) => {
  if (init?.method !== "POST") {
    if (!fixture) {
      return fetch(url, init);
    }
    return Response.json({ data: [], models: [] });
  }
  spendRequest();
  const body = object.parse(JSON.parse(String(init.body)));
  sends.push(safeBodySummary(body));
  if (!fixture) {
    const response = await fetch(
      url,
      active.startsWith("openrouter") ? { ...init, body: JSON.stringify({ ...body, debug: { echo_upstream_body: true } }) } : init,
    );
    record({ kind: "http", status: response.status, number: total, ...(await refusalSummary(response)) });
    if (active.startsWith("openrouter") && response.ok) {
      replies.push(safeReplySummary(await response.clone().text()));
    }
    return response;
  }
  const native = active.startsWith("native");
  if (ordinary && ordinarySends === 2) {
    return stream([{ text: EXPECTED_VALUES.join(" ") }], native);
  }
  if (mode === "response-format") {
    return stream([{ text: '{"label":"ORBIT","nullable":null,"count":2}' }], native);
  }
  if (mode === "forced-format") {
    return stream(
      [{ functionCall: { id: "result-id", name: format.name, args: { label: "ORBIT", nullable: null, count: 2 } }, thoughtSignature: "fixture-signature" }],
      native,
    );
  }
  const names = fixtureToolNames();
  return stream(
    names.map((name, i) => ({
      functionCall: { id: `fixture-${i}`, name, args: { key: "value" } },
      ...(i === 0 ? { thoughtSignature: "fixture-signature" } : {}),
    })),
    native,
  );
};

async function attempt(label: string, operation: () => Promise<object>): Promise<void> {
  mode = label;
  sends.length = 0;
  replies.length = 0;
  opaqueDetails = [];
  turns.length = 0;
  try {
    record({ kind: "verdict", ...(await operation()), sends, replies });
  } catch (error) {
    // Provider diagnostics can include echoed request data; retain only closed error classifications.
    const parsed = z.object({ kind: z.string().optional(), detail: z.string().optional() }).safeParse(error);
    record({
      kind: "verdict",
      pass: false,
      errorKind: parsed.success ? (parsed.data.kind ?? "error") : "error",
      errorDetail: parsed.success ? (parsed.data.detail ?? null) : null,
      sends,
      replies,
    });
    if (fixture) {
      throw error;
    }
  }
}

async function runRoute(route: (typeof ROUTES)[number]): Promise<void> {
  active = route.id;
  routeCount = 0;
  const secret = fixture ? "fixture-key" : readEnvKey(route.key);
  if (secret.length === 0) {
    throw new Error(`Missing ${route.key}`);
  }
  const credentialId = mintTypeId(ID_PREFIX.userCredential);
  const deps = fakeDeps({ fetch: transport, secrets: new Map([[credentialId, fakeApiKeySecret(secret)]]) });
  const runtime = await createInferenceRuntime(deps);
  const connection = fakeConnection({
    ownerId: owner.userId,
    providerId: route.provider,
    model: route.model,
    credentialId,
    ...(routingStrict
      ? { declared: { generation: { tools: { parallel: true, parallelControl: true } } }, extras: { provider: { require_parameters: true } } }
      : {}),
  });
  deps.stores.connections.rows.set(connection.id, connection);
  const resolved: Resolved<"chat"> = { ...(await runtime.resolve({ task: "chat", principal: owner, connectionId: connection.id })).resolved, task: "chat" };
  const invoke = async (request: ChatRequest): Promise<ChatResult> => {
    const result = await runtime.executor.runChatTurn(request);
    turns.push(result);
    return result;
  };
  const api = resolved.api;
  if (api !== "google-generative-ai" && api !== "chat-completions") {
    throw new Error("Unexpected probe API");
  }
  const history: readonly ChatHistoryMessage[] = [
    { role: "user", content: [{ type: "text", text: "Call lookup_alpha and lookup_beta with key value. Do not guess their answers." }] },
  ];
  const base = {
    api,
    connection: resolved,
    params: { effort: "low", maxOutputTokens: 16_384, carryReasoning: "off" },
    systemPrompt: { static: "Follow tool instructions exactly.", dynamic: "" },
    history,
    tools: tools.definitions,
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  } satisfies ChatRequest;
  if (routingStrict) {
    await attempt("parallel-off-strict-routing", async () => {
      lastChoice = { mode: "required" };
      const result = await invoke({ ...base, toolChoice: lastChoice, params: { ...base.params, advanced: { parallelToolCalls: false } } });
      if (fixture) {
        const sent = asObject(sends[0]);
        if (sent["parallelControl"] !== false || asObject(sent["provider"])["require_parameters"] !== true) {
          throw new Error("Strict routing fixture did not send its two required control fields");
        }
      }
      return { pass: (result.toolCalls?.length ?? 0) === 1, count: result.toolCalls?.length ?? 0, diagnosticRouting: true };
    });
    await runtime.localLight.close();
    return;
  }
  await attempt("ordinary-auto-replay", async () => {
    ordinary = true;
    ordinarySends = 0;
    lastChoice = { mode: "auto" };
    try {
      const result = await ordinaryTurn({ connection: resolved, owner, runChatTurn: invoke });
      const first = turns[0]?.toolCalls ?? [];
      const records = result.toolRecords;
      const replay = asObject(sends[1]);
      const replayIds = replay["replayIds"];
      const exactIds = isDeepStrictEqual(
        replayIds,
        first.map((call) => call.toolCallId),
      );
      const exactSignatures = isDeepStrictEqual(
        replay["replaySignatures"],
        first.map((call) => call.thoughtSignature !== undefined),
      );
      const sidecar = first[0]?.openrouter?.reasoningDetails ?? [];
      const exactOpaque = opaqueDetails.every((detail) => sidecar.some((item) => isDeepStrictEqual(item, detail)));
      const pass =
        turns.length === 2 &&
        first.length === 2 &&
        records.length === 2 &&
        records.every((r, i) => !r.isError && r.toolCallId === first[i]?.toolCallId) &&
        EXPECTED_VALUES.every((value) => result.content.includes(value)) &&
        exactIds &&
        exactSignatures &&
        exactOpaque &&
        !sends.some((s) => object.parse(s)["sentinelPresent"] === true);
      return {
        pass,
        calls: turns.length,
        ids: first.map((c) => c.toolCallId),
        names: first.map((c) => c.name),
        signed: first.map((c) => c.thoughtSignature !== undefined),
        executedIds: records.map((r) => r.toolCallId),
        exactIds,
        exactSignatures,
        exactOpaque,
        opaqueParts: sidecar.length,
        finalContainsValues: EXPECTED_VALUES.every((value) => result.content.includes(value)),
        warnings: result.runnerWarnings.map((w) => w.code),
      };
    } finally {
      ordinary = false;
    }
  });
  for (const choice of [{ mode: "required" }, { mode: "tool", name: TOOL_NAMES[1] }] as const) {
    lastChoice = choice;
    await attempt(choice.mode, async () => {
      const result = await invoke({ ...base, toolChoice: choice });
      const calls = result.toolCalls ?? [];
      return {
        pass: calls.length > 0 && (choice.mode !== "tool" || calls.every((c) => c.name === choice.name)),
        count: calls.length,
        names: calls.map((c) => c.name),
        warnings: result.events.filter((e) => e.kind === "warning").map((e) => e.code),
      };
    });
  }
  await attempt("parallel-off", async () => {
    lastChoice = { mode: "required" };
    const result = await invoke({ ...base, toolChoice: lastChoice, params: { ...base.params, advanced: { parallelToolCalls: false } } });
    const warnings = result.events.filter((e) => e.kind === "warning").map((e) => e.code);
    return {
      pass: true,
      observationOnly: true,
      count: result.toolCalls?.length ?? 0,
      advertisedControl: resolved.capability.kind === "generation" ? (resolved.capability.generation.tools?.parallelControl ?? "implicit") : null,
      warnings,
      controlHonoured: "unverified-single-request",
    };
  });
  await attempt("response-format", async () => {
    const result = await invoke({
      ...base,
      tools: undefined,
      history: [{ role: "user", content: [{ type: "text", text: "Return label ORBIT, nullable null, count 2. Omit note." }] }],
      responseFormat: format,
    });
    return {
      pass: expected.safeParse(JSON.parse(result.reply)).success,
      finish: result.finishReason,
      plan: planStructuredFor(resolved, { formats: [format] }),
    };
  });
  await attempt("forced-format", async () => {
    const forced: Resolved<"chat"> =
      resolved.capability.kind === "generation"
        ? {
            ...resolved,
            capability: {
              kind: "generation",
              generation: { ...resolved.capability.generation, output: { ...resolved.capability.generation.output, structured: false } },
            },
          }
        : resolved;
    const result = await invoke({
      ...base,
      connection: forced,
      tools: undefined,
      history: [{ role: "user", content: [{ type: "text", text: "Record label ORBIT, nullable null, count 2. Omit note." }] }],
      responseFormat: format,
    });
    return { pass: expected.safeParse(JSON.parse(result.reply)).success, finish: result.finishReason, plan: planStructuredFor(forced, { formats: [format] }) };
  });
  record({ kind: "route-complete", requests: routeCount });
  await runtime.localLight.close();
}
for (const route of ROUTES) {
  if (!routingStrict || route.provider === "openrouter") {
    await runRoute(route);
  }
}
console.log(`requests=${total}/${TOTAL_CAP}`);
