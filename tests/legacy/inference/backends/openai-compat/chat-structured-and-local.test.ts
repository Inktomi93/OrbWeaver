// backends/openai-compat/chat — the llama.cpp tool refusal and the structured plan on the chat path.

import type { ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { fakeApiKeySecret, fakeResolved, wireSchema } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, scriptedSseFetch } from "../_hosted-support.ts";
import type { OpenAiCompatChatRequest } from "./_chat-support.ts";
import { curatedRows, orRequest, ProviderError, runOpenAiCompatChatTurn, sentBody, synthesizeCapability, turnDeps } from "./_chat-support.ts";

// ── llama.cpp without --jinja: the server reports template tool support and refuses tools[] ─────────────
// `/props` emits `chat_template_caps` even under `--no-jinja`, so the reader states tools; the server's 400 is
// the first signal, and it must tell the user what to change rather than echo an upstream flag name.
test("a llama.cpp 'tools param requires --jinja flag' 400 reaches the caller as a readable, typed refusal", async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { code: 400, message: "tools param requires --jinja flag", type: "invalid_request_error" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
  const connection = fakeResolved({
    task: "chat",
    providerId: "llama-cpp",
    model: "qwen2.5-0.5b",
    capability: generationCapability({ tools: { parallel: true } }),
    baseUrl: "http://127.0.0.1:8080/v1",
    secret: fakeApiKeySecret("not-a-real-key"),
  });
  const failure = await runOpenAiCompatChatTurn(orRequest({ connection }), turnDeps(fetchImpl)).then(
    () => null,
    (err: unknown) => err,
  );
  expect(failure).toBeInstanceOf(ProviderError);
  const error = failure as ProviderError;
  expect(error.kind).toBe("invalid");
  expect(error.retryable).toBe(false);
  expect(error.message).toContain(
    "this llama.cpp server runs without --jinja, so tool calls are off; start it with --jinja, or under Advanced press Override on tool calls and choose no",
  );
  // PLANTED CONTROL: the same 400 on a turn that carried no tools is an ordinary upstream refusal.
  const bare = await runOpenAiCompatChatTurn(orRequest({ connection, tools: undefined }), turnDeps(fetchImpl)).then(
    () => null,
    (err: unknown) => err,
  );
  expect((bare as ProviderError).message).not.toContain("tool calls are off");
});

// ── the structured plan on the chat path ─────────────────────────────────────────────────────────────────────

/** A schema with a number bound, a pattern-free string and the projector's dialect key, so each mode's scrub shows. */
const PLANNED_FORMAT = {
  name: "row",
  schema: wireSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { ratio: { type: "number", minimum: 0, maximum: 1 }, count: { type: "integer", minimum: 1 } },
    required: ["ratio", "count"],
  }),
};

function localRequest(providerId: string, capability = generationCapability()): OpenAiCompatChatRequest {
  const connection = fakeResolved({ task: "chat", providerId, model: "m", capability, baseUrl: "http://127.0.0.1:1/v1" });
  return orRequest({ connection, tools: undefined, responseFormat: PLANNED_FORMAT });
}

test("a llama.cpp row's response_format carries the gbnf scrub: a number's range becomes its note, an integer's stays", async () => {
  const body = await sentBody(localRequest("llama-cpp"));
  const format = body["response_format"] as { readonly json_schema: { readonly schema: Record<string, unknown>; readonly strict: unknown } };
  expect(format.json_schema.strict).toBe(false);
  expect(format.json_schema.schema).not.toHaveProperty("$schema");
  expect(format.json_schema.schema["additionalProperties"]).toBe(false);
  const props = format.json_schema.schema["properties"] as Record<string, Record<string, unknown>>;
  expect(props["ratio"]).toEqual({ type: "number", description: "[Constraints: minimum: 0, maximum: 1]" });
  expect(props["count"]).toEqual({ type: "integer", minimum: 1 });
});

test("an Ollama native body's `format` holds the same gbnf-scrubbed schema", async () => {
  const llama = await sentBody(localRequest("llama-cpp"));
  // The native route reads Ollama's own NDJSON answer, which this OpenAI stream is not: only the request matters here.
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(localRequest("ollama"), turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded))).catch(() => undefined);
  const llamaSchema = (llama["response_format"] as { readonly json_schema: { readonly schema: unknown } }).json_schema.schema;
  expect(recorded[0]?.body["format"]).toEqual(llamaSchema);
});

test("a Claude id over OpenRouter past the union ceiling rides one offered tool; with no tools it is refused before fetch", async () => {
  const catalog = curatedRows({
    model: "anthropic/claude-sonnet-5.5",
    providerId: castId<ProviderId>("openrouter"),
    wire: "openai-compat",
    api: "chat-completions",
  });
  const { capability } = synthesizeCapability("generation", "anthropic", { curated: catalog });
  const wide = {
    name: "wide",
    schema: wireSchema({
      type: "object",
      properties: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`f${String(i)}`, { type: "string" }])),
      required: [],
    }),
  };
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5.5",
    capability,
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const offered = await sentBody(orRequest({ connection, tools: undefined, responseFormat: wide }));
  expect(offered).not.toHaveProperty("response_format");
  expect(offered["tool_choice"]).toBe("auto");
  expect(offered["tools"]).toMatchObject([{ function: { name: "wide" } }]);

  if (capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  const { tools: _tools, ...noTools } = capability.generation;
  const recorded: RecordedRequest[] = [];
  const failure = await runOpenAiCompatChatTurn(
    orRequest({ connection: { ...connection, capability: { kind: "generation", generation: noTools } }, tools: undefined, responseFormat: wide }),
    turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)),
  ).catch((err: unknown) => err);
  expect(recorded).toEqual([]);
  expect(failure).toMatchObject({ detail: "schema_rejected", violations: [{ kind: "union-props", count: 20, limit: 16 }] });
});

test("a structured chat turn under strict-compatible answers with the reply normalized at the reshaped paths only", async () => {
  const format = {
    name: "row",
    schema: wireSchema({
      type: "object",
      properties: { verdict: { anyOf: [{ type: "string" }, { type: "null" }] }, note: { type: "string" } },
      required: ["verdict"],
    }),
  };
  const connection = fakeResolved({
    task: "chat",
    providerId: "openai",
    model: "gpt-5.5",
    capability: generationCapability(),
    baseUrl: "http://127.0.0.1:1/v1",
  });
  const turn = await runOpenAiCompatChatTurn(
    orRequest({ connection, tools: undefined, responseFormat: format }),
    turnDeps(scriptedSseFetch([openAiTextStream('{"verdict":null,"note":null}')], [])),
  );
  expect(JSON.parse(turn.reply)).toEqual({ verdict: null });
});
