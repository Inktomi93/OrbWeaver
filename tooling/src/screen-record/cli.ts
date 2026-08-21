// record — the animation-responsiveness screencast probe. Argv parse + dispatch ONLY (the five-slot
// cap); the programmatic surface is ./index.ts.
//
// Records a headless chromium video of a scripted interaction tape against the running dev stack
// (`pnpm stack start` first), then renders with ffmpeg: <out>.webm always; <out>.gif (20fps,
// palette-optimized); <out>-click<i>.png 6-tile × 120ms strips around each click (count tiles from the
// corner-marker flip to first motion — 1 tile = 120ms); with --frames, one full-res PNG per step.
// No ffmpeg → the webm still lands and the render legs SKIP with a reason (skip ≠ fail).
//
// Exit: 0 recorded · 1 step failure / page error · EXIT.misuse on a bad CLI (promotion refinement:
// record was the fleet's last lenient parser).
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";
import { parseRecordArgs, RECORD_HELP, runScreenRecord } from "./index.ts";

async function main(): Promise<number> {
  const opts = parseRecordArgs(process.argv.slice(2));
  if (opts.errors.length > 0) {
    for (const message of opts.errors) {
      print(`ARG ERROR    ${message}`);
    }
    print("");
    print(RECORD_HELP);
    return EXIT.misuse;
  }
  return await runScreenRecord(opts);
}

await runTool(main);
