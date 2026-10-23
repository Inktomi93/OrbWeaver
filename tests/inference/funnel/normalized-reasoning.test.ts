import { resolveChat } from "@orb/inference";
import { makeGenerationCapability } from "@orb/testkit/iso/inference-capability.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("the funnel drops all active-only knobs on explicit off", () => {
  const capability = makeGenerationCapability({
    reasoning: { mode: "budget", enabled: true, effortLevels: ["high"], displayModes: ["summarized"] },
  });
  const { reasoning } = resolveChat({ effort: "none", thinkingBudgetTokens: 1024, thinkingDisplay: "summarized" }, capability);
  expect(reasoning).toEqual({ mode: "budget", enabled: false, offChosen: true, offMode: "disabled" });
});

test("enabled reasoning keeps unknown budgets and effort optional, and adaptive never leaks a supplied budget", () => {
  const budget = resolveChat({ effort: "high" }, makeGenerationCapability({ reasoning: { mode: "budget", enabled: true } })).reasoning;
  expect(budget).toEqual({ mode: "budget", enabled: true });
  const adaptive = resolveChat(
    { effort: "high", thinkingBudgetTokens: 1024 },
    makeGenerationCapability({ reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] } }),
  );
  expect(adaptive.reasoning).toEqual({ mode: "adaptive", enabled: true, effort: "high" });
  expect(adaptive.warnings).toContainEqual(expect.objectContaining({ code: "adaptive_budget_dropped" }));
});

test("unsupported reasoning carries no invented off spelling", () => {
  expect(resolveChat({ effort: "none" }, makeGenerationCapability()).reasoning).toEqual({ mode: "none", enabled: false });
});
