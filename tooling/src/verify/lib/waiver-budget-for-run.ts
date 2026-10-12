// The budget one structure run judges: the committed `WAIVER_BUDGET`, or for a planted fixture root the JSON in
// `ORB_WAIVER_BUDGET`. On the checkout's own root a set variable would replace the committed ratchet, so it
// refuses the run instead of being honoured or ignored.
import { resolve } from "node:path";
import { REPO_ROOT } from "@orb/tooling/floor/artifacts/artifacts";
import { UsageError } from "@orb/tooling/floor/cli/run-tool";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { z } from "zod";
import type { WaiverBudget } from "../contract/gate-authority.ts";
import { WAIVER_BUDGET, WAIVER_BUDGET_ENV } from "./waiver-budget.ts";

const budgetRows = z.record(z.string(), z.number().int().nonnegative());
const injectedBudget = z.strictObject({ application: budgetRows, implementation: budgetRows });

export function waiverBudgetForRun(root: string): WaiverBudget {
  const injected = processEnvValue(WAIVER_BUDGET_ENV);
  if (injected === undefined) {
    return WAIVER_BUDGET;
  }
  if (resolve(root) === REPO_ROOT) {
    throw new UsageError(
      `${WAIVER_BUDGET_ENV} may only be set for a planted fixture root; this run's root is the real repository, whose budget is lib/waiver-budget.ts`,
    );
  }
  return injectedBudget.parse(JSON.parse(injected));
}
