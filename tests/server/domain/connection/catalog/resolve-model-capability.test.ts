// resolveModelCapability — the ONE descriptor factory, per arm. Asserts:
// curated wins first (incl. a Claude-via-OR id), OR synthesis reads supportedParameters + family, vLLM /
// custom / local-light static arms, and the distinct-axes shape (reasoning.mode ≠ on/off; no `none` level).
// The four gapped axes (§U0 + IC-A) — `tools` / `output.structured` / `input.vision` / `input.imageEdit` —
// are pinned per arm, present AND absent.

import { coEmitsProseWithTools } from "@orb/contracts/connection";
import { describe } from "vitest";
import { resolveModelCapability } from "../../../../../packages/server/src/domain/connection/catalog/resolve-model-capability.ts";
import { expect, test } from "../../../../support/fixtures";

describe("resolveModelCapability — curated arm (wins first)", () => {
  test("opus is adaptive with no sampling (agent-sdk honors none)", () => {
    const cap = resolveModelCapability("claude-opus-4-8", "max-pro-sub", "agent-sdk");
    expect(cap.reasoning.mode).toBe("adaptive");
    expect(cap.reasoning.enabled).toBe(true);
    expect(cap.sampling).toEqual({});
    expect(cap.context.supports1M).toBe(true);
  });

  test("a Claude-via-OR version-only id resolves to the curated profile, NOT synthesis", () => {
    const cap = resolveModelCapability("claude-haiku-4-5", "openrouter", "chat-completions");
    expect(cap.reasoning.mode).toBe("none");
    expect(cap.reasoning.enabled).toBe(false);
  });
});

