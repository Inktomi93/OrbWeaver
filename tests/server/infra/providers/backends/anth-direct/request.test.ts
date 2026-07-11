// biome-ignore-all lint/style/useNamingConvention: snake_case wire fields (max_tokens, cache_control,
// top_p, stop_sequences, budget_tokens) are the real Anthropic Messages wire, not orbweaver identifiers.
//
// backends/anth-direct request — build the SDK `MessageCreateParams` from the arm + resolved knobs: the
// static-system cache block, the R1 rolling PAIR on history (REUSING the kit placer), prefill passthrough,
// thinking, per-model sampling, the mid-conv-system message-tail row, and the required `max_tokens`.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AnthropicMessagesChatRequest } from "@orb/server/infra/providers";
import {
  anthHistoryCacheOffsets,
  buildAnthMessageParams,
} from "@orb/server/infra/providers/backends/anth-direct";
import { describe } from "vitest";
import {
  makeModelCapability,
  makeOpenRouterCredential,
} from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

const MODEL = "anthropic/claude-opus-4-5";

// A turn LONG enough that its estimated tokens clear the 1024 cache floor (estimateTokens ≈ len/4, so ~5000
// chars ≈ ~1250 tokens). Used to exercise the R1 pair placement.
const LONG_TEXT = "lorem ipsum dolor sit amet ".repeat(200);

const CAPABILITY: ModelCapability = makeModelCapability({
  reasoning: { mode: "adaptive", enabled: true },
  sampling: { temperature: { min: 0, max: 1 }, topP: { min: 0, max: 1 } },
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 200_000 },
  turns: {
    assistantPrefill: true,
    midConversationSystem: true,
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
    cacheMinTokens: 1024,
  },
});

function makeRequest(
  overrides: Partial<AnthropicMessagesChatRequest> = {},
): AnthropicMessagesChatRequest {
  const base: AnthropicMessagesChatRequest = {
    api: "anthropic-messages",
    credential: makeOpenRouterCredential({ apiKey: "sk-or-secret" }),
    model: castId<ModelId>(MODEL),
    capability: CAPABILITY,
    params: {},
    systemPrompt: { static: "You are a bot.", dynamic: "Scene: a tavern." },
    history: [
      { role: "user", content: [{ type: "text", text: "Hi there." }] },
      { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
    ],
  };
  return { ...base, ...overrides };
}

describe("buildAnthMessageParams — system + cache", () => {
  test("REQUIRED max_tokens defaults to the capability output cap when the user set none", () => {
    const params = buildAnthMessageParams(makeRequest(), {
      reasoning: { mode: "adaptive", enabled: false },
      sampling: {},
      dynamicContextChannel: "system-block",
      warnings: [],
    });
    expect(params.max_tokens).toBe(8192);
    expect(params.stream).toBe(true);
    expect(params.model).toBe(MODEL);
  });

  test("the STATIC system prefix carries a cache_control breakpoint; the dynamic tail rides system-block", () => {
    const params = buildAnthMessageParams(makeRequest(), {
      reasoning: { mode: "adaptive", enabled: false },
      sampling: {},
      dynamicContextChannel: "system-block",
      warnings: [],
    });
    const system = params.system;
    expect(Array.isArray(system)).toBe(true);
    if (!Array.isArray(system)) {
      return;
    }
    // Block #1 = the static prefix, cache_control-pinned (the measured Esoteric §5 stable-prefix pin).
    expect(system[0]).toEqual({
      type: "text",
      text: "You are a bot.",
      cache_control: { type: "ephemeral" },
    });
    // Block #2 = the dynamic tail, NO cache_control (volatile), and it stays in the system param.
    expect(system[1]).toEqual({ type: "text", text: "Scene: a tavern." });
  });

  test("message-tail channel: the dynamic half becomes a trailing system MESSAGE, NOT a system block", () => {
    const params = buildAnthMessageParams(makeRequest(), {
      reasoning: { mode: "adaptive", enabled: false },
      sampling: {},
      dynamicContextChannel: "message-tail",
      warnings: [],
    });
    // The system param holds ONLY the static prefix now.
    const system = params.system;
    expect(Array.isArray(system) ? system.length : 0).toBe(1);
    // The dynamic text rides a trailing `system`-role message after the last user/assistant turn.
    const last = params.messages.at(-1);
    expect(last).toEqual({ role: "system", content: "Scene: a tavern." });
  });
});

describe("buildAnthMessageParams — the R1 rolling cache PAIR (reuses the kit placer)", () => {
  test("places cache_control at depth AND depth+2 on a long conversation", () => {
    // A history where a deep stable message and depth+2 both clear the 1024 floor.
    const history = Array.from({ length: 8 }, (_v, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: [{ type: "text" as const, text: LONG_TEXT }],
    }));
    const req = makeRequest({ history, historyCacheBreakpointFromEnd: 1 });
    const offsets = anthHistoryCacheOffsets(req);
    // The pair: offset 1 (depth) AND offset 3 (depth+2), both clearing the floor.
    expect(offsets).toEqual([1, 3]);

    const params = buildAnthMessageParams(req, {
      reasoning: { mode: "adaptive", enabled: false },
      sampling: {},
      dynamicContextChannel: "system-block",
      warnings: [],
    });
    // The two placed messages carry a cache_control text block (the SDK CacheControlEphemeral dialect).
    const len = params.messages.length;
    const placedBlocks = [1, 3].map((offset) => {
      const content = params.messages[len - 1 - offset]?.content;
      return Array.isArray(content) ? content[0] : content;
    });
    for (const block of placedBlocks) {
      expect(block).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
    }
  });

  test("no cache pair when explicitPromptCache is false (non-Anthropic family) — even with an offset", () => {
    const capability: ModelCapability = {
      ...CAPABILITY,
      turns: {
        assistantPrefill: true,
        midConversationSystem: true,
        roleHandlingFloor: "strict",
        explicitPromptCache: false,
        cacheMinTokens: 1024,
      },
    };
    const req = makeRequest({ capability, historyCacheBreakpointFromEnd: 0 });
    expect(anthHistoryCacheOffsets(req)).toEqual([]);
  });
});

