// perf-meter — per-step interaction responsiveness. Argv parse + dispatch ONLY (the five-slot cap);
// the programmatic surface is ./index.ts.
//
// Runs a scripted step sequence against the running dev stack (`pnpm stack start` first) and buckets,
// PER STEP: long tasks (LoAF-attributed where supported), PerformanceEventTiming for the dispatched
// click (input delay / processing / full duration), worst rAF gap (the 34-49ms dropped-frame band LoAF
// cannot see), and layout-shift score. Output: a per-step console table + reports/perf-meter/<out>.json
// with the raw entries, so repetition-decay questions ("is the 8th open slower than the 1st?") are a
// column scan. `--cpuprofile` additionally captures a V8 CPU profile of the whole tape (Chrome DevTools
// Performance panel / speedscope.app — the function-level "WHO burned that long task" answer).
//
// This is a METER, not a gate: breaches are reported (breach-steps in the RESULT line), and the exit
// reddens only when the interaction itself broke (step failures / page errors).
//
// Exit: 0 clean · 1 step failure / page error · EXIT.toolError when NOTHING was metered (absent
// in-page meter, an empty step tape, no long-task observer — #409) · EXIT.misuse on a bad CLI.
import process from "node:process";
import { withInstrumentRun } from "../_shared/artifact-out.ts";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";
import { PERF_METER_HELP, parsePerfArgs, runCpuProfile } from "./index.ts";

async function main(): Promise<number> {
  const opts = parsePerfArgs(process.argv.slice(2));
  if (opts.errors.length > 0) {
    for (const message of opts.errors) {
      print(`ARG ERROR    ${message}`);
    }
    print("");
    print(PERF_METER_HELP);
    return EXIT.misuse;
  }
  if (opts.help) {
    print(PERF_METER_HELP);
    return 0;
  }
  // The run's own artifact slot; `reports/perf-meter/<out>.json` is its published pointer (#1164).
  return await withInstrumentRun("cpu-profile", async () => await runCpuProfile(opts));
}

await runTool(main);
