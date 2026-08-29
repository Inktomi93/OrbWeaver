// review-mirror — manual milestone generation of the comment-stripped code mirror plus E5/E6/E7 review
// evidence. D62 forbids a standing schedule; `pnpm review:mirror [fresh-target-dir]` is the one front door.
// `--evidence-out <path>` additionally deposits the evidence JSON at an in-repo path (#770): the bulky
// external mirror stays throwaway, but the milestone run leaves a tracked, board-linkable findings artifact.
// Exit: 0 generated with complete evidence · 2 generation/evidence failure · 3 bad arguments.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import type { RunReviewMirrorOptions } from "./index.ts";
import { runReviewMirror } from "./index.ts";

const HELP =
  "usage: pnpm review:mirror [fresh-target-dir] [--evidence-out <path>]\n\nGenerates a docless/comment-stripped tracked-code mirror and review-mirror-evidence.json.\nThe target must be absent or empty; no existing review tree is overwritten.\n--evidence-out <path> also writes the evidence JSON to an in-repo path (absolute, or relative to the repo root) to keep the sweep's findings as a tracked artifact.";

const EVIDENCE_OUT_FLAG = "--evidence-out";

// Split `--evidence-out X` / `--evidence-out=X` out of the argv so the caller is left with only positional
// arguments. A present-but-empty value is misuse, and every other `--flag` remains unknown.
function extractEvidenceOut(args: readonly string[]): { flagSeen: boolean; evidenceOut?: string; positional: string[] } {
  const positional: string[] = [];
  let flagSeen = false;
  let evidenceOut: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg.startsWith(`${EVIDENCE_OUT_FLAG}=`)) {
      flagSeen = true;
      evidenceOut = arg.slice(EVIDENCE_OUT_FLAG.length + 1);
    } else if (arg === EVIDENCE_OUT_FLAG) {
      flagSeen = true;
      evidenceOut = args[index + 1];
      index += 1;
    } else {
      positional.push(arg);
    }
  }
  return evidenceOut === undefined ? { flagSeen, positional } : { flagSeen, evidenceOut, positional };
}

function parseArgs(args: readonly string[]): RunReviewMirrorOptions {
  const { flagSeen, evidenceOut, positional } = extractEvidenceOut(args);
  if (flagSeen && (evidenceOut === undefined || evidenceOut === "" || evidenceOut.startsWith("--"))) {
    throw new UsageError(HELP);
  }
  if (positional.length > 1 || positional.some((arg) => arg.startsWith("--"))) {
    throw new UsageError(HELP);
  }
  const target = positional[0];
  return { ...(target === undefined ? {} : { target }), ...(evidenceOut === undefined ? {} : { evidenceOut }) };
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    print(HELP);
    return EXIT.clean;
  }
  return runReviewMirror(parseArgs(args)).code;
}

await runTool(main);
