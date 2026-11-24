// unwired: the type-aware scans for code no production path reaches. Argv and dispatch only; the surface is ./index.ts.
import process from "node:process";
import { runTool } from "../floor/cli/run-tool.ts";
import { exportProcessEnv, processEnvValue } from "../floor/process/process-env.ts";
import { lowerToolingPriority } from "../floor/process/process-priority.ts";
import { runUnwired } from "./index.ts";

// The compiler process is Go, whose collector lets the heap grow to twice the live set, and a limit near the live set
// spends most of the compiler's CPU on collection. The owner gave one `pnpm unwired` run 32 GiB, so the compiler's
// soft limit is that whole bar; a limit the caller set wins.
const GO_MEMORY_LIMIT_ENV = "GOMEMLIMIT";
const COMPILER_MEMORY_LIMIT = "32GiB";

// The TypeScript 7.1 API spawns its own compiler process, which inherits this priority and environment; no door can
// change either after.
lowerToolingPriority();
if (processEnvValue(GO_MEMORY_LIMIT_ENV) === undefined) {
  exportProcessEnv(GO_MEMORY_LIMIT_ENV, COMPILER_MEMORY_LIMIT);
}
await runTool(() => runUnwired(process.argv.slice(2)));
