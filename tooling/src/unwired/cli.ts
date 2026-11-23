// unwired: the type-aware scans for code no production path reaches. Argv and dispatch only; the surface is ./index.ts.
import process from "node:process";
import { runTool } from "../floor/cli/run-tool.ts";
import { exportProcessEnv, processEnvValue } from "../floor/process/process-env.ts";
import { lowerToolingPriority } from "../floor/process/process-priority.ts";
import { runUnwired, TRIAL_VERB } from "./index.ts";

// The compiler process is Go, whose collector lets the heap grow to twice the live set: on the real tree that passes
// the run's memory bar while node holds well under a gigabyte. A soft limit makes it collect first; a limit the caller
// set wins.
const GO_MEMORY_LIMIT_ENV = "GOMEMLIMIT";
const COMPILER_HEAP_LIMIT = "12GiB";
// graph-trial holds a throwaway program beside the base one in each snapshot, so its compiler gets the larger limit
// (owner ruling for the trial alone).
const TRIAL_HEAP_LIMIT = "32GiB";
const argv = process.argv.slice(2);

// The TypeScript 7.1 API spawns its own compiler process, which inherits this priority and environment; no door can
// change either after.
lowerToolingPriority();
if (processEnvValue(GO_MEMORY_LIMIT_ENV) === undefined) {
  exportProcessEnv(GO_MEMORY_LIMIT_ENV, argv[0] === TRIAL_VERB ? TRIAL_HEAP_LIMIT : COMPILER_HEAP_LIMIT);
}
await runTool(() => runUnwired(argv));