describe("resolveModelCapability — openrouter synthesis arm", () => {
  test("synthesizes sampling from supportedParameters + an effort-family reasoning axis", () => {
    const cap = resolveModelCapability("openai/gpt-5", "openrouter", "chat-completions", {
      orEntry: {
        contextLength: 256_000,
        supportedParameters: ["temperature", "top_p", "top_k", "reasoning", "verbosity"],
      },
    });
    expect(cap.sampling.temperature).toEqual({ min: 0, max: 2 });
    expect(cap.sampling.topK).toEqual({ min: 0, max: 200 });
    expect(cap.reasoning.mode).toBe("effort"); // openai is an effort family
    expect(cap.verbosity).toEqual(["low", "medium", "high"]); // openai + supported
    expect(cap.context.window).toBe(256_000);
  });

  test("synthesizes the topA range when the model advertises top_a", () => {
    const cap = resolveModelCapability("some/model", "openrouter", "chat-completions", {
      orEntry: { contextLength: 128_000, supportedParameters: ["temperature", "top_a"] },
    });
    expect(cap.sampling.topA).toEqual({ min: 0, max: 1 });
    const noTopA = resolveModelCapability("some/other", "openrouter", "chat-completions", {
      orEntry: { contextLength: 128_000, supportedParameters: ["temperature"] },
    });
    expect(noTopA.sampling.topA).toBeUndefined();
  });

  test("a cold/missing catalog entry yields the permissive sampling baseline", () => {
    const cap = resolveModelCapability("meta-llama/llama-4", "openrouter", "chat-completions");
    expect(cap.sampling.temperature).toEqual({ min: 0, max: 2 });
    expect(cap.sampling.topP).toEqual({ min: 0, max: 1 });
    expect(cap.reasoning.mode).toBe("none"); // meta is a no-reasoning family
    expect(cap.context.window).toBe(200_000); // OR default window
    // …and it says it is a GUESS, so no surface draws a "used / 200,000" ratio against a window nobody
    // published (D41 no-silent-degrade — the owner-reported "preview just assumes 200k" defect).
    expect(cap.context.windowEstimated).toBe(true);
  });

  test("R0: OR's advertised reasoning object OVERRIDES the family none + captures ALL five fields", () => {
    // x-ai family is `none` in the family table; OR advertises reasoning → effort mode with its allowlist.
    const cap = resolveModelCapability("x-ai/grok-4.5", "openrouter", "chat-completions", {
      orEntry: {
        contextLength: 256_000,
        supportedParameters: ["temperature", "reasoning", "reasoning_effort"],
        reasoning: { mandatory: true, defaultEnabled: true, supportedEfforts: ["high", "medium", "low"], defaultEffort: "medium", supportsMaxTokens: true },
      },
    });
    expect(cap.reasoning.mode).toBe("effort");
    expect(cap.reasoning.enabled).toBe(true); // = OR defaultEnabled
    expect(cap.reasoning.effortLevels).toEqual(["high", "medium", "low"]); // OR's real allowlist, order preserved
    expect(cap.reasoning.mandatory).toBe(true);
    expect(cap.reasoning.defaultEnabled).toBe(true);
    expect(cap.reasoning.defaultEffort).toBe("medium");
    expect(cap.reasoning.supportsMaxTokens).toBe(true);
  });

  test("R0: enabled stays CAN-REASON (true) even off-by-default; unmapped defaultEffort ('none') dropped", () => {
    const cap = resolveModelCapability("some/reasoner", "openrouter", "chat-completions", {
      orEntry: { contextLength: 128_000, supportedParameters: ["reasoning"], reasoning: { mandatory: false, defaultEnabled: false, defaultEffort: "none" } },
    });
    expect(cap.reasoning.enabled).toBe(true); // CAN reason (a user's explicit effort must still work)
    expect(cap.reasoning.defaultEnabled).toBe(false); // carried as truth (gates the DEFAULT-on behavior)
    expect(cap.reasoning.defaultEffort).toBeUndefined(); // "none" is not an EffortLevel → dropped
    expect(cap.reasoning.mandatory).toBeUndefined(); // absent ⇒ false, never emitted
    expect(cap.reasoning.supportsMaxTokens).toBeUndefined();
  });

  test("R0: a null effort allowlist (no restriction) yields the full effort set", () => {
    const cap = resolveModelCapability("deepseek/deepseek-r2", "openrouter", "chat-completions", {
      orEntry: { contextLength: 128_000, supportedParameters: ["reasoning"], reasoning: { mandatory: true, supportedEfforts: null } },
    });
    expect(cap.reasoning.mode).toBe("effort");
    expect(cap.reasoning.effortLevels).toEqual(["minimal", "low", "medium", "high", "xhigh", "max"]);
  });

  test("R0: NO OR reasoning object ⇒ family fallback (a no-reasoning family stays none, never guessed)", () => {
    const cap = resolveModelCapability("qwen/qwen-plain", "openrouter", "chat-completions", {
      orEntry: { contextLength: 32_768, supportedParameters: ["temperature"], reasoning: null },
    });
    expect(cap.reasoning.mode).toBe("none");
    expect(cap.reasoning.enabled).toBe(false);
  });

  test("output cap uses OR's advertised max_completion_tokens over the window estimate", () => {
    // A 200k-window model whose real completion cap is 64k — the advertised cap wins (was clamped to 32768).
    const cap = resolveModelCapability("openai/gpt-5", "openrouter", "chat-completions", {
      orEntry: { contextLength: 200_000, supportedParameters: ["temperature"], maxCompletionTokens: 64_000 },
    });
    expect(cap.output.maxTokens.max).toBe(64_000);
  });

  test("output cap degrades to min(window, 32768) when OR advertises no completion cap", () => {
    const capBig = resolveModelCapability("openai/gpt-5", "openrouter", "chat-completions", {
      orEntry: { contextLength: 200_000, supportedParameters: ["temperature"], maxCompletionTokens: null },
    });
    expect(capBig.output.maxTokens.max).toBe(32_768); // window > cap → the estimate ceiling
    const capSmall = resolveModelCapability("openai/gpt-5", "openrouter", "chat-completions", {
      orEntry: { contextLength: 8000, supportedParameters: ["temperature"] },
    });
    expect(capSmall.output.maxTokens.max).toBe(8000); // window < ceiling → the window
  });
});

