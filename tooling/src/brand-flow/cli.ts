// brand-flow: the type-aware scan of branded ids widened to strings. Argv, the run's memory bar and dispatch only; the
// surface is ./index.ts.
//
// The owner set 32 GB as the most one `pnpm brand-flow` run may hold, Node and its compiler together. Node's heap ceiling
// is fixed here, and the compiler's Go soft limit is the rest of the bar, so the two can never sum past it. A ceiling or
// a limit the caller set wins.
import process from "node:process";
import { exportProcessEnv, inheritedProcessEnv, processEnvValue } from "../floor/process/process-env.ts";
import { lowerToolingPriority } from "../floor/process/process-priority.ts";

const MEMORY_BAR_MIB = 32_768;
// Half the bar, the workspace's own Node default: a profiled run's `profile memory` line shows whether Node or the
// compiler needs the larger share.
const NODE_HEAP_CEILING_MIB = 16_384;
const NODE_HEAP_OPTION = "--max-old-space-size";
const GO_MEMORY_LIMIT_ENV = "GOMEMLIMIT";

// A command-line heap option outranks the workspace's NODE_OPTIONS, so the re-exec carries the ceiling as one; a run
// started with its own command-line ceiling is the caller's choice.
if (!process.execArgv.some((option) => option.startsWith(NODE_HEAP_OPTION))) {
  process.execve?.(
    process.execPath,
    [process.execPath, ...process.execArgv, `${NODE_HEAP_OPTION}=${String(NODE_HEAP_CEILING_MIB)}`, ...process.argv.slice(1)],
    inheritedProcessEnv(),
  );
}
// The TypeScript 7.1 API spawns its own compiler process, which inherits this priority and environment; no door can
// change either after.
lowerToolingPriority();
if (processEnvValue(GO_MEMORY_LIMIT_ENV) === undefined) {
  exportProcessEnv(GO_MEMORY_LIMIT_ENV, `${String(MEMORY_BAR_MIB - NODE_HEAP_CEILING_MIB)}MiB`);
}
const { runTool } = await import("../floor/cli/run-tool.ts");
const { runBrandFlow } = await import("./index.ts");
await runTool(() => runBrandFlow(process.argv.slice(2)));
