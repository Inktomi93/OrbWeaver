// review-mirror — manual milestone generation of the comment-stripped code mirror plus E5/E6/E7 review
// evidence. D62 forbids a standing schedule; `pnpm review:mirror [fresh-target-dir]` is the one front door.
// Exit: 0 generated with complete evidence · 2 generation/evidence failure · 3 bad arguments.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { runReviewMirror } from "./index.ts";

const HELP =
  "usage: pnpm review:mirror [fresh-target-dir]\n\nGenerates a docless/comment-stripped tracked-code mirror and review-mirror-evidence.json.\nThe target must be absent or empty; no existing review tree is overwritten.";

function main(): number {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    print(HELP);
    return EXIT.clean;
  }
  if (args.length > 1 || args.some((arg) => arg.startsWith("--"))) {
    throw new UsageError(HELP);
  }
  return runReviewMirror(args[0] === undefined ? {} : { target: args[0] }).code;
}

await runTool(main);
