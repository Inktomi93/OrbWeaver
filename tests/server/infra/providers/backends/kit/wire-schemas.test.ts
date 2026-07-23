// backends/kit/wire-schemas — lenient parses keep unknown fields, throw on a broken shape; the extractors
// share ONE extraction (string vs content-parts; the reasoningDetails-over-reasoning channel preference).

import { extractChatReasoning, extractChatReply, parseChatCompletionResult } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

describe("parseChatCompletionResult — lenient wire parse", () => {
  test("parses a realistic body and KEEPS unknown fields (.loose)", () => {
    const parsed = parseChatCompletionResult({
      id: "gen-1",
      choices: [{ message: { content: "hi", role: "assistant" }, finishReason: "stop" }],
      usage: { promptTokens: 10, completionTokens: 5, cost: 0.001, isByok: false },
      somethingNew: { nested: true },
    });
    expect(parsed.choices?.[0]?.finishReason).toBe("stop");
    expect(parsed.usage?.promptTokens).toBe(10);
    // The unknown top-level field survives the loose parse.
    expect((parsed as Record<string, unknown>)["somethingNew"]).toEqual({ nested: true });
  });

  test("throws on a broken shape (a wrong-typed known field)", () => {
    expect(() => parseChatCompletionResult({ usage: { promptTokens: "not-a-number" } })).toThrow();
  });
});

describe("extractChatReply", () => {
  test("plain string content is trimmed", () => {
    expect(extractChatReply({ choices: [{ message: { content: "  hello  " } }] })).toBe("hello");
  });

  test("content-parts array joins the text parts", () => {
    const view = {
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "foo " },
              { type: "text", text: "bar" },
            ],
          },
        },
      ],
    };
    expect(extractChatReply(view)).toBe("foo bar");
  });

  test("absent content → empty string", () => {
    expect(extractChatReply({})).toBe("");
  });
});

describe("extractChatReasoning — channel preference", () => {
  test("prefers reasoningDetails text and SKIPS reasoning.encrypted entries", () => {
    const view = {
      choices: [
        {
          message: {
            reasoning: "legacy CoT",
            reasoningDetails: [
              { type: "reasoning.text", text: "structured " },
              { type: "reasoning.encrypted", text: "SHOULD-NOT-APPEAR" },
              { type: "reasoning.text", text: "CoT" },
            ],
          },
        },
      ],
    };
    expect(extractChatReasoning(view)).toBe("structured CoT");
  });

  test("falls back to the legacy reasoning string when no details carry text", () => {
    const view = {
      choices: [{ message: { reasoning: "only legacy", reasoningDetails: [] } }],
    };
    expect(extractChatReasoning(view)).toBe("only legacy");
  });

  test("empty when neither channel is present", () => {
    expect(extractChatReasoning({ choices: [{ message: { content: "x" } }] })).toBe("");
  });
});
