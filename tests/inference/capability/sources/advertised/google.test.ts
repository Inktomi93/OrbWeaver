import { advertisedFromGoogle } from "../../../../../packages/inference/src/capability/sources/advertised/google.ts";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("native advertised thinking, token limits and sampling exclusions override curated facts while declared wins", () => {
  const curated = curatedRows({ model: "gemini-3-flash-preview", providerId: "google", wire: "google-generative-ai" });
  const advertised = advertisedFromGoogle(
    { contextLength: 99_999, maxCompletionTokens: 1234, google: { thinking: false, maxTemperature: 1, topP: 0.95 } },
    curated,
  );
  const native = synthesizeCapability("generation", "google", { curated, advertised }).capability;
  expect(native).toMatchObject({
    generation: {
      context: { window: 99_999 },
      output: { maxTokens: { max: 1234 } },
      reasoning: { mode: "none", enabled: false },
      sampling: { temperature: { max: 1 }, frequencyPenalty: { min: -2, max: 2 } },
    },
  });
  if (native.kind !== "generation") {
    throw new Error("Expected a generation capability");
  }
  expect(native.generation.sampling).not.toHaveProperty("topK");
  const declared = synthesizeCapability("generation", "google", {
    curated,
    advertised,
    declared: { generation: { reasoning: { mode: "effort", enabled: true }, context: { window: 7777 } } },
  }).capability;
  expect(declared).toMatchObject({ generation: { reasoning: { enabled: true }, context: { window: 7777 } } });
});
