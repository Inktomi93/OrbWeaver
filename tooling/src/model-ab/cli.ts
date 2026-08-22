// model-ab — the serving-variant A/B harness. Argv parse + dispatch ONLY (the five-slot cap); the
// programmatic surface is ./index.ts.
//
//   node tooling/src/model-ab/cli.ts --list
//   node tooling/src/model-ab/cli.ts                        # all variants whose model path exists
//   node tooling/src/model-ab/cli.ts --variants w8a8-sideload,w8a8-stock-template
//   node tooling/src/model-ab/cli.ts --keep-up              # leave the LAST variant serving for manual pokes
//   node tooling/src/model-ab/cli.ts --base-url http://127.0.0.1:8100 --model <served-id>   # probe a running server, no boot
//
// Exit: 0 clean · 1 REFUSED (the GPUs are held by the quantize job or the fleet) · 2 the harness broke
// (no vllm binary) · 3 misuse. Probe ERRORS are recorded as results, never exits — a stock-template 400 is
// a finding, not a harness failure.
import process from "node:process";
import { runTool } from "../_shared/run-tool.ts";
import { runModelAb } from "./index.ts";

async function main(): Promise<number> {
  return await runModelAb(process.argv.slice(2));
}

await runTool(main);
