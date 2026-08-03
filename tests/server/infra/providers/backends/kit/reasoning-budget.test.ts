// backends/kit/reasoning-budget — the wire-effort mapping (max→xhigh, off→none) and THE load-bearing
// OR-responses XOR: a responses reasoning block never carries BOTH `effort` and `maxTokens` (live 400).

import { effortToOpenAIReasoning, effortToResponsesReasoning, OPENAI_EFFORT_LEVELS } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

describe("OPENAI_EFFORT_LEVELS", () => {
  test("is the OR/OpenAI wire vocab (no `max` — that maps to `xhigh`)", () => {
    expect(OPENAI_EFFORT_LEVELS).toEqual(["none", "minimal", "low", "medium", "high", "xhigh"]);
  });
});

describe("effortToOpenAIReasoning — chat-completions (effort only)", () => {
  test("off → { effort: 'none' }", () => {
    expect(effortToOpenAIReasoning({ enabled: false })).toEqual({ effort: "none" });
  });

  test("on with `max` maps to `xhigh`; other levels pass through", () => {
    expect(effortToOpenAIReasoning({ enabled: true, effort: "max" })).toEqual({ effort: "xhigh" });
    expect(effortToOpenAIReasoning({ enabled: true, effort: "minimal" })).toEqual({
      effort: "minimal",
    });
    expect(effortToOpenAIReasoning({ enabled: true, effort: "low" })).toEqual({ effort: "low" });
  });

  test("on with no level defaults to `high`", () => {
    expect(effortToOpenAIReasoning({ enabled: true })).toEqual({ effort: "high" });
  });
});

describe("effortToResponsesReasoning — the effort/maxTokens XOR", () => {
  test("off → { effort: 'none', enabled: false }", () => {
    expect(effortToResponsesReasoning({ enabled: false })).toEqual({
      effort: "none",
      enabled: false,
    });
  });

  test("an explicit budget emits maxTokens ONLY (never effort)", () => {
    const block = effortToResponsesReasoning({ enabled: true, effort: "high", budgetTokens: 4096 });
    expect(block).toEqual({ maxTokens: 4096 });
    expect("effort" in block).toBe(false);
  });

  test("no budget falls through to the effort dial (no maxTokens)", () => {
    const block = effortToResponsesReasoning({ enabled: true, effort: "medium" });
    expect(block).toEqual({ effort: "medium" });
    expect("maxTokens" in block).toBe(false);
  });

  test("INVARIANT: a block never carries both effort and maxTokens, across the matrix", () => {
    const reqs = [
      { enabled: false },
      { enabled: true },
      { enabled: true, effort: "max" as const },
      { enabled: true, budgetTokens: 1024 },
      { enabled: true, effort: "low" as const, budgetTokens: 2048 },
    ];
    for (const req of reqs) {
      const block = effortToResponsesReasoning(req);
      const hasBoth = block.effort !== undefined && block.maxTokens !== undefined;
      expect(hasBoth).toBe(false);
    }
  });
});
