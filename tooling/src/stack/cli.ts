// stack — `pnpm stack`, `pnpm start`, `pnpm share` and `pnpm fixture`: the dev and prod supervisors, the
// production launcher and the two-human fixture, on every platform. Argv parse and dispatch only.
// Exit: 0 clean · 1 refused or a failed boot · 2 tool error · 3 misuse; a foreground run mirrors its child.
import process from "node:process";
import { runTool } from "../_shared/run-tool.ts";
import { runStack } from "./index.ts";

await runTool(async () => await runStack(process.argv.slice(2)));
