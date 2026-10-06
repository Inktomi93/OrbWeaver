// The `summarize` and `structured` tasks on the openai-compat wire, each item one chat turn (`roles/side-gen.ts`).
// The pins are WIRE BODIES: the structured plan picks the carrier per row (OpenRouter Claude in the strict-compatible
// shape, vLLM in the guided-decoding subset, a Custom row in the hosted subset or one forced tool where it states no
// structured output), a model with no carrier is refused before any request, and the side-generation posture's
// reasoning and output room ride as the chat turn spells them.

import type { ProviderId, WireSchemaMode } from "@orb/contracts/inference";
import { scrubWireSchema } from "@orb/contracts/inference";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { stateRoundChangesSchema } from "@orb/contracts/rpg";
import { castId } from "@orb/kit/ids";
import { createOpenAiCompatBackend } from "../../../../packages/inference/src/backends/openai-compat/index.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { measuredRows } from "../../../../packages/inference/src/capability/sources/measured/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { StructuredRequest, SummarizeRequest } from "../../../../packages/inference/src/contract/roles.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { makeCapability, makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { wireSchema } from "../../../support/wire-ready.ts";
import { fakeApiKeySecret, fakeResolved, memoryStores } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, scriptedSseFetch } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const APP = { name: "orbweaver-test", url: "http://localhost:0" };
const COMPLETION = openAiTextStream('{"ok":true}');
/** The vLLM row's sleep probe, which a task on that row asks first; answered awake and never recorded. */
const SLEEP_PROBE_SUFFIX = "/is_sleeping";

/** The wire's backend over `fetch`, its sleep probe answered awake. */
function backendOver(fetchImpl: typeof fetch, log: InferenceLog): ReturnType<typeof createOpenAiCompatBackend>["backend"] {
  const awake: typeof fetch = (input, init) =>
    String(input).endsWith(SLEEP_PROBE_SUFFIX) ? Promise.resolve(Response.json({ is_sleeping: false })) : fetchImpl(input, init);
  return createOpenAiCompatBackend({ now: () => NOW, log, fetch: awake, app: APP, snapshotStore: memoryStores().snapshotStore }).backend;
}

function summarizeOn(fetchImpl: typeof fetch, log: InferenceLog, req: SummarizeRequest): Promise<unknown> {
  const run = backendOver(fetchImpl, log).summarize;
  if (run === undefined) {
    throw new Error("the openai-compat backend serves summarize");
  }
  return run(req);
}

function structuredOn(fetchImpl: typeof fetch, log: InferenceLog, req: StructuredRequest): Promise<unknown> {
  const run = backendOver(fetchImpl, log).structured;
  if (run === undefined) {
    throw new Error("the openai-compat backend serves structured");
  }
  return run(req);
}
const FORMAT: ResponseFormat = {
  name: "row",
  schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }),
};
const INPUTS = [{ systemPrompt: "Extract.", userPrompt: "One row." }] as const;
const scrubbedFor = (schema: Record<string, unknown>, mode: WireSchemaMode): Record<string, unknown> => scrubWireSchema(schema, mode).schema;

interface LogLine {
  readonly level: string;
  readonly fields: Record<string, unknown>;
}

function recordingLog(lines: LogLine[]): InferenceLog {
  const push =
    (level: string): InferenceLog["info"] =>
    (fields): void => {
      lines.push({ level, fields: { ...fields } });
    };
  return { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") };
}

function orConnection(model: string): ReturnType<typeof fakeResolved<"structured">> {
  const { capability } = synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model, providerId: castId<ProviderId>("openrouter"), wire: "openai-compat", api: "chat-completions" }),
  });
  return fakeResolved({ task: "structured", providerId: "openrouter", model, capability, secret: fakeApiKeySecret("sk-or-not-a-real-key") });
}

function vllmConnection(): ReturnType<typeof fakeResolved<"structured">> {
  return fakeResolved({
    task: "structured",
    providerId: "vllm",
    model: "Qwen/Qwen3-8B",
    capability: generationCapability({ tools: { parallel: true, silencesProse: true } }),
    baseUrl: "http://127.0.0.1:8000/v1",
  });
}

