// CONTRACT: the openrouter SDK stream-chunk ↔ kit-chunk field mapping (R3 — test-quality-review §2). The
// sibling runner tests hand-roll SDK chunk objects with `as any` (a fabricated cast that survives an SDK
// field rename SILENTLY — the "source changed, tests never knew" hole). This test closes it WITHOUT the
// dep-boundary violation of importing `@openrouter/sdk` into the test root: it builds each fixture as the
// reshaper's OWN input type — `Parameters<typeof reshapeChatStreamChunk>[0]`, i.e. the SDK `ChatStreamChunk`
// reached through `@orb/server`'s import graph — and pins the literal with `satisfies` (NO `as`-cast). An
// `@openrouter/sdk` bump that renames a chunk field flows into that parameter type and BREAKS the `satisfies`
// (a now-unknown key / a missing required one) at typecheck, and the mapping asserts below break at runtime —
// either way the desync FAILS HERE FIRST, before the runner's fixtures drift silently.

import { describe } from "vitest";
import { reshapeChatStreamChunk } from "../../../../../../../../packages/server/src/infra/providers/backends/openrouter/runners/chat/shared.ts";
import { expect, test } from "../../../../../../../support/fixtures.ts";

/** The reshaper's input IS the SDK `ChatStreamChunk` — bound here via `Parameters` so a fixture is typed by
 *  the SDK shape without importing `@openrouter/sdk` across the test-root dependency boundary. */
type SdkChunk = Parameters<typeof reshapeChatStreamChunk>[0];

describe("openrouter reshapeChatStreamChunk — SDK chunk field-mapping contract", () => {
  test("a realistic text+reasoning+tool-call chunk maps every field into the kit chunk shape", () => {
    const chunk = {
      id: "gen-1",
      object: "chat.completion.chunk",
      created: 1_700_000_000,
      model: "anthropic/claude-3.5-sonnet",
      choices: [
        {
          index: 0,
          finishReason: "tool_calls",
          delta: {
            role: "assistant",
            content: "partial",
            reasoning: "let me think",
            reasoningDetails: [{ type: "reasoning.text", text: "chain" }],
            toolCalls: [
              {
                index: 0,
                id: "call_a",
                type: "function",
                function: { name: "lookup", arguments: '{"q":' },
              },
            ],
          },
        },
      ],
    } satisfies SdkChunk;

    const out = reshapeChatStreamChunk(chunk);
    const delta = out.choices[0]?.delta;

    expect(out.choices[0]?.finishReason).toBe("tool_calls");
    expect(delta?.content).toBe("partial");
    expect(delta?.reasoning).toBe("let me think");
    expect(delta?.reasoningDetails).toEqual([{ type: "reasoning.text", text: "chain" }]);
    // The D48 tool-call fragment maps 1:1 minus the SDK's `type:"function"` marker (the reducer never reads it).
    expect(delta?.toolCalls).toEqual([{ index: 0, id: "call_a", function: { name: "lookup", arguments: '{"q":' } }]);
  });

  test("the terminal usage-sentinel chunk (empty choices) maps usage; delta collapses to empty", () => {
    const chunk = {
      id: "gen-1",
      object: "chat.completion.chunk",
      created: 1_700_000_000,
      model: "anthropic/claude-3.5-sonnet",
      choices: [],
      usage: {
        promptTokens: 12,
        completionTokens: 4,
        totalTokens: 16,
        cost: 0.002,
        promptTokensDetails: { cachedTokens: 8 },
        completionTokensDetails: { reasoningTokens: 3 },
      },
    } satisfies SdkChunk;

    const out = reshapeChatStreamChunk(chunk);

    expect(out.choices[0]?.delta).toEqual({});
    expect(out.usage?.promptTokens).toBe(12);
    expect(out.usage?.completionTokens).toBe(4);
    expect(out.usage?.cost).toBe(0.002);
    expect(out.usage?.promptTokensDetails).toEqual({ cachedTokens: 8 });
    expect(out.usage?.completionTokensDetails).toEqual({ reasoningTokens: 3 });
  });

  test("an in-band error rides the chunk tail through the reshape", () => {
    const chunk = {
      id: "gen-1",
      object: "chat.completion.chunk",
      created: 1_700_000_000,
      model: "anthropic/claude-3.5-sonnet",
      choices: [{ index: 0, finishReason: "error", delta: {} }],
      error: { code: 429, message: "rate limited" },
    } satisfies SdkChunk;

    const out = reshapeChatStreamChunk(chunk);

    expect(out.error).toMatchObject({ code: 429, message: "rate limited" });
    expect(out.choices[0]?.finishReason).toBe("error");
  });
});
