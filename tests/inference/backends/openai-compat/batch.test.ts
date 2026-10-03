// backends/openai-compat/batch — the `structured` task's forced-tool vehicle on the openai-compat wire. The pin
// is the WIRE BODY: a model whose capability refuses forced tool use gets `auto` over the one tool (parallel
// calls still off), logged once per batch; every row that states no refusal — a vLLM/Qwen endpoint, Opus 5 on
// OpenRouter — keeps the forced function choice byte-for-byte.

import type { ProviderId } from "@orb/contracts/inference";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { stateRoundChangesSchema } from "@orb/contracts/rpg";
import { castId } from "@orb/kit/ids";
import { passthroughImageNormalizer } from "../../../../packages/inference/src/backends/kit/image-normalize.ts";
import type { BatchDeps } from "../../../../packages/inference/src/backends/openai-compat/batch.ts";
import { runOpenAiCompatStructured, runOpenAiCompatSummarize } from "../../../../packages/inference/src/backends/openai-compat/batch.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { wireSchema } from "../../../support/wire-ready.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, scriptedJsonFetch } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const APP = { name: "orbweaver-test", url: "http://localhost:0" };
const COMPLETION = JSON.stringify({
  id: "gen-batch",
  object: "chat.completion",
  created: 1_700_000_000,
  model: "m",
  choices: [{ index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
});
const FORMAT: ResponseFormat = {
  name: "row",
  schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }),
  vehicle: "forced-tool",
};
const INPUTS = [{ systemPrompt: "Extract.", userPrompt: "One row." }] as const;

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
  const deps: BatchDeps = {
    now: () => NOW,
    log: recordingLog(lines),
    transport: { fetch: scriptedJsonFetch([COMPLETION], recorded), app: APP },
    normalize: passthroughImageNormalizer,
  };
  await runOpenAiCompatStructured({ connection, inputs: INPUTS, responseFormat: format, signal: undefined }, deps);
  return { body: recorded[0]?.body ?? {}, lines };
}

function warnedCodes(lines: readonly LogLine[]): readonly unknown[] {
  return lines.filter((line) => line.level === "warn" && line.fields["event"] === "provider.resolve-warning").map((line) => line.fields["code"]);
}

test("#2575: a forced-tool structured call on OpenRouter + a forced-tool-rejecting model goes out as `auto`, logged", async () => {
  for (const model of ["anthropic/claude-fable-5.1", "anthropic/claude-opus-5.5"]) {
    const { body, lines } = await structuredBody(orConnection(model));
    expect(body["tool_choice"], model).toBe("auto");
    expect(body["tools"], model).toMatchObject([{ function: { name: "row" } }]);
    expect(body["parallel_tool_calls"], model).toBe(false);
    expect(warnedCodes(lines), model).toEqual(["tool_choice_downgraded"]);
  }
});

test("#2575 (controls): Opus 5 on OpenRouter and a vLLM endpoint keep the forced function choice", async () => {
  for (const connection of [orConnection("anthropic/claude-opus-5"), vllmConnection()]) {
    const { body, lines } = await structuredBody(connection);
    expect(body["tool_choice"], connection.model).toMatchObject({ type: "function", function: { name: "row" } });
    expect(warnedCodes(lines), connection.model).toEqual([]);
  }
});

test("0511: the rpg structured state round on a KoboldCpp row rides `response_format` json_schema, never a tool", async () => {
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

  const { body } = await structuredBody(kobold, { name: "rpg_state_changes", schema, vehicle: "response-format" });

  expect(body["response_format"]).toEqual({ type: "json_schema", json_schema: { name: "rpg_state_changes", schema, strict: false } });
  expect(body).not.toHaveProperty("tools");
  expect(body).not.toHaveProperty("tool_choice");
});

test("D299: a role preset's seed and stop reach a summarize body through the task gate; an unsendable effort is named", async () => {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  const connection = fakeResolved({
    task: "summarize",
    providerId: "vllm",
    model: "Qwen/Qwen3-8B",
    capability: generationCapability({ sampling: { temperature: { min: 0, max: 2 }, seed: true, stop: true } }),
    baseUrl: "http://127.0.0.1:8000/v1",
  });
  const deps: BatchDeps = {
    now: () => NOW,
    log: recordingLog(lines),
    transport: { fetch: scriptedJsonFetch([COMPLETION], recorded), app: APP },
    normalize: passthroughImageNormalizer,
  };
  await runOpenAiCompatSummarize(
    { connection, inputs: INPUTS, temperature: 0.5, seed: 7, stop: ["END"], effort: "high", maxTokens: 64, signal: undefined },
    deps,
  );
  const body = recorded[0]?.body ?? {};
  expect(body).toMatchObject({ temperature: 0.5, seed: 7, stop: ["END"], max_tokens: 64 });
  expect(warnedCodes(lines)).toEqual(["effort_dropped"]);
});
