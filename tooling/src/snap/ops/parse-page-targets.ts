// Page/context target validation shared by the parser's cross-flag validation pass.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

function targetedPages(args: Args): number[] {
  return [
    ...args.actions.map((entry) => entry.action.page),
    ...args.eval.map((entry) => entry.page),
    ...args.contrast.map((entry) => entry.page),
    ...args.cascade.map((entry) => entry.page),
    ...args.assertions.map((assertion) => assertion.page),
    ...(args.aria ? [args.ariaPage] : []),
    ...(args.map ? [args.mapPage] : []),
  ];
}

export function validatePageTargets(args: Args, contextsMode: boolean): string[] {
  const targetCount = contextsMode ? args.contexts : args.pages;
  const errors: string[] = [];
  for (const page of targetedPages(args)) {
    if (page >= targetCount) {
      errors.push(`page target @${page} is out of range for ${contextsMode ? "contexts" : "pages"}=${targetCount}`);
    }
  }
  return errors;
}
