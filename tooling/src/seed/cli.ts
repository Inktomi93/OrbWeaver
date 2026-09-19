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
import { loadChatSeed, loadDemoSeed, loadMultiUserSeed } from "./index.ts";

const USAGE = "usage: seed (demo [--fresh] [--force] | chat [--messages N] [--characters M] [--title T] [--force] | multi-user)";

// Per-verb LAZY loaders, via ./index.ts (tooling-cli-via-index) — `demo`/`chat` pull in the server env
// schema (domain verbs, db); `multi-user` only speaks HTTP. index.ts's loaders carry no eager op import, so
// dispatching through them still pays the server-schema parse cost only for the verb that needs it,
// including never for `multi-user` (#2407).
async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "demo") {
    const { runDemoSeed } = await loadDemoSeed();
    return await runDemoSeed(rest);
  }
  if (command === "chat") {
    const { runChatSeed } = await loadChatSeed();
    return await runChatSeed(rest);
  }
  if (command === "multi-user") {
    if (rest.length > 0) {
      throw new UsageError(USAGE);
    }
    const { runMultiUserSeed } = await loadMultiUserSeed();
    return await runMultiUserSeed();
  }
  throw new UsageError(USAGE);
}

await runTool(main);
