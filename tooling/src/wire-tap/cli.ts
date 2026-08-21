// wire-tap — the server-wire incident toolkit, three ops behind one dispatcher:
//   sse       (`pnpm sse-tap <chatId>`)  attach + stream the chat room's SSE frames
//   captures  (`wire-tap captures …`)    read the wire-capture recorder (requests / --outcomes)
//   trpc      (`wire-tap trpc <proc> …`) the uncookied dev tRPC harvest
// Argv parse + dispatch ONLY (the five-slot cap); the programmatic surface is ./index.ts.
// Incident instrument, idle-by-design (docs/design/tooling-package.md §4.5): the CI proof is a
// loopback fixture server, never the dev stack.
// Exit: 0 clean · 1 stream error / non-OK harvest · EXIT.misuse on a bad subcommand/flag.
import process from "node:process";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { capturesOp, sseOp, trpcOp } from "./index.ts";

async function main(): Promise<number> {
  const [sub, ...rest] = process.argv.slice(2);
  if (sub === "sse") {
    return await sseOp(rest);
  }
  if (sub === "captures") {
    return await capturesOp(rest);
  }
  if (sub === "trpc") {
    return await trpcOp(rest);
  }
  throw new UsageError(`unknown subcommand ${JSON.stringify(sub ?? "")} — expected sse | captures | trpc (pnpm sse-tap drives the sse op)`);
}

await runTool(main);
