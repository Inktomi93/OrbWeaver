import type { ResolvedReasoning } from "@orb/inference";
import { expectTypeOf, test } from "vitest";
import type { StructuredPlan } from "#inference/contract/structured.ts";

test("resolved reasoning excludes fields dropped by the funnel but permits unknown metadata", () => {
  expectTypeOf<{ mode: "budget"; enabled: false; budgetTokens: number }>().not.toExtend<ResolvedReasoning>();
  expectTypeOf<{ mode: "adaptive"; enabled: false; effort: "high" }>().not.toExtend<ResolvedReasoning>();
  expectTypeOf<{ mode: "adaptive"; enabled: false; display: "summarized" }>().not.toExtend<ResolvedReasoning>();
  expectTypeOf<{ mode: "adaptive"; enabled: true; budgetTokens: number }>().not.toExtend<ResolvedReasoning>();
  expectTypeOf<{ mode: "budget"; enabled: true; effort: "high" }>().not.toExtend<ResolvedReasoning>();
  expectTypeOf<{ mode: "budget"; enabled: true }>().toExtend<ResolvedReasoning>();
  expectTypeOf<{ mode: "adaptive"; enabled: true }>().toExtend<ResolvedReasoning>();
  expectTypeOf<{ mode: "none"; enabled: false }>().toExtend<ResolvedReasoning>();
  expectTypeOf<{ mode: "budget"; enabled: false; offChosen: true; offMode: "disabled" }>().toExtend<ResolvedReasoning>();
});

type PlanBase = Pick<StructuredPlan, "ok" | "mode" | "downgrades">;
test("format selection carries both its index and planned format, while text-only turns need neither", () => {
  expectTypeOf<PlanBase & { shape: number }>().not.toExtend<StructuredPlan>();
  expectTypeOf<PlanBase & { responseFormat: NonNullable<StructuredPlan["responseFormat"]> }>().not.toExtend<StructuredPlan>();
  expectTypeOf<PlanBase>().toExtend<StructuredPlan>();
  expectTypeOf<PlanBase & { shape: number; responseFormat: NonNullable<StructuredPlan["responseFormat"]> }>().toExtend<StructuredPlan>();
});
