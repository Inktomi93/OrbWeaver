// dev — `pnpm dev`, the watched server plus the vite client from source. Argv parse and dispatch only.
// Exit: the first child's status, or 128+signal on a stop signal · 1 a setting the server would refuse · 3 misuse.
import process from "node:process";
import { runTool } from "../_shared/run-tool.ts";
import { runDev } from "./index.ts";

await runTool(async () => await runDev(process.argv.slice(2)));
