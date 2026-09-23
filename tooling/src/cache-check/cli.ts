// cache-check — the live prompt-cache check per route. Argv and dispatch only; the surface is ./index.ts.
// On demand and before releases, never in CI: every run spends real provider tokens.
import process from "node:process";
import { runTool } from "../_shared/run-tool.ts";
import { runCacheCheck } from "./index.ts";

async function main(): Promise<number> {
  return await runCacheCheck(process.argv.slice(2));
}

await runTool(main);
