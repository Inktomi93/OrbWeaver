// The portable replacement for the `nice` binary, which does not exist on Windows: lowers ITS OWN
// priority, then runs the real command, so the child inherits it. A package.json script invokes this
// directly for a third-party binary with no tooling CLI entry of ours; `proc.ts`'s niced doors spawn it
// too, as `process.execPath [this file, cmd, ...args]`, exactly where they used to spawn `nice -n 19 cmd`.
//
// Spawns through `spawnFullPriorityChild` rather than `node:child_process` directly (reviewed grant
// `tooling-child-process-door:niced-exec`, docs/law/Core-Tooling-Law.md §4.4) — this file has already
// lowered ITS OWN priority, so the "full priority" door here means only "no further wrapping": the real
// command inherits the lowered priority exactly as it would under `nice`.
import process from "node:process";
import { EXIT } from "./exit-contract.ts";
import { childExitCode, spawnFullPriorityChild } from "./proc.ts";
import { lowerToolingPriority } from "./process-priority.ts";

lowerToolingPriority();

const [cmd, ...args] = process.argv.slice(2);
if (cmd === undefined) {
  process.stderr.write("niced-exec: no command given\n");
  process.exit(EXIT.misuse);
}

const child = spawnFullPriorityChild(cmd, args, {
  stdio: "inherit",
  // Windows npm-bin shims (biome.cmd, vitest.cmd, …) are batch scripts the OS cannot exec directly; a
  // shell is required there and nowhere else — a POSIX shell would reopen the unescaped-argv injection
  // door this launcher exists to avoid.
  shell: process.platform === "win32",
});

// Forwarded directly to the real command, not through a process-group signal: this launcher may or may not
// be its own group leader depending on who spawned it (a niced door on POSIX sets `detached`; a plain
// `node niced-exec.ts …` from a package.json script does not), so a direct forward is the one path that is
// correct either way. SIGHUP too, or closing the terminal orphans the child.
const forward = (signal: NodeJS.Signals): void => {
  child.kill(signal);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGHUP", () => forward("SIGHUP"));

const exit = await child.wait();
if (exit.error !== undefined) {
  process.stderr.write(`niced-exec: spawn failed: ${cmd}: ${exit.error.message}\n`);
  process.exit(EXIT.toolError);
}
process.exit(childExitCode(exit));