async function structuredBody(
  connection: ReturnType<typeof fakeResolved<"structured">>,
  format: ResponseFormat = FORMAT,
): Promise<{ readonly body: Record<string, unknown>; readonly lines: LogLine[] }> {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  await structuredOn(scriptedSseFetch([COMPLETION], recorded), recordingLog(lines), { connection, inputs: INPUTS, responseFormat: format, signal: undefined });
  return { body: recorded[0]?.body ?? {}, lines };
}

function warnedCodes(lines: readonly LogLine[]): readonly unknown[] {
  return lines.filter((line) => line.level === "warn" && line.fields["event"] === "provider.resolve-warning").map((line) => line.fields["code"]);
}

/** A schema carrying a bound, an annotation and an optional field, so each mode's scrub is visible on the wire. */
const BOUNDED: ResponseFormat = {
  name: "row",
  schema: wireSchema({
    type: "object",
    title: "Row",
    properties: { score: { type: "integer", minimum: 1, maximum: 10 }, note: { type: "string", maxLength: 40 } },
    required: ["score"],
    additionalProperties: false,
  }),
};

function endpointConnection(providerId: string, capability = generationCapability()): ReturnType<typeof fakeResolved<"structured">> {
  return fakeResolved({ task: "structured", providerId, model: "m", capability, baseUrl: "http://127.0.0.1:8000/v1" });
}

function responseSchemaOf(body: Record<string, unknown>): { readonly schema: Record<string, unknown>; readonly strict: unknown } {
  const format = body["response_format"] as { readonly json_schema: { readonly schema: Record<string, unknown>; readonly strict: unknown } };
  return format.json_schema;
}

test("#2575: a structured call on OpenRouter Claude rides response_format in the strict-compatible shape, never a forced tool", async () => {
  for (const model of ["anthropic/claude-fable-5.1", "anthropic/claude-opus-5.5", "anthropic/claude-opus-5"]) {
    const { body, lines } = await structuredBody(orConnection(model));
    expect(body["response_format"], model).toMatchObject({ type: "json_schema", json_schema: { name: "row", strict: true } });
    expect(body, model).not.toHaveProperty("tools");
    expect(body, model).not.toHaveProperty("tool_choice");
    expect(warnedCodes(lines), model).not.toContain("tool_choice_downgraded");
  }
});

test("vLLM: the structured call carries the guided-decoding subset with strict true — bounds kept, annotations off", async () => {
  const { body } = await structuredBody(vllmConnection(), BOUNDED);
  const { schema, strict } = responseSchemaOf(body);
  expect(strict).toBe(true);
  expect(schema).not.toHaveProperty("title");
  expect((schema["properties"] as Record<string, unknown>)["score"]).toEqual({ type: "integer", minimum: 1, maximum: 10 });
});

test("Custom: the structured call carries the hosted-common subset with strict false — a bound becomes the field's note", async () => {
  const { body } = await structuredBody(endpointConnection("custom-openai"), BOUNDED);
  const { schema, strict } = responseSchemaOf(body);
  expect(strict).toBe(false);
  expect((schema["properties"] as Record<string, unknown>)["score"]).toEqual({ type: "integer", description: "[Constraints: minimum: 1, maximum: 10]" });
  expect(schema["required"]).toEqual(["score"]);
});

test("Custom with structured output off and tool calls on: one forced tool carries the payload, never a response format", async () => {
  const toolsOnly = generationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] } });
  const { body } = await structuredBody(endpointConnection("custom-openai", toolsOnly));
  expect(body).not.toHaveProperty("response_format");
  expect(body["tool_choice"]).toMatchObject({ type: "function", function: { name: "row" } });
  expect(body["tools"]).toMatchObject([{ type: "function", function: { name: "row" } }]);
});

