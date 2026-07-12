// The `pnpm check` exit-code scheme (TSMORPH-SINGLE-PASS-AUDIT.md §9.4): "the checker BROKE" (2) must
// never read as "clean" (0) or "found violations" (1). This pins the two pure helpers the run.ts
// orchestrator uses — the fix for the old `result.status ?? 1` conflation, which mapped a crashed/killed
// stage into the same `1` a rule violation produces (a false "there were violations" for a broken tool).
import { aggregateExit, classifyExit } from "../../scripts/check/run.ts";
import { expect, test } from "../support/fixtures.ts";

test("classifyExit: 0 is clean; a non-scheme stage's non-zero is a violation (1)", () => {
  expect(classifyExit(0)).toBe(0);
  expect(classifyExit(1)).toBe(1);
});

test("classifyExit: an EXTERNAL tool's exit 2 (tsc type errors!) is a VIOLATION (1), not tool-error", () => {
  // The load-bearing case: tsc exits 2 for type errors — that is "found problems", not a broken checker.
  expect(classifyExit(2)).toBe(1);
  expect(classifyExit(127)).toBe(1);
});

test("classifyExit: a scheme-speaking stage's 2 IS a tool error, its 3 a misuse", () => {
  expect(classifyExit(2, true)).toBe(2);
  expect(classifyExit(3, true)).toBe(3);
  expect(classifyExit(1, true)).toBe(1);
  // An unexpected code from a scheme-speaking child is itself a tool error.
  expect(classifyExit(99, true)).toBe(2);
});

test("classifyExit: a signal-kill (null status) is a TOOL error (2), never a violation — both modes", () => {
  expect(classifyExit(null)).toBe(2);
  expect(classifyExit(null, true)).toBe(2);
});

test("aggregateExit: clean when every stage is 0", () => {
  expect(aggregateExit([{ exitCode: 0 }, { exitCode: 0 }])).toBe(0);
});

test("aggregateExit: a single tool-error stage surfaces as 2 even alongside violations", () => {
  // The crux: a stage that merely found violations (1) must not mask a sibling stage that BROKE (2).
  expect(aggregateExit([{ exitCode: 1 }, { exitCode: 2 }, { exitCode: 0 }])).toBe(2);
});

test("aggregateExit: violations (1) when the worst stage is a violation, no tool error", () => {
  expect(aggregateExit([{ exitCode: 0 }, { exitCode: 1 }])).toBe(1);
});

test("aggregateExit: misuse (3) dominates a mere violation but not a tool error", () => {
  expect(aggregateExit([{ exitCode: 1 }, { exitCode: 3 }])).toBe(3);
  expect(aggregateExit([{ exitCode: 3 }, { exitCode: 2 }])).toBe(2);
});
