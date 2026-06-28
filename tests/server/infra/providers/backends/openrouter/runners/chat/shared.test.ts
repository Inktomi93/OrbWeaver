// biome-ignore-all lint/style/useNamingConvention: snake_case routing fixtures (allow_fallbacks) are the
// real OpenRouter raw-wire shape the contract carries.
//
// backends/openrouter chat/shared — the pure wire-shaping helpers: the system-prompt cache split, history
// assembly, sampling projection, the reasoning request (adaptive/budget guard), the provider-routing pin,
// the customParameters overlay, the mandatory-reasoning detector, and the SDK→kit chunk reshape.

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

describe("chatSamplingFields — projects the RESOLVED sampling (gating already ran upstream)", () => {
  test("emits the present resolved knobs; maps the resolved cap → maxCompletionTokens", () => {
    expect(chatSamplingFields({ temperature: 0.5, topK: 40 }, 256)).toEqual({
      temperature: 0.5,
      topK: 40,
      maxCompletionTokens: 256,
    });
  });

  test("empty sampling + no cap yields no fields", () => {
    expect(chatSamplingFields({}, undefined)).toEqual({});
  });

  test("copies the stop array (no shared reference back into the resolved knobs)", () => {
    const stop = ["END"];
    const out = chatSamplingFields({ stop }, undefined);
    expect(out.stop).toEqual(["END"]);
    expect(out.stop).not.toBe(stop);
  });
});

describe("buildReasoningRequest — thin map from the resolved decision to the kit shape", () => {
  test("carries enabled + an explicit budget through (no effort)", () => {
    expect(buildReasoningRequest({ mode: "budget", enabled: true, budgetTokens: 4096 })).toEqual({
      enabled: true,
      budgetTokens: 4096,
    });
  });

  test("effort rides through without a budget", () => {
    expect(buildReasoningRequest({ mode: "effort", enabled: true, effort: "high" })).toEqual({
      enabled: true,
      effort: "high",
    });
  });

  test("a disabled decision maps to enabled:false with no depth knobs", () => {
    expect(buildReasoningRequest({ mode: "none", enabled: false })).toEqual({ enabled: false });
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
