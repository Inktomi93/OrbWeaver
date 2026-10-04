// backends/anthropic-messages/batch — the `summarize` + `structured` tasks on the DIRECT Anthropic wire. The
// pins are on the WIRE BODY the SDK produced from the option slice this file builds, over the REAL curated
// capability fold, because both #2575 defects are request shapes a current Claude model rejects with a 400:
//   • the side-generation posture turned thinking OFF (`thinking: {type:"disabled"}`) on EVERY call, which
//     Fable 5.1 / Mythos 5.1 / Opus 5.5 refuse — reasoning is mandatory there, so the posture must go through
//     the same mandatory clamp the chat funnel runs (lowest effort, thinking left adaptive);
//   • a forced named tool, which the same three refuse — the structured plan carries the payload on
//     `output_config.format` there, and forces a tool only where the model has no structured output and can be forced.
// Each defect pin carries its planted control: the models that accept the old shape keep it byte-for-byte.

import type { ProviderId } from "@orb/contracts/inference";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { castId } from "@orb/kit/ids";
import type { AnthropicBatchDeps } from "../../../../packages/inference/src/backends/anthropic-messages/batch.ts";
import { runAnthropicStructured, runAnthropicSummarize } from "../../../../packages/inference/src/backends/anthropic-messages/batch.ts";
import { passthroughImageNormalizer } from "../../../../packages/inference/src/backends/kit/image-normalize.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { wireSchema } from "../../../support/wire-ready.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { scriptedJsonFetch } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
/** The models whose documented request surface refuses BOTH old shapes (thinking disabled, forced tool). */
const STRICT_MODELS = ["claude-fable-5-1", "claude-mythos-5-1", "claude-opus-5-5"] as const;
const MESSAGE_BODY = JSON.stringify({
  id: "msg_batch",
  type: "message",
  role: "assistant",
  model: "claude",
  content: [{ type: "text", text: '{"ok":true}' }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 5, output_tokens: 3 },
});
const FORMAT: ResponseFormat = {
  name: "row",
  schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }),
};

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

function capabilityOf(model: string): ReturnType<typeof synthesizeCapability>["capability"] {
  return synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model, providerId: castId<ProviderId>("anthropic"), wire: "anthropic-messages", api: "anthropic-messages" }),
  }).capability;
}

