import type { TypecheckPlan } from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const PLAN_TIMEOUT = scaledBudget(30_000);

test("the verifier CLI reports the real DOM primary for runtime and type-only tests", { timeout: PLAN_TIMEOUT }, async ({ runCli }) => {
  const result = await runCli(
    "verify",
    ["typecheck-plan", "--primary", "--file", "--json", "tests/client/agent-nav/index.dom.test.ts", "tests/ui/primitives/input/index.dom.test-d.ts"],
    { timeoutMs: PLAN_TIMEOUT },
  );
  await expect(result).toExitWith(0);
  const plan = JSON.parse(result.stdout) as TypecheckPlan;
  expect(plan.coverage).toBe("advisory-primary-programs");
  expect(plan.programs).toEqual(["tsconfig.tests-dom.json"]);
});

test("the verifier CLI refuses empty, contradictory and unknown plan arguments before checking", { timeout: PLAN_TIMEOUT }, async ({ runCli }) => {
  for (const args of [
    ["typecheck-plan", "--primary", "--file"],
    ["typecheck-plan", "--primary", "--affected", "--file", "reset.d.ts"],
    ["typecheck-plan", "--primary", "--file", "--bogus", "reset.d.ts"],
  ]) {
    const result = await runCli("verify", args, { timeoutMs: PLAN_TIMEOUT });
    await expect(result).toExitWith(3);
  }
});

test("the typecheck-plan file boundary classifies outside, missing and non-authored operands as misuse", { timeout: PLAN_TIMEOUT }, async ({ runCli }) => {
  for (const path of ["/tmp/outside-orbweaver.ts", "tests/no-such-authored-file.ts", ".git/HEAD"]) {
    const result = await runCli("verify", ["typecheck-plan", "--primary", "--file", "--json", "--", path], { timeoutMs: PLAN_TIMEOUT });
    await expect(result).toExitWith(3);
  }
});
