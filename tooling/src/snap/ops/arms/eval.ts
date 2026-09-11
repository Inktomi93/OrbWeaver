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
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmPairInput } from "../../contract/arms.ts";
import type { EvalOutcome } from "../../contract/types.ts";
import { CHURN_LINE, capEvalText, isContextChurn, wrapEvalExpr } from "../../lib/eval-text.ts";
import { pushEval } from "../flags-support.ts";
import { writeArmEvidenceFile } from "./evidence-file.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --eval <expression>");

export async function captureEvals(page: Page, exprs: readonly string[]): Promise<EvalOutcome[]> {
  const results: EvalOutcome[] = [];
  for (const expr of exprs) {
    let text: string;
    let failed = false;
    // @orb-waive caught-failure-ownership(e): captured into the EvalOutcome as `failed: true` + an "EVAL ERROR" text, pushed into `results` and returned to the caller that prints/counts it. Ends if `failed`/`text` stop being read from the outcome.
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

/** The `evidence/evals.json` schema id — the run index's eval fact points at this file, and the report
 *  reader replays it. Versioned like every other snap artifact schema. */
const EVAL_EVIDENCE_SCHEMA = "snap-eval-values-v1";

/** THE VALUES, filed (#1342). What stdout printed, per page, in argv order: the expression, WHICH page tab
 *  produced it, and the JSON text or the `EVAL ERROR:` message. This is the whole receipt — a reviewer
 *  quoting "Chats 0 of 6" from a run must be able to find that string in the cited slot. */
function evalEvidenceRows({ outcomes }: ArmPairInput): readonly {
  readonly page: number;
  readonly expression: string;
  readonly value: string | null;
  readonly error: string | null;
}[] {
  return outcomes.flatMap((outcome) =>
    outcome.evalResults.map((entry) => ({
      page: outcome.pageIndex,
      expression: entry.expr,
      value: entry.failed ? null : entry.text,
      error: entry.failed ? entry.text : null,
    })),
  );
}

export const EVAL_ARM = {
  flags: [
    {
      flag: "--eval",
      kind: "required-value",
      pageTargetable: true,
      group: "Look",
      summary: "any in-page JS to JSON (repeatable, IN the tape); pass a bare arrow with no trailing ()",
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
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "eval"> => ({ eval: [] }),
  help: "  --eval <expression>     in-page JSON result (repeatable)",
  result: {
    schema: "snap-arm-eval-v1",
    source: "Playwright page.evaluate",
    lifetime: "settled page capture",
    enabled: (opts): boolean => opts.eval.length > 0,
  },
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
    evidence: async (input, slug): Promise<void> => {
      const rows = evalEvidenceRows(input);
      await writeArmEvidenceFile({
        arm: "eval",
        name: "evals",
        slug,
        schema: EVAL_EVIDENCE_SCHEMA,
        records: rows.length,
        completeness: "bounded",
        completenessDetail: "every expression the run evaluated, in argv order; each value carries the arm's 20 000-char both-ends cap",
        body: { v: 1, evals: rows },
      });
    },
    facts: (input): readonly ArmFactEmission<"eval">[] => {
      const expressions = input.outcomes.reduce((count, outcome) => count + outcome.evalResults.length, 0);
      const failures = evalFailures(input);
      let state: "off" | "failed" | "passed" = "off";
      if (input.opts.eval.length > 0) {
        state = failures > 0 ? "failed" : "passed";
      }
      return [
        {
          scope: aggregateScope(),
          data: { state, detail: null, expressions, failures },
        },
      ];
    },
    failures: (input): ArmFailureCounts => ({ eval: evalFailures(input) }),
    exit: (_input, code): number => code,
  },
} satisfies ArmDef<"eval">;