function connectionFor<T extends "summarize" | "structured">(task: T, model: string): ReturnType<typeof fakeResolved<T>> {
  return fakeResolved({
    task,
    providerId: "anthropic",
    model,
    capability: capabilityOf(model),
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
}

function batchDeps(recorded: RecordedRequest[], lines: LogLine[]): AnthropicBatchDeps {
  return { now: () => NOW, log: recordingLog(lines), transport: { fetch: scriptedJsonFetch([MESSAGE_BODY], recorded) }, normalize: passthroughImageNormalizer };
}

const INPUTS = [{ systemPrompt: "Summarize.", userPrompt: "A long exchange." }] as const;

async function summarizeBody(model: string): Promise<{ readonly body: Record<string, unknown>; readonly lines: readonly LogLine[] }> {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  await runAnthropicSummarize({ connection: connectionFor("summarize", model), inputs: INPUTS, signal: undefined }, batchDeps(recorded, lines));
  return { body: recorded[0]?.body ?? {}, lines };
}

async function structuredBody(model: string): Promise<{ readonly body: Record<string, unknown>; readonly lines: readonly LogLine[] }> {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  await runAnthropicStructured(
    { connection: connectionFor("structured", model), inputs: INPUTS, responseFormat: FORMAT, signal: undefined },
    batchDeps(recorded, lines),
  );
  return { body: recorded[0]?.body ?? {}, lines };
}

/** The structured body on a model whose capability states no structured output (tools only). */
async function structuredBodyWithout(model: string): Promise<{ readonly body: Record<string, unknown> }> {
  const base = connectionFor("structured", model);
  if (base.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  const generation = { ...base.capability.generation, output: { ...base.capability.generation.output, structured: false } };
  const recorded: RecordedRequest[] = [];
  await runAnthropicStructured(
    { connection: { ...base, capability: { kind: "generation", generation } }, inputs: INPUTS, responseFormat: FORMAT, signal: undefined },
    batchDeps(recorded, []),
  );
  return { body: recorded[0]?.body ?? {} };
}

function warnedCodes(lines: readonly LogLine[]): readonly unknown[] {
  return lines.filter((line) => line.level === "warn" && line.fields["event"] === "provider.resolve-warning").map((line) => line.fields["code"]);
}

test("#2575: a mandatory-reasoning model's summarize never sends `thinking: disabled` — it runs at the lowest effort", async () => {
  for (const model of STRICT_MODELS) {
    const { body, lines } = await summarizeBody(model);
    expect(body["thinking"], model).not.toMatchObject({ type: "disabled" });
    expect(body["output_config"], model).toMatchObject({ effort: "low" });
    expect(warnedCodes(lines), model).toContain("reasoning_mandatory_clamp");
  }
});

test("#2575 (control): a model that can switch reasoning off keeps the side-generation posture — thinking disabled, no effort", async () => {
  for (const model of ["claude-opus-5", "claude-sonnet-4-6"]) {
    const { body, lines } = await summarizeBody(model);
    expect(body["thinking"], model).toEqual({ type: "disabled" });
    expect(body["output_config"], model).toBeUndefined();
    expect(warnedCodes(lines), model).toEqual([]);
  }
});

test("D299: a role preset's effort governs side-generation reasoning in place of the off posture", async () => {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  await runAnthropicSummarize(
    { connection: connectionFor("summarize", "claude-opus-5"), inputs: INPUTS, effort: "high", signal: undefined },
    batchDeps(recorded, lines),
  );
  const body = recorded[0]?.body ?? {};
  expect(body["thinking"]).not.toEqual({ type: "disabled" });
  expect(body["output_config"]).toMatchObject({ effort: "high" });
});

const ARBITER_CAP = 128;

async function cappedBody(model: string, effort: "none" | "high" | undefined): Promise<Record<string, unknown>> {
  const recorded: RecordedRequest[] = [];
  await runAnthropicSummarize(
    { connection: connectionFor("summarize", model), inputs: INPUTS, ...(effort !== undefined ? { effort } : {}), maxTokens: ARBITER_CAP, signal: undefined },
    batchDeps(recorded, []),
  );
  return recorded[0]?.body ?? {};
}

test("thinking is paid out of max_tokens: a preset's effort, or a mandatory clamp, grows the cap past the visible answer", async () => {
  const chosen = await cappedBody("claude-opus-5", "high");
  expect(chosen["output_config"]).toMatchObject({ effort: "high" });
  expect(chosen["max_tokens"]).toBeGreaterThan(ARBITER_CAP + 4096);
  const clamped = await cappedBody("claude-opus-5-5", "none");
  expect(clamped["output_config"]).toMatchObject({ effort: "low" });
  expect(clamped["max_tokens"]).toBeGreaterThan(ARBITER_CAP + 1024);
});

test("an off posture keeps the visible cap: no thinking runs, so none is paid for", async () => {
  const off = await cappedBody("claude-opus-5", "none");
  expect(off["thinking"]).toEqual({ type: "disabled" });
  expect(off["max_tokens"]).toBe(ARBITER_CAP);
});

const BUDGET_MODELS = ["claude-haiku-4-5", "claude-sonnet-4-5"] as const;
const PRESET_BUDGET = 2048;

async function presetBody(
  model: string,
  preset: { readonly effort?: "low" | "high"; readonly thinkingBudgetTokens?: number },
): Promise<Record<string, unknown>> {
  const recorded: RecordedRequest[] = [];
  await runAnthropicSummarize(
    { connection: connectionFor("summarize", model), inputs: INPUTS, ...preset, maxTokens: ARBITER_CAP, signal: undefined },
    batchDeps(recorded, []),
  );
  return recorded[0]?.body ?? {};
}

function budgetOf(body: Record<string, unknown>): number {
  const thinking = body["thinking"];
  const budget = typeof thinking === "object" && thinking !== null && "budget_tokens" in thinking ? thinking.budget_tokens : undefined;
  if (typeof budget !== "number") {
    throw new Error(`no budget_tokens on the wire: ${JSON.stringify(thinking)}`);
  }
  return budget;
}

test("a Utility preset that sets only a thinking budget runs extended thinking at that budget, with room for it", async () => {
  for (const model of BUDGET_MODELS) {
    const body = await presetBody(model, { thinkingBudgetTokens: PRESET_BUDGET });
    expect(body["thinking"], model).toEqual({ type: "enabled", budget_tokens: PRESET_BUDGET });
    expect(body["max_tokens"], model).toBe(ARBITER_CAP + PRESET_BUDGET);
  }
});

test("an `enabled` thinking budget is added to max_tokens once: the SDK adds it, the funnel does not add it again", async () => {
  for (const model of BUDGET_MODELS) {
    const body = await presetBody(model, { effort: "low" });
    expect(body["max_tokens"], model).toBe(ARBITER_CAP + budgetOf(body));
  }
});

test("an adaptive model's thinking room is the funnel's own allowance, and a budget-only preset runs as the effort that covers it", async () => {
  const chosen = await presetBody("claude-opus-5", { effort: "high" });
  // The `high` share of the allowance range: an adaptive call sends no budget, so the SDK adds nothing.
  expect(chosen["max_tokens"]).toBe(ARBITER_CAP + 10_159);
  const budgeted = await presetBody("claude-opus-5", { thinkingBudgetTokens: PRESET_BUDGET });
  expect(budgeted["output_config"]).toMatchObject({ effort: "low" });
  expect(budgeted["max_tokens"]).toBeGreaterThanOrEqual(ARBITER_CAP + PRESET_BUDGET);
});

test("a model whose off is `between_tools` keeps the side-generation posture off with that spelling, never a clamp", async () => {
  const { body, lines } = await summarizeBody("claude-sonnet-5-5");
  expect(body["thinking"]).toEqual({ type: "between_tools" });
  expect(body["output_config"]).toBeUndefined();
  // No warning of any kind: the SDK also rewrites a `disabled` on this id, and says so, so a quiet log is what
  // proves the request was spelled right before the SDK saw it.
  expect(lines.filter((line) => line.level === "warn").map((line) => line.fields["event"])).toEqual([]);
});

test("#2575: a structured call on a current Claude model rides output_config.format, so no forced tool reaches a model that refuses one", async () => {
  for (const model of [...STRICT_MODELS, "claude-opus-5", "claude-fable-5"]) {
    const { body, lines } = await structuredBody(model);
    expect(body["output_config"], model).toMatchObject({ format: { type: "json_schema" } });
    expect(body["tools"], model).toBeUndefined();
    expect(body["tool_choice"], model).toBeUndefined();
    expect(warnedCodes(lines), model).not.toContain("tool_choice_downgraded");
  }
});

test("#2575: with no structured output stated, the plan forces the one tool where the model can be forced, and offers it where not", async () => {
  const forcible = await structuredBodyWithout("claude-opus-5");
  expect(forcible.body["tool_choice"]).toMatchObject({ type: "tool", name: "row", disable_parallel_tool_use: true });
  const refusing = await structuredBodyWithout("claude-fable-5-1");
  expect(refusing.body["tool_choice"]).toMatchObject({ type: "auto", disable_parallel_tool_use: true });
  expect(refusing.body["tools"]).toMatchObject([{ name: "row" }]);
  expect((refusing.body["output_config"] ?? {}) as Record<string, unknown>).not.toHaveProperty("format");
});

const OVER_LIMIT: ResponseFormat = {
  name: "row",
  schema: wireSchema({
    type: "object",
    properties: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${String(i)}`, { type: "string" }])),
    required: [],
    additionalProperties: false,
  }),
};
const ONE_OF: ResponseFormat = {
  name: "row",
  schema: wireSchema({ type: "object", properties: { pick: { oneOf: [{ type: "string" }, { type: "number" }] } }, required: ["pick"] }),
};

/** A structured run on `model` with its capability's tools removed, so the native format is the only vehicle. */
async function structuredFailureWithoutTools(
  model: string,
  responseFormat: ResponseFormat,
): Promise<{ readonly failure: unknown; readonly recorded: readonly RecordedRequest[] }> {
  const base = connectionFor("structured", model);
  if (base.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  const { tools: _tools, ...generation } = base.capability.generation;
  const recorded: RecordedRequest[] = [];
  const run = async (): Promise<unknown> =>
    runAnthropicStructured(
      { connection: { ...base, capability: { kind: "generation", generation } }, inputs: INPUTS, responseFormat, signal: undefined },
      batchDeps(recorded, []),
    );
  return { failure: await run().catch((err: unknown) => err), recorded };
}

test("an over-limit schema on a model with only the native format is refused before any request, with the typed violation", async () => {
  const { failure, recorded } = await structuredFailureWithoutTools("claude-sonnet-5-5", OVER_LIMIT);
  expect(recorded).toEqual([]);
  expect(failure).toMatchObject({
    kind: "invalid",
    detail: "schema_rejected",
    violations: [{ kind: "optional-props", count: 30, limit: 24, vehicle: "response-format" }],
  });
});

test("an over-limit schema on a model that takes tools rides one offered tool, which no grammar compiles", async () => {
  const recorded: RecordedRequest[] = [];
  await runAnthropicStructured(
    { connection: connectionFor("structured", "claude-sonnet-5-5"), inputs: INPUTS, responseFormat: OVER_LIMIT, signal: undefined },
    batchDeps(recorded, []),
  );
  expect(recorded[0]?.body["tool_choice"]).toMatchObject({ type: "auto", disable_parallel_tool_use: true });
  expect((recorded[0]?.body["output_config"] ?? {}) as Record<string, unknown>).not.toHaveProperty("format");
});

test("a oneOf schema is refused with refused-keyword before any request, on every vehicle", async () => {
  const { failure, recorded } = await structuredFailureWithoutTools("claude-sonnet-5-5", ONE_OF);
  expect(recorded).toEqual([]);
  expect(failure).toMatchObject({ detail: "schema_rejected", violations: [{ kind: "refused-keyword", keyword: "oneOf", path: "pick" }] });
  const withTools: RecordedRequest[] = [];
  const refusedEverywhere = await (async (): Promise<unknown> =>
    runAnthropicStructured(
      { connection: connectionFor("structured", "claude-sonnet-5-5"), inputs: INPUTS, responseFormat: ONE_OF, signal: undefined },
      batchDeps(withTools, []),
    ))().catch((err: unknown) => err);
  expect(withTools).toEqual([]);
  expect(refusedEverywhere).toMatchObject({ detail: "schema_rejected" });
});
