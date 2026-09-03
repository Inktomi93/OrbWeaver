// The `--eval` ARM: an in-page expression, JSON-printed and both-ends capped. Split out of the former
// ops/evidence.ts by NATURE when the arm registry landed (contract/arms.ts).
//
// IT HAS TWO RUN POSITIONS AND THAT IS THE POINT. An `--eval` written mid-chain runs at its argv position
// inside the drive queue (ops/drive.ts); the ones written AFTER the last drive action are split back out
// and run here, on the SETTLED surface. So this arm's `run` sees only the trailing set — the mid-chain
// results are already on the outcome by the time the capture pass starts, and appending keeps the report
// in argv order.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmArgs, ArmDef, ArmFailureCounts, ArmNeeds, ArmPairInput } from "../../contract/arms.ts";
import type { EvalOutcome } from "../../contract/types.ts";
import { CHURN_LINE, capEvalText, isContextChurn, wrapEvalExpr } from "../../lib/eval-text.ts";
import { pushEval } from "../flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --eval <expression>");

export async function captureEvals(page: Page, exprs: readonly string[]): Promise<EvalOutcome[]> {
  const results: EvalOutcome[] = [];
  for (const expr of exprs) {
    let text: string;
    let failed = false;
    // @orb-gate-ignore caught-failure-ownership(empty:e): captured into the EvalOutcome as `failed: true` + an "EVAL ERROR" text, pushed into `results` and returned to the caller that prints/counts it. Ends if `failed`/`text` stop being read from the outcome.
    try {
      const value: unknown = await page.evaluate(wrapEvalExpr(expr));
      text = value === undefined ? "undefined" : JSON.stringify(value, null, 2);
      text = capEvalText(text);
    } catch (e) {
      failed = true;
      const msg = errorMessage(e);
      text = isContextChurn(msg) ? `EVAL ERROR: ${msg}\n${CHURN_LINE}` : `EVAL ERROR: ${msg}`;
    }
    results.push({ expr, text, failed });
  }
  return results;
}

function evalFailures({ outcomes }: ArmPairInput): number {
  return outcomes.reduce((count, outcome) => count + outcome.evalResults.filter((entry) => entry.failed).length, 0);
}

export const EVAL_ARM = {
  flags: [
    {
      flag: "--eval",
      kind: "required-value",
      pageTargetable: true,
      handler: (a, rest, page): void => {
        const expr = rest.shift();
        if (expr !== undefined && expr !== "") {
          pushEval(a, { expr, page });
        }
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  defaults: (): Pick<ArmArgs, "eval"> => ({ eval: [] }),
  help: "  --eval <expression>     in-page JSON result (repeatable)",
  lifecycle: {
    at: "page",
    enabled: ({ trailingEvals }): boolean => trailingEvals.length > 0,
    run: async ({ page, outcome, trailingEvals }): Promise<void> => {
      outcome.evalResults = [...outcome.evalResults, ...(await captureEvals(page, trailingEvals))];
    },
    pairs: (input): readonly ResultPair[] => [
      ["evals", input.outcomes.reduce((count, outcome) => count + outcome.evalResults.length, 0)],
      ["eval-fails", evalFailures(input)],
    ],
    failures: (input): ArmFailureCounts => ({ eval: evalFailures(input) }),
  },
} satisfies ArmDef;
