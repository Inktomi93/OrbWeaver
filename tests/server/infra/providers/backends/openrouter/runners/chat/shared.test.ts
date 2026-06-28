// biome-ignore-all lint/style/useNamingConvention: snake_case routing fixtures (allow_fallbacks) are the
// real OpenRouter raw-wire shape the contract carries.
//
// backends/openrouter chat/shared — the pure wire-shaping helpers: the system-prompt cache split, history
// assembly, sampling projection, the reasoning request (adaptive/budget guard), the provider-routing pin,
// the customParameters overlay, the mandatory-reasoning detector, and the SDK→kit chunk reshape.

import type { ModelCapability } from "@orb/contracts/connection";
import {
  buildHistoryMessages,
  buildReasoningRequest,
  buildSystemMessage,
  chatSamplingFields,
  isMandatoryReasoningRejection,
  mergeCustomParameters,
  reshapeChatStreamChunk,
  resolveProviderPreferences,
} from "@orb/server/infra/providers/backends/openrouter";
import { describe, expect, test } from "vitest";

const ANTHROPIC_MODEL = "anthropic/claude-opus-4-5";
const CAPABILITY: ModelCapability = {
  reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "high"] },
  sampling: {},
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 200_000 },
};

describe("buildSystemMessage", () => {
  test("Anthropic + static → per-block cache on the static block, plain dynamic block", () => {
    const msg = buildSystemMessage({ static: "S", dynamic: "D" }, true);
    expect(msg?.content).toEqual([
      { type: "text", text: "S", cacheControl: { type: "ephemeral" } },
      { type: "text", text: "D" },
    ]);
  });

  test("non-Anthropic collapses to a joined string", () => {
    expect(buildSystemMessage({ static: "S", dynamic: "D" }, false)?.content).toBe("S\n\nD");
  });

  test("both halves empty → null (the message is omitted)", () => {
    expect(buildSystemMessage({ static: "  ", dynamic: "" }, true)).toBeNull();
  });
});

describe("buildHistoryMessages", () => {
  test("drops empty-content turns and carries the per-participant name", () => {
    const messages = buildHistoryMessages([
      { role: "user", content: "hi", name: "Alice" },
      { role: "assistant", content: "   " },
      { role: "assistant", content: "yo" },
    ]);
    expect(messages).toEqual([
      { role: "user", content: "hi", name: "Alice" },
      { role: "assistant", content: "yo" },
    ]);
  });
});

describe("chatSamplingFields", () => {
  test("emits only the set knobs; maps maxOutputTokens → maxCompletionTokens", () => {
    expect(chatSamplingFields({ temperature: 0.5, maxOutputTokens: 256 })).toEqual({
      temperature: 0.5,
      maxCompletionTokens: 256,
    });
  });

  test("an empty intent yields no fields", () => {
    expect(chatSamplingFields({})).toEqual({});
  });
});

describe("buildReasoningRequest — the adaptive/budget guard", () => {
  test("adaptive model DROPS an explicit thinkingBudgetTokens", () => {
    const req = buildReasoningRequest(
      { effort: "high", thinkingBudgetTokens: 4096 },
      { ...CAPABILITY, reasoning: { mode: "adaptive", enabled: true } },
    );
    expect(req.budgetTokens).toBeUndefined();
    expect(req.enabled).toBe(true);
  });

  test("budget-mode model keeps the explicit budget", () => {
    expect(
      buildReasoningRequest(
        { thinkingBudgetTokens: 4096 },
        { ...CAPABILITY, reasoning: { mode: "budget", enabled: true } },
      ).budgetTokens,
    ).toBe(4096);
  });

  test("a reasoning:none-capability model is never enabled", () => {
    expect(
      buildReasoningRequest(
        { effort: "high" },
        { ...CAPABILITY, reasoning: { mode: "none", enabled: false } },
      ).enabled,
    ).toBe(false);
  });

  test("effort:none disables reasoning", () => {
    expect(buildReasoningRequest({ effort: "none" }, CAPABILITY).enabled).toBe(false);
  });
});

describe("resolveProviderPreferences", () => {
  test("an Anthropic model gets the order:[Anthropic] cache pin by default", () => {
    expect(resolveProviderPreferences(ANTHROPIC_MODEL, undefined)).toEqual({
      order: ["Anthropic"],
    });
  });

  test("a non-Anthropic model gets default routing (undefined)", () => {
    expect(resolveProviderPreferences("openai/gpt-5", undefined)).toBeUndefined();
  });

  test("user routing wins, mapped snake_case → camelCase", () => {
    expect(
      resolveProviderPreferences(ANTHROPIC_MODEL, { order: ["Together"], allow_fallbacks: false }),
    ).toEqual({ order: ["Together"], allowFallbacks: false });
  });
});

describe("mergeCustomParameters", () => {
  test("owned fields WIN over customParameters (the preset-hijack firewall)", () => {
    expect(
      mergeCustomParameters({ model: "owned", temperature: 0.7 }, { model: "evil", topK: 5 }),
    ).toEqual({
      model: "owned",
      temperature: 0.7,
      topK: 5,
    });
  });

  test("undefined customParameters returns owned unchanged", () => {
    const owned = { model: "m" };
    expect(mergeCustomParameters(owned, undefined)).toBe(owned);
  });
});

describe("isMandatoryReasoningRejection", () => {
  test("matches the reasoning-mandatory signature on the error message", () => {
    expect(isMandatoryReasoningRejection(new Error("reasoning is mandatory for this model"))).toBe(
      true,
    );
  });

  test("does not match an unrelated error", () => {
    expect(isMandatoryReasoningRejection(new Error("rate limited"))).toBe(false);
  });
});

describe("reshapeChatStreamChunk", () => {
  test("reshapes a text+reasoning delta into the kit chunk shape", () => {
    const out = reshapeChatStreamChunk({
      choices: [
        {
          delta: { content: "hi", reasoning: "think" },
          finishReason: "stop",
          index: 0,
        },
      ],
      created: 0,
      id: "x",
      model: "m",
      // biome-ignore lint/suspicious/noExplicitAny: a minimal SDK chunk fixture — only the read fields matter.
    } as any);
    expect(out.choices[0]?.delta).toEqual({ content: "hi", reasoning: "think" });
    expect(out.choices[0]?.finishReason).toBe("stop");
  });

  test("the empty usage-sentinel chunk (no choices) yields an empty delta", () => {
    const out = reshapeChatStreamChunk({
      choices: [],
      created: 0,
      id: "x",
      model: "m",
      usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 },
      // biome-ignore lint/suspicious/noExplicitAny: a minimal SDK chunk fixture — only the read fields matter.
    } as any);
    expect(out.choices[0]?.delta).toEqual({});
    expect(out.usage?.promptTokens).toBe(3);
  });
});
