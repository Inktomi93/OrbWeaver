// backends/v4/batch — the shared summarize/structured loop. Pinned here: the SDK's own `doGenerate`
// warnings (audit A3, batch half) reach a log line. A side-generation turn has no bus, so the ONLY place a
// provider's "I did not send that setting" can surface is the item's log — and before this it was read by
// nobody at all, on either wire.

import { runV4Batch } from "../../../../packages/inference/src/backends/v4/batch.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeResolved } from "../../_support.ts";
import { generationCapability } from "../_hosted-support.ts";

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

// The SDK's own types, DERIVED from the runner's signature — `tests/` has no `@ai-sdk/provider` dependency
// (the package owns the SDK), and deriving keeps the fake honest against a version bump.
type BatchRun = Parameters<typeof runV4Batch>[0];
type FakeModel = BatchRun["model"];
type GenerateResult = Awaited<ReturnType<FakeModel["doGenerate"]>>;
type SdkWarning = GenerateResult["warnings"][number];

function fakeModel(warnings: readonly SdkWarning[]): FakeModel {
  const result: GenerateResult = {
    content: [{ type: "text", text: "a summary" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [...warnings],
  };
  return {
    specificationVersion: "v4",
    provider: "test",
    modelId: "m",
    supportedUrls: {},
    doGenerate: () => Promise.resolve(result),
    doStream: () => Promise.reject(new Error("the batch runner never streams")),
  };
}

test("an SDK warning on a batch item is surfaced as its own log line, never swallowed", async () => {
  const lines: LogLine[] = [];
  const connection = fakeResolved({ task: "summarize", providerId: "anthropic", model: "claude-opus-4-5-20251101", capability: generationCapability() });
  await runV4Batch({
    req: {
      connection,
      task: "summarize",
      inputs: [{ systemPrompt: "Summarize.", userPrompt: "A long text." }],
      responseFormat: undefined,
      sampling: {},
      signal: undefined,
    },
    model: fakeModel([
      { type: "unsupported", feature: "frequencyPenalty" },
      { type: "compatibility", feature: "thinking.budgetTokens", details: "defaulted to 1024" },
    ]),
    options: {},
    label: "test batch",
    concurrency: 1,
    now: () => 0,
    log: recordingLog(lines),
    normalize: (bytes) => Promise.resolve({ bytes, mediaType: "image/png" }),
    refusalOf: () => "",
  });
  const sdkLines = lines.filter((line) => line.fields["event"] === "provider.sdk-warning");
  expect(sdkLines.map((line) => line.fields["code"])).toEqual(["sdk_unsupported_setting", "sdk_compatibility"]);
  expect(String(sdkLines[0]?.fields["reason"])).toContain("frequencyPenalty");
});