test("a model with neither structured output nor tool calls is refused before any request, with no-vehicle", async () => {
  const bare = makeCapability(makeGenerationCapability());
  const failure = await structuredBody(endpointConnection("custom-openai", bare)).catch((err: unknown) => err);
  expect(failure).toMatchObject({ kind: "invalid", detail: "schema_rejected", violations: [{ kind: "no-vehicle" }] });
});

test("0511: the rpg structured state round on a KoboldCpp row rides `response_format` json_schema in the gbnf subset, never a tool", async () => {
  const schema = stateRoundChangesSchema(wireSchema({}), [
    { name: "update_scene", description: "Scene.", parameters: { type: "object", properties: { location: { type: "string" } }, additionalProperties: false } },
    { name: "no_changes", description: "Nothing.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  ]);
  const kobold = fakeResolved({
    task: "structured",
    providerId: "koboldcpp",
    model: "qwen2.5-0.5b",
    capability: generationCapability({ tools: { parallel: true, requiredChoice: false, namedChoice: false, silencesProse: true } }),
    baseUrl: "http://127.0.0.1:5001/v1",
  });

  const { body } = await structuredBody(kobold, { name: "rpg_state_changes", schema });

  expect(body["response_format"]).toEqual({
    type: "json_schema",
    json_schema: { name: "rpg_state_changes", schema: scrubbedFor(schema, "gbnf"), strict: false },
  });
  expect(body).not.toHaveProperty("tools");
  expect(body).not.toHaveProperty("tool_choice");
});

test("D299: a role preset's seed, stop and effort reach a summarize body; the cap grows to fit the thinking", async () => {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  const connection = fakeResolved({
    task: "summarize",
    providerId: "vllm",
    model: "Qwen/Qwen3-8B",
    capability: generationCapability({ sampling: { temperature: { min: 0, max: 2 }, seed: true, stop: true } }),
    baseUrl: "http://127.0.0.1:8000/v1",
  });
  await summarizeOn(scriptedSseFetch([COMPLETION], recorded), recordingLog(lines), {
    connection,
    inputs: INPUTS,
    temperature: 0.5,
    seed: 7,
    stop: ["END"],
    effort: "high",
    maxTokens: 64,
    signal: undefined,
  });
  const body = recorded[0]?.body ?? {};
  // The model reasons and the row spells `reasoning_effort`, so the preset's level rides; thinking is paid out of
  // `max_tokens`, so the cap grows to the model's own 8192 rather than leaving the 64-token answer to starve.
  expect(body).toMatchObject({ temperature: 0.5, seed: 7, stop: ["END"], reasoning_effort: "high", max_tokens: 8192 });
  expect(warnedCodes(lines)).toEqual(["cache_control_adjusted"]);
  expect(lines.find((line) => line.fields["event"] === "provider.resolve-warning")?.fields["reason"]).toBe(
    "App-authored prefix markers are unsupported on this route; provider implicit caching, if available, is unchanged",
  );
});

// ── Side-generation reasoning: the posture's off, a preset's level, and room for thinking that runs ──

const ARBITER_CAP = 128;

function hostedConnection(providerId: "openrouter" | "openai", model: string): ReturnType<typeof fakeResolved<"summarize">> {
  const query = { model, providerId: castId<ProviderId>(providerId), wire: "openai-compat", api: "chat-completions" } as const;
  const { capability } = synthesizeCapability("generation", providerId === "openai" ? "openai" : "anthropic", {
    curated: curatedRows(query),
    measured: measuredRows(query),
  });
  return fakeResolved({ task: "summarize", providerId, model, capability, secret: fakeApiKeySecret("sk-not-a-real-key") });
}

async function sideGenBodies(
  connection: ReturnType<typeof fakeResolved<"summarize">>,
  sampling: { readonly effort?: "none" | "low" | "high"; readonly maxTokens?: number },
  fetchImpl?: (recorded: RecordedRequest[]) => typeof fetch,
): Promise<{ readonly bodies: readonly Record<string, unknown>[]; readonly lines: LogLine[] }> {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  const fetchFor = fetchImpl?.(recorded) ?? scriptedSseFetch([COMPLETION], recorded);
  await summarizeOn(fetchFor, recordingLog(lines), { connection, inputs: INPUTS, ...sampling, signal: undefined });
  return { bodies: recorded.map((r) => r.body), lines };
}

test("OpenRouter: the arbiter posture's off is sent, so a Claude model that can switch thinking off answers within its cap", async () => {
  for (const model of ["anthropic/claude-sonnet-5", "anthropic/claude-opus-5"]) {
    const { bodies } = await sideGenBodies(hostedConnection("openrouter", model), { effort: "none", maxTokens: ARBITER_CAP });
    expect(bodies[0], model).toMatchObject({ reasoning: { effort: "none" }, max_tokens: ARBITER_CAP });
  }
});

test("OpenRouter: Sonnet 5.5 cannot switch thinking off there, so it runs at the lowest effort with room for the thinking", async () => {
  const { bodies, lines } = await sideGenBodies(hostedConnection("openrouter", "anthropic/claude-sonnet-5.5"), {
    effort: "none",
    maxTokens: ARBITER_CAP,
  });
  expect(bodies[0]?.["reasoning"]).toEqual({ effort: "low" });
  expect(bodies[0]?.["max_tokens"]).toBeGreaterThan(ARBITER_CAP + 1024);
  expect(warnedCodes(lines)).toContain("reasoning_mandatory_clamp");
});

test("OpenRouter: a Utility preset's effort is sent as chosen, and the cap makes room for it", async () => {
  const { bodies, lines } = await sideGenBodies(hostedConnection("openrouter", "anthropic/claude-sonnet-5"), { effort: "high", maxTokens: ARBITER_CAP });
  expect(bodies[0]?.["reasoning"]).toEqual({ effort: "high" });
  expect(bodies[0]?.["max_tokens"]).toBeGreaterThan(ARBITER_CAP + 4096);
  expect(warnedCodes(lines)).toEqual([]);
});

test("OpenRouter: an endpoint that refuses the off as mandatory gets one replay with no reasoning block and room to think", async () => {
  const refusal = JSON.stringify({ error: { message: "Reasoning is mandatory for this endpoint and cannot be disabled.", code: 400 } });
  const once =
    (recorded: RecordedRequest[]): typeof fetch =>
    (input, init): Promise<Response> => {
      if (recorded.length === 0) {
        recorded.push({ url: "", body: JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown> });
        return Promise.resolve(new Response(refusal, { status: 400, headers: { "content-type": "application/json" } }));
      }
      return scriptedSseFetch([COMPLETION], recorded)(input, init);
    };
  const { bodies, lines } = await sideGenBodies(hostedConnection("openrouter", "anthropic/claude-sonnet-5"), { effort: "none", maxTokens: ARBITER_CAP }, once);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toMatchObject({ reasoning: { effort: "none" }, max_tokens: ARBITER_CAP });
  expect(bodies[1]?.["reasoning"]).toBeUndefined();
  expect(bodies[1]?.["max_tokens"]).toBeGreaterThan(ARBITER_CAP);
  expect(warnedCodes(lines)).toContain("reasoning_mandatory_clamp");
});

test("OpenAI: the posture's off rides `reasoning_effort: none` where the model takes it; a mandatory model runs at its floor with room", async () => {
  const off = await sideGenBodies(hostedConnection("openai", "gpt-5.1"), { effort: "none", maxTokens: ARBITER_CAP });
  expect(off.bodies[0]).toMatchObject({ reasoning_effort: "none", max_completion_tokens: ARBITER_CAP });

  const mandatory = await sideGenBodies(hostedConnection("openai", "gpt-5-mini"), { effort: "none", maxTokens: ARBITER_CAP });
  expect(mandatory.bodies[0]?.["reasoning_effort"]).toBe("minimal");
  expect(mandatory.bodies[0]?.["max_completion_tokens"]).toBeGreaterThan(ARBITER_CAP);
  expect(warnedCodes(mandatory.lines)).toContain("reasoning_mandatory_clamp");
});
