// unwired: the type-aware scans for code no production path reaches. Argv and dispatch only; the surface is ./index.ts.
import process from "node:process";
import { runTool } from "../floor/cli/run-tool.ts";
import { lowerToolingPriority } from "../floor/process/process-priority.ts";
import { runUnwired } from "./index.ts";

// The TypeScript 7.1 API spawns its own compiler process, which inherits this priority; no door can lower it after.
lowerToolingPriority();
await runTool(() => runUnwired(process.argv.slice(2)));