describe("buildAnthMessageParams — prefill · thinking · sampling", () => {
  test("prefill: a trailing assistant turn is DELIVERED verbatim (SHAPE already placed it)", () => {
    const req = makeRequest({
      history: [
        { role: "user", content: [{ type: "text", text: "Continue:" }] },
        { role: "assistant", content: [{ type: "text", text: "Once upon" }] },
      ],
    });
    const params = buildAnthMessageParams(req, {
      reasoning: { mode: "adaptive", enabled: false },
      sampling: {},
      dynamicContextChannel: "system-block",
      warnings: [],
    });
    const last = params.messages.at(-1);
    expect(last).toEqual({ role: "assistant", content: "Once upon" });
  });

  test("thinking: adaptive-enabled → {type:'adaptive'}; disabled → no thinking block", () => {
    const on = buildAnthMessageParams(makeRequest(), {
      reasoning: { mode: "adaptive", enabled: true },
      sampling: {},
      dynamicContextChannel: "system-block",
      warnings: [],
    });
    expect(on.thinking).toEqual({ type: "adaptive" });

    const off = buildAnthMessageParams(makeRequest(), {
      reasoning: { mode: "adaptive", enabled: false },
      sampling: {},
      dynamicContextChannel: "system-block",
      warnings: [],
    });
    expect(off.thinking).toBeUndefined();
  });

  test("thinking: budget mode with a resolved budget → {type:'enabled', budget_tokens}", () => {
    const params = buildAnthMessageParams(makeRequest(), {
      reasoning: { mode: "budget", enabled: true, budgetTokens: 2048 },
      sampling: {},
      dynamicContextChannel: "system-block",
      warnings: [],
    });
    expect(params.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });
  });

  test("sampling: only the resolved knobs reach the wire (temperature/top_p/top_k/stop_sequences)", () => {
    const params = buildAnthMessageParams(makeRequest(), {
      reasoning: { mode: "adaptive", enabled: false },
      sampling: { temperature: 0.7, topP: 0.9, stop: ["END"] },
      dynamicContextChannel: "system-block",
      warnings: [],
    });
    expect(params.temperature).toBe(0.7);
    expect(params.top_p).toBe(0.9);
    expect(params.stop_sequences).toEqual(["END"]);
    // topK was not resolved → absent (a post-cutoff model resolves {} and the wire never sees it).
    expect(params.top_k).toBeUndefined();
  });
});
