// backends/anthropic-messages/batch — the `summarize` + `structured` tasks on the DIRECT Anthropic wire. The
// pins are on the WIRE BODY the SDK produced from the option slice this file builds, over the REAL curated
// capability fold, because both #2575 defects are request shapes a current Claude model rejects with a 400:
//   • the side-generation posture turned thinking OFF (`thinking: {type:"disabled"}`) on EVERY call, which
//     Fable 5.1 / Mythos 5.1 / Opus 5.5 refuse — reasoning is mandatory there, so the posture must go through
//     the same mandatory clamp the chat funnel runs (lowest effort, thinking left adaptive);
//   • a `forced-tool` structured vehicle sends `tool_choice: {type:"tool"}`, which the same three refuse — the
//     wire sends `auto` over the one tool instead (parallel use still off = at most one call), and says so.
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
  vehicle: "forced-tool",
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

test("#2575: a forced-tool structured call on a model that rejects forced tool use goes out as `auto`, loudly", async () => {
  for (const model of STRICT_MODELS) {
    const { body, lines } = await structuredBody(model);
    expect(body["tool_choice"], model).toMatchObject({ type: "auto", disable_parallel_tool_use: true });
    expect(body["tools"], model).toMatchObject([{ name: "row" }]);
    expect(warnedCodes(lines), model).toContain("tool_choice_downgraded");
  }
});

test("#2575 (control): the models that accept forced tool use keep the forced tool", async () => {
  for (const model of ["claude-opus-5", "claude-fable-5"]) {
    const { body, lines } = await structuredBody(model);
    expect(body["tool_choice"], model).toMatchObject({ type: "tool", name: "row" });
    expect(warnedCodes(lines), model).not.toContain("tool_choice_downgraded");
  }
});
