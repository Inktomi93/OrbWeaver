// render-trace — the request-trace toolkit, three ops behind one dispatcher (the trace family):
//   render  (`pnpm trace:render [<file>|-]`)  a RequestTrace JSON → colored ASCII waterfall
//   tail    (`pnpm trace:tail [--token=…]`)   poll /api/_debug/traces, print each NEW trace
//   fire    (`pnpm trace:fire [<path> ...]`)  ephemeral server + one-shot requests → waterfalls
// Argv parse + dispatch ONLY (the five-slot cap); the programmatic surface is ./index.ts.
// Exit: 0 clean · 1 a fired request failed · EXIT.toolError when the run recorded NOTHING (a spanless
// trace, an unmounted observability middleware, requests whose traces never appeared — #409, and note
// an EMPTY traces list is a real answer that stays clean) · EXIT.misuse on a bad subcommand/input.
import process from "node:process";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { fireOp, renderOp, tailOp } from "./index.ts";

async function main(): Promise<number> {
  const [sub, ...rest] = process.argv.slice(2);
  if (sub === "render") {
    return await renderOp(rest);
  }
  if (sub === "tail") {
    return await tailOp(rest);
  }
  if (sub === "fire") {
    return await fireOp(rest);
  }
  throw new UsageError(`unknown subcommand ${JSON.stringify(sub ?? "")} — expected render | tail | fire (pnpm trace:render / trace:tail / trace:fire)`);
}

await runTool(main);
