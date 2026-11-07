import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import type { MutantStatus } from "@orb/tooling/mutation-arid";
import { countStatuses, exitForCounts, testedCount } from "@orb/tooling/mutation-run";

function mutants(...statuses: readonly MutantStatus[]): readonly { readonly status: MutantStatus }[] {
  return statuses.map((status) => ({ status }));
}

test("a run that killed any mutant is clean, survivors or not", () => {
  expect(exitForCounts(countStatuses(mutants("Killed", "Survived", "Survived")))).toBe(EXIT.clean);
  expect(exitForCounts(countStatuses(mutants("Timeout", "NoCoverage")))).toBe(EXIT.clean);
});

test("zero killed is never clean: an escaped sandbox and useless tests read the same", () => {
  expect(exitForCounts(countStatuses(mutants("Survived", "NoCoverage", "Ignored")))).toBe(EXIT.violations);
});

test("ignored and compile-error mutants never count as tested", () => {
  expect(testedCount(countStatuses(mutants("Ignored", "CompileError", "Pending")))).toBe(0);
  expect(testedCount(countStatuses(mutants("Killed", "Survived", "NoCoverage", "Timeout", "RuntimeError", "Ignored")))).toBe(5);
});
