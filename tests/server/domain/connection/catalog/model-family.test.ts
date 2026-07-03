// detectModelFamily — the load-bearing anchors. The headline assertion: a
// third-party `claude` FORK is rejected to `other` (so an alien backend never receives Anthropic-only
// cache_control directives), while bare + `anthropic/`-prefixed Claude ids both match.

import { describe } from "vitest";
import { detectModelFamily } from "../../../../../packages/server/src/domain/connection/catalog/model-family.ts";
import { expect, test } from "../../../../support/fixtures";

describe("detectModelFamily", () => {
  test("matches bare and anthropic/-prefixed Claude ids", () => {
    expect(detectModelFamily("claude-opus-4-8")).toBe("anthropic");
    expect(detectModelFamily("anthropic/claude-sonnet-4.6")).toBe("anthropic");
  });

  test("REJECTS a third-party claude fork to `other` (the anchor is load-bearing)", () => {
    expect(detectModelFamily("some-org/claude-fork")).toBe("other");
    expect(detectModelFamily("acme/claude-clone-v2")).toBe("other");
  });

  test("detects the other families by their anchored prefixes", () => {
    expect(detectModelFamily("openai/gpt-5")).toBe("openai");
    expect(detectModelFamily("google/gemini-3")).toBe("google");
    expect(detectModelFamily("meta-llama/llama-4")).toBe("meta");
    expect(detectModelFamily("deepseek/deepseek-r1")).toBe("deepseek");
    expect(detectModelFamily("qwen/qwen3-max")).toBe("qwen");
    expect(detectModelFamily("mistralai/mistral-large")).toBe("mistral");
    expect(detectModelFamily("x-ai/grok-4")).toBe("xai");
  });

  test("an unknown id falls through to `other`", () => {
    expect(detectModelFamily("cohere/command-r")).toBe("other");
  });
});
