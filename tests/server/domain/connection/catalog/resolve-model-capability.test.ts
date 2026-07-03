// resolveModelCapability — the ONE descriptor factory, per arm. Asserts:
// curated wins first (incl. a Claude-via-OR id), OR synthesis reads supportedParameters + family, vLLM /
// custom / local-light static arms, and the distinct-axes shape (reasoning.mode ≠ on/off; no `none` level).

import { describe } from "vitest";
import { resolveModelCapability } from "../../../../../packages/server/src/domain/connection/catalog/resolve-model-capability.ts";
import { expect, test } from "../../../../support/fixtures";

describe("resolveModelCapability — curated arm (wins first)", () => {
  test("opus is adaptive with no sampling (agent-sdk honors none)", () => {
    const cap = resolveModelCapability("claude-opus-4-8", "max-pro-sub");
    expect(cap.reasoning.mode).toBe("adaptive");
    expect(cap.reasoning.enabled).toBe(true);
    expect(cap.sampling).toEqual({});
    expect(cap.context.supports1M).toBe(true);
  });

  test("a Claude-via-OR version-only id resolves to the curated profile, NOT synthesis", () => {
    const cap = resolveModelCapability("claude-haiku-4-5", "openrouter");
    expect(cap.reasoning.mode).toBe("none");
    expect(cap.reasoning.enabled).toBe(false);
  });
});

describe("resolveModelCapability — openrouter synthesis arm", () => {
  test("synthesizes sampling from supportedParameters + an effort-family reasoning axis", () => {
    const cap = resolveModelCapability("openai/gpt-5", "openrouter", {
      contextLength: 256_000,
      supportedParameters: ["temperature", "top_p", "top_k", "reasoning", "verbosity"],
    });
    expect(cap.sampling.temperature).toEqual({ min: 0, max: 2 });
    expect(cap.sampling.topK).toEqual({ min: 0, max: 200 });
    expect(cap.reasoning.mode).toBe("effort"); // openai is an effort family
    expect(cap.verbosity).toEqual(["low", "medium", "high"]); // openai + supported
    expect(cap.context.window).toBe(256_000);
  });

  test("a cold/missing catalog entry yields the permissive sampling baseline", () => {
    const cap = resolveModelCapability("meta-llama/llama-4", "openrouter");
    expect(cap.sampling.temperature).toEqual({ min: 0, max: 2 });
    expect(cap.sampling.topP).toEqual({ min: 0, max: 1 });
    expect(cap.reasoning.mode).toBe("none"); // meta is a no-reasoning family
    expect(cap.context.window).toBe(200_000); // OR default window
  });
});

describe("resolveModelCapability — static arms", () => {
  test("vLLM: no reasoning, full sampling, engine window", () => {
    const cap = resolveModelCapability("Qwen/Qwen3-VL-8B-Instruct", "vllm");
    expect(cap.reasoning.mode).toBe("none");
    expect(cap.sampling.temperature).toBeDefined();
    expect(cap.context.window).toBe(32_768);
  });

  test("local-light: conservative, no sampling (chat-less tier)", () => {
    const cap = resolveModelCapability("bge-small", "local-light");
    expect(cap.reasoning.mode).toBe("none");
    expect(cap.sampling).toEqual({});
    expect(cap.context.window).toBe(8192);
  });

  test("custom_openai: conservative user-declared baseline (deferred profile)", () => {
    const cap = resolveModelCapability("my-model", "custom_openai");
    expect(cap.reasoning.mode).toBe("none");
    expect(cap.context.window).toBe(128_000);
  });
});