describe("resolveModelCapability — the four gapped axes (§U0 + IC-A synthesis)", () => {
  test("openrouter: a tools+structured+vision model synthesizes all three; imageEdit stays absent", () => {
    const cap = resolveModelCapability("openai/gpt-5", "openrouter", "chat-completions", {
      orEntry: {
        contextLength: 256_000,
        supportedParameters: ["tools", "structured_outputs", "temperature"],
        inputModalities: ["text", "image"],
      },
    });
    expect(cap.tools).toEqual({ parallel: true });
    expect(cap.output.structured).toBe(true);
    expect(cap.input).toEqual({ vision: true });
    expect(cap.input?.imageEdit).toBeUndefined();
  });

  test("openrouter: a text-only, no-tools model leaves all four axes absent (the negatives)", () => {
    const cap = resolveModelCapability("meta-llama/llama-4", "openrouter", "chat-completions", {
      orEntry: { contextLength: 128_000, supportedParameters: ["temperature", "top_p"], inputModalities: ["text"] },
    });
    expect(cap.tools).toBeUndefined();
    expect(cap.output.structured).toBeUndefined();
    expect(cap.input).toBeUndefined();
  });

  test("R2: a moderated top provider surfaces ModelCapability.moderated (absent ⇒ unset)", () => {
    const mod = resolveModelCapability("openai/gpt-5", "openrouter", "chat-completions", {
      orEntry: { contextLength: 256_000, supportedParameters: ["temperature"], isModerated: true },
    });
    expect(mod.moderated).toBe(true);
    const open = resolveModelCapability("meta-llama/llama-4", "openrouter", "chat-completions", {
      orEntry: { contextLength: 128_000, supportedParameters: ["temperature"], isModerated: false },
    });
    expect(open.moderated).toBeUndefined();
  });

  test("openrouter: file/audio/video input modalities synthesize as capability truth (absent ⇒ false)", () => {
    const cap = resolveModelCapability("google/gemini-x", "openrouter", "chat-completions", {
      orEntry: { contextLength: 1_000_000, supportedParameters: ["temperature"], inputModalities: ["text", "file", "audio", "video"] },
    });
    expect(cap.input).toEqual({ vision: false, file: true, audio: true, video: true });
  });

  test("R1: input.imageEdit derives from image IN ∩ image OUT (not a model-id regex)", () => {
    const cap = resolveModelCapability("openai/gpt-image-1", "openrouter", "chat-completions", {
      orEntry: { contextLength: 32_768, supportedParameters: [], inputModalities: ["text", "image"], outputModalities: ["image"] },
    });
    expect(cap.input).toEqual({ vision: true, imageEdit: true });
  });

  test("R1: a model the OLD regex allow-list MISSED now resolves imageEdit via modalities", () => {
    // `openai/gpt-5-image-mini` is one of the 11 live image-edit models the `gpt-image-1|*flash-image`
    // regex never matched — modality derivation catches it.
    const cap = resolveModelCapability("openai/gpt-5-image-mini", "openrouter", "chat-completions", {
      orEntry: { contextLength: 400_000, supportedParameters: [], inputModalities: ["text", "image"], outputModalities: ["text", "image"] },
    });
    expect(cap.input?.imageEdit).toBe(true);
  });

  test("R1: image IN but NO image OUT ⇒ vision only, imageEdit absent", () => {
    const cap = resolveModelCapability("google/gemini-2.5-flash-image", "openrouter", "chat-completions", {
      orEntry: { contextLength: 1_000_000, supportedParameters: [], inputModalities: ["text", "image"], outputModalities: ["text"] },
    });
    expect(cap.input).toEqual({ vision: true });
    expect(cap.input?.imageEdit).toBeUndefined();
  });

  test("openrouter: a plain vision chat model is NOT an image-edit model (imageEdit stays absent)", () => {
    const cap = resolveModelCapability("google/gemini-2.5-pro", "openrouter", "chat-completions", {
      orEntry: { contextLength: 1_000_000, supportedParameters: [], inputModalities: ["text", "image"] },
    });
    expect(cap.input).toEqual({ vision: true });
    expect(cap.input?.imageEdit).toBeUndefined();
  });

  test("curated Claude cells are pinned: tools + structured + vision, imageEdit absent", () => {
    for (const id of ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"]) {
      const cap = resolveModelCapability(id, "openrouter", "chat-completions");
      expect(cap.tools).toEqual({ parallel: true });
      expect(cap.output.structured).toBe(true);
      expect(cap.input).toEqual({ vision: true });
      expect(cap.input?.imageEdit).toBeUndefined();
    }
  });

  test("openrouter: an UNCURATED Claude inherits the family floor — tools + structured, never flagless", () => {
    // OR's catalog under-advertises `structured_outputs` for Claude (why claude-sonnet-4-6 was hand-curated);
    // a version newer than the shortlist must not read as structured-output-less → trackers-readonly.
    const cap = resolveModelCapability("anthropic/claude-sonnet-9", "openrouter", "chat-completions", {
      orEntry: { contextLength: 200_000, supportedParameters: ["temperature"], inputModalities: ["text", "image"] },
    });
    expect(cap.output.structured).toBe(true);
    expect(cap.tools).toEqual({ parallel: true });
    // …and a COLD catalog entry (nothing advertised at all) resolves the same floor.
    const cold = resolveModelCapability("anthropic/claude-opus-9", "openrouter", "chat-completions");
    expect(cold.output.structured).toBe(true);
    expect(cold.tools).toEqual({ parallel: true });
  });

  test("openrouter: the Claude floor is family-GATED — a fork that merely contains 'claude' claims nothing", () => {
    const cap = resolveModelCapability("some-org/claude-fork-9", "openrouter", "chat-completions", {
      orEntry: { contextLength: 128_000, supportedParameters: ["temperature"], inputModalities: ["text"] },
    });
    expect(cap.output.structured).toBeUndefined();
    expect(cap.tools).toBeUndefined();
  });

  test("openrouter: the Claude floor never fabricates VISION — input stays advertised-modality truth (R1)", () => {
    const cap = resolveModelCapability("anthropic/claude-sonnet-9", "openrouter", "chat-completions", {
      orEntry: { contextLength: 200_000, supportedParameters: ["temperature"], inputModalities: ["text"] },
    });
    expect(cap.input).toBeUndefined();
  });

  test("max-pro-sub COLD cache: a recognized Claude id still inherits the floor (warmth ≠ capability)", () => {
    // No curated match AND no daemon row. Whether the agent-sdk snapshot happens to be warm must not change
    // what the model can do — the same cold-cache-degrades-capability class as the OR catalog.
    const cap = resolveModelCapability("claude-sonnet-9", "max-pro-sub", "agent-sdk", { agentSdkModels: [] });
    expect(cap.output.structured).toBe(true);
    expect(cap.tools).toEqual({ parallel: true });
    expect(cap.input).toEqual({ vision: true });
    // The WINDOW is still unknowable here — the floor is about capability, never about inventing truth.
    expect(cap.context.windowEstimated).toBe(true);
  });

  test("max-pro-sub COLD cache: a bare alias / non-anthropic id claims nothing — can't recognize, can't floor", () => {
    for (const id of ["sonnet", "some-unlisted-model", "some-org/claude-fork-9"]) {
      const cap = resolveModelCapability(id, "max-pro-sub", "agent-sdk", { agentSdkModels: [] });
      expect(cap.output.structured).toBeUndefined();
      expect(cap.tools).toBeUndefined();
      expect(cap.input).toBeUndefined();
    }
  });

  test("vLLM: structured output is native (guided decoding); tools advertise parallel calls (U0, hermes parser)", () => {
    const cap = resolveModelCapability("Qwen/Qwen3-8B", "vllm", "chat-completions");
    expect(cap.output.structured).toBe(true);
    // …AND the co-emission truth for this wire (D112 as amended, spike §4g): attaching tools costs the prose.
    expect(cap.tools).toEqual({ parallel: true, silencesProse: true });
    expect(coEmitsProseWithTools(cap)).toBe(false);
    expect(cap.input).toBeUndefined();
  });

  test("vLLM: tools axis holds on the agent-sdk protocol too (local loopback agent path, U0)", () => {
    const cap = resolveModelCapability("Qwen/Qwen3-8B", "vllm", "agent-sdk");
    expect(cap.tools).toEqual({ parallel: true, silencesProse: true });
    expect(cap.output.structured).toBe(true);
  });

  test("silencesProse is the LOCAL engine's fact ONLY — every hosted tool-capable arm co-emits (D112)", () => {
    // The guard must not creep onto the wires the fold was measured GOOD on (6/6 co-emission): an OR catalog
    // model, and the curated Claude shortlist that the sub + the OR skin both resolve through.
    const or = resolveModelCapability("openai/gpt-5", "openrouter", "chat-completions", {
      orEntry: { contextLength: 200_000, supportedParameters: ["tools"] },
    });
    expect(or.tools).toEqual({ parallel: true });
    expect(coEmitsProseWithTools(or)).toBe(true);
    for (const id of ["claude-opus-4-8", "claude-sonnet-5"]) {
      expect(coEmitsProseWithTools(resolveModelCapability(id, "openrouter", "chat-completions"))).toBe(true);
    }
    // A model with NO tools axis at all cannot co-emit either — the predicate is total, never a crash.
    expect(coEmitsProseWithTools(resolveModelCapability("my-model", "custom_openai", "chat-completions"))).toBe(false);
  });

  test("custom_openai + local-light: all four axes absent (undeclared / chat-less)", () => {
    const custom = resolveModelCapability("my-model", "custom_openai", "chat-completions");
    expect(custom.tools).toBeUndefined();
    expect(custom.output.structured).toBeUndefined();
    expect(custom.input).toBeUndefined();
    const light = resolveModelCapability("bge-small", "local-light", "chat-completions");
    expect(light.output.structured).toBeUndefined();
    expect(light.tools).toBeUndefined();
  });
});

