// seed — the three DEV database seeders. Argv parse + dispatch ONLY (the five-slot cap); the programmatic
// surface is ./index.ts.
//
//   pnpm seed:demo [--fresh] [--force]                 demo        the verifiable demo corpus
//   node tooling/src/seed/cli.ts chat [--messages N]   chat        the heavy long-transcript fixture
//   node tooling/src/seed/cli.ts multi-user            multi-user  flip a RUNNING local fixture two-human
//
// Exit: 0 clean · 1 a guard refused (production without --force, --fresh without a file: url) · 2 the seed
// broke · 3 misuse (unknown verb, or the multi-user contract env is missing).
import process from "node:process";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { runChatSeed, runDemoSeed, runMultiUserSeed } from "./index.ts";

const USAGE = "usage: seed (demo [--fresh] [--force] | chat [--messages N] [--characters M] [--title T] [--force] | multi-user)";

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "demo") {
    return await runDemoSeed(rest);
  }
  if (command === "chat") {
    return await runChatSeed(rest);
  }
  if (command === "multi-user") {
    if (rest.length > 0) {
      throw new UsageError(USAGE);
    }
    return await runMultiUserSeed();
  }
  throw new UsageError(USAGE);
}

await runTool(main);
