// A transparent launcher for a THIRD-PARTY binary a package.json script runs directly (biome, vitest,
// playwright, stryker) — those have no tooling CLI entry of ours to call `lowerToolingPriority` from, so
// this is the one. It lowers this process's own priority, then execs the given argv with inherited stdio
// and mirrors the child's exit faithfully; it is not a verdict tool and does not use the exit contract.
import { spawn } from "node:child_process";
import process from "node:process";
import { EXIT } from "./exit-contract.ts";
import { childExitCode, killPidGroup } from "./proc.ts";
import { lowerToolingPriority } from "./process-priority.ts";

lowerToolingPriority();

const [cmd, ...args] = process.argv.slice(2);
if (cmd === undefined) {
  process.stderr.write("niced-exec: no command given\n");
  process.exit(EXIT.misuse);
}

const child = spawn(cmd, args, { stdio: "inherit", detached: true });
const forward = (signal: NodeJS.Signals): void => {
  killPidGroup(child.pid, signal);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
child.on("error", (error) => {
  process.stderr.write(`niced-exec: failed to start ${cmd}: ${error.message}\n`);
  process.exit(EXIT.toolError);
});
child.on("exit", (code, signal) => {
  process.exit(childExitCode({ code, signal, error: undefined }));
});
