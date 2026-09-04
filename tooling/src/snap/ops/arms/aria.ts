// The `--aria` / `--text` ARM: the page's accessibility tree, which is the cheapest honest description of
// a rendered surface an agent can read (no pixels, no tokens spent on an image). Split out of the former
// ops/evidence.ts by NATURE when the arm registry landed — one file per arm (contract/arms.ts).
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmPairInput } from "../../contract/arms.ts";
import type { Args } from "../../contract/types.ts";
import { WAIT_SELECTOR_TIMEOUT_MS } from "../../lib/budgets.ts";
import { consumeOptionalSelector } from "../flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --text");

interface AriaOutcome {
  readonly text: string | null;
  readonly error: string | null;
}

async function captureAria(page: Page, opts: Args): Promise<AriaOutcome> {
  try {
    const root = page.locator(opts.ariaSelector).first();
    await root.waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS });
    const ariaOpts: { depth?: number; boxes?: boolean } = { boxes: opts.ariaBoxes };
    if (opts.ariaDepth !== null) {
      ariaOpts.depth = opts.ariaDepth;
    }
    return { text: await root.ariaSnapshot(ariaOpts), error: null };
  } catch (e) {
    return { text: null, error: `ARIA capture failed for "${opts.ariaSelector}": ${errorMessage(e)}` };
  }
}

/** `--text` is `--aria` plus "keep the tokens": it suppresses the primary screenshot, which is the ONE
 *  place an arm writes a field the pixel arm owns — deliberate, and the reason the two share a handler. */
function ariaFlag(args: Args, rest: string[], textMode: boolean, page: number): void {
  args.aria = true;
  args.ariaPage = page;
  if (textMode) {
    args.shot = false;
  }
  const selector = consumeOptionalSelector(rest);
  if (selector !== null) {
    args.ariaSelector = selector;
  }
}

function ariaFailures({ outcomes }: ArmPairInput): number {
  return outcomes.filter((outcome) => outcome.ariaError !== null).length;
}

export const ARIA_ARM = {
  flags: [
    { flag: "--aria", kind: "optional-selector", pageTargetable: true, handler: (a, rest, page): void => ariaFlag(a, rest, false, page) },
    { flag: "--text", kind: "optional-selector", pageTargetable: true, handler: (a, rest, page): void => ariaFlag(a, rest, true, page) },
    {
      flag: "--aria-depth",
      kind: "required-value",
      pageTargetable: false,
      handler: (a, rest): void => {
        a.ariaDepth = Number(rest.shift() ?? "0") || null;
      },
    },
    {
      flag: "--aria-boxes",
      kind: "boolean",
      pageTargetable: false,
      handler: (a): void => {
        a.ariaBoxes = true;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "aria" | "ariaSelector" | "ariaDepth" | "ariaBoxes" | "ariaPage"> => ({
    aria: false,
    ariaSelector: "body",
    ariaDepth: null,
    ariaBoxes: false,
    ariaPage: 0,
  }),
  help: `  --aria [selector]       ARIA tree, keeping the primary screenshot
  --text [selector]       ARIA tree, no primary screenshot
  --aria-depth <n>        cap the tree depth (requires --aria/--text)
  --aria-boxes            annotate each node with its rendered box (requires --aria/--text)`,
  result: { schema: "snap-arm-aria-v1", source: "Playwright ARIA snapshot", lifetime: "settled page capture", enabled: (opts): boolean => opts.aria },
  lifecycle: {
    at: "page",
    enabled: ({ opts, pageIndex }): boolean => opts.aria && opts.ariaPage === pageIndex,
    run: async ({ page, opts, outcome }): Promise<void> => {
      const aria = await captureAria(page, opts);
      outcome.ariaText = aria.text;
      outcome.ariaError = aria.error;
    },
    pairs: (input): readonly ResultPair[] => [
      ["aria", input.outcomes.some((outcome) => outcome.ariaText !== null) ? "yes" : "no"],
      ["aria-fails", ariaFailures(input)],
    ],
    facts: (input): readonly ArmFactEmission<"aria">[] => {
      const failures = ariaFailures(input);
      const captures = input.outcomes.filter((outcome) => outcome.ariaText !== null).length;
      let state: "off" | "failed" | "passed" = "off";
      if (input.opts.aria) {
        state = failures > 0 ? "failed" : "passed";
      }
      return [{ scope: aggregateScope(), data: { state, detail: null, captures, failures } }];
    },
    failures: (input): ArmFailureCounts => ({ aria: ariaFailures(input) }),
    exit: (_input, code): number => code,
  },
} satisfies ArmDef<"aria">;