describe("resolveModelCapability — static arms", () => {
  test("vLLM: no reasoning, full sampling, engine window", () => {
    const cap = resolveModelCapability("Qwen/Qwen3-VL-8B-Instruct", "vllm", "chat-completions");
    expect(cap.reasoning.mode).toBe("none");
    expect(cap.sampling.temperature).toBeDefined();
    expect(cap.context.window).toBe(32_768);
  });

  test("local-light: conservative, no sampling (chat-less tier)", () => {
    const cap = resolveModelCapability("bge-small", "local-light", "chat-completions");
    expect(cap.reasoning.mode).toBe("none");
    expect(cap.sampling).toEqual({});
    expect(cap.context.window).toBe(8192);
  });

  test("custom_openai: conservative default window when none declared — MARKED a guess", () => {
    const cap = resolveModelCapability("my-model", "custom_openai", "chat-completions");
    expect(cap.reasoning.mode).toBe("none");
    expect(cap.context.window).toBe(128_000);
    // A BYO endpoint has no catalog we may call, so the number is unknowable here — say so rather than let a
    // surface present 128k as this endpoint's window.
    expect(cap.context.windowEstimated).toBe(true);
  });

  test("custom_openai: honors the user-declared contextWindow (PD-12) — declared is TRUTH, not a guess", () => {
    const cap = resolveModelCapability("my-model", "custom_openai", "chat-completions", {
      customContextWindow: 8192,
    });
    expect(cap.context.window).toBe(8192);
    expect(cap.context.windowEstimated).toBeUndefined();
  });

  // ── Every source reads ITS OWN truth (the owner ruling: this is not a vLLM-only fix) ──────────────────
  test("an ADVERTISED OR window is truth, never marked a guess", () => {
    const cap = resolveModelCapability("meta-llama/llama-4", "openrouter", "chat-completions", {
      orEntry: { contextLength: 131_072, supportedParameters: ["temperature"] },
    });
    expect(cap.context.window).toBe(131_072);
    expect(cap.context.windowEstimated).toBeUndefined();
  });

  test("vllm reads the LIVE engine's self-report over the launch-flag env floor — both are truth", () => {
    const engine = resolveModelCapability("qwen", "vllm", "chat-completions", { vllmGenWindow: 40_960 });
    expect(engine.context.window).toBe(40_960);
    expect(engine.context.windowEstimated).toBeUndefined();
    // Engine unprobed ⇒ the app's own launch parameter (what the engine was started with) — still truth.
    const launched = resolveModelCapability("qwen", "vllm", "chat-completions");
    expect(launched.context.window).toBeGreaterThan(0);
    expect(launched.context.windowEstimated).toBeUndefined();
  });

  test("max-pro-sub: a curated Claude window is truth; an unknown id with no daemon row is a marked guess", () => {
    const curated = resolveModelCapability("claude-sonnet-5", "max-pro-sub", "agent-sdk");
    expect(curated.context.window).toBe(200_000);
    expect(curated.context.windowEstimated).toBeUndefined(); // Claude's published window — a REAL 200k
    const unknown = resolveModelCapability("some-unlisted-model", "max-pro-sub", "agent-sdk", { agentSdkModels: [] });
    expect(unknown.context.windowEstimated).toBe(true);
  });
});
