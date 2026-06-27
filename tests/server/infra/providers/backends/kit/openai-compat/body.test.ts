// biome-ignore-all lint/style/useNamingConvention: these assertions check OpenAI-compatible wire field
// names (snake_case) + HTTP header names (PascalCase) verbatim.
//
// backends/kit/openai-compat/body — snake_case wire field emission (only when set), header redaction (by
// name), and the include/exclude body transform (exclude wins, applied last).

import {
  applyIncludeExclude,
  buildOpenAiSamplingFields,
  redactHeaders,
} from "@orb/server/infra/providers/backends/kit/openai-compat";
import { describe, expect, test } from "vitest";

describe("buildOpenAiSamplingFields", () => {
  test("emits only the set knobs, in snake_case wire form", () => {
    expect(
      buildOpenAiSamplingFields({ temperature: 0.7, topP: 0.9, maxTokens: 256, seed: 42 }),
    ).toEqual({ temperature: 0.7, top_p: 0.9, max_tokens: 256, seed: 42 });
  });

  test("an empty input yields an empty body (no null/0 defaults)", () => {
    expect(buildOpenAiSamplingFields({})).toEqual({});
  });

  test("maps every knob to its wire name", () => {
    expect(
      buildOpenAiSamplingFields({
        topK: 40,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        repetitionPenalty: 1.1,
        logitBias: { "123": -1 },
        stop: ["END"],
      }),
    ).toEqual({
      top_k: 40,
      frequency_penalty: 0.1,
      presence_penalty: 0.2,
      repetition_penalty: 1.1,
      logit_bias: { "123": -1 },
      stop: ["END"],
    });
  });
});

describe("redactHeaders", () => {
  test("redacts secret-named headers by NAME, passes the rest through", () => {
    expect(
      redactHeaders({
        Authorization: "Bearer sk-secret",
        "x-api-key": "key-123",
        "x-session-token": "tok",
        "content-type": "application/json",
        "x-title": "orbweaver",
      }),
    ).toEqual({
      Authorization: "«redacted»",
      "x-api-key": "«redacted»",
      "x-session-token": "«redacted»",
      "content-type": "application/json",
      "x-title": "orbweaver",
    });
  });
});

describe("applyIncludeExclude", () => {
  test("merges includeBody over the base (user wins)", () => {
    expect(
      applyIncludeExclude({ model: "m", temperature: 1 }, { temperature: 0.5, top_p: 0.8 }, null),
    ).toEqual({ model: "m", temperature: 0.5, top_p: 0.8 });
  });

  test("excludeBody strips keys LAST — even one includeBody just added", () => {
    expect(
      applyIncludeExclude({ model: "m", reasoning: { effort: "high" } }, { extra: 1 }, [
        "reasoning",
        "extra",
      ]),
    ).toEqual({ model: "m" });
  });

  test("no transforms → the base, merged", () => {
    expect(applyIncludeExclude({ a: 1 }, null, null)).toEqual({ a: 1 });
    expect(applyIncludeExclude({ a: 1 }, null, [])).toEqual({ a: 1 });
  });
});
