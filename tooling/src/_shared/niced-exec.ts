// The portable replacement for the `nice` binary, which does not exist on Windows: lowers ITS OWN
// priority, then runs the real command, so the child inherits it. A package.json script invokes this
// directly for a third-party binary with no tooling CLI entry of ours; `proc.ts`'s niced doors spawn it
// too, as `process.execPath [this file, cmd, ...args]`, exactly where they used to spawn `nice -n 19 cmd`.
//
// Spawns through `spawnFullPriorityChild` rather than `node:child_process` directly (reviewed grant
// `tooling-child-process-door:niced-exec`, docs/law/Core-Tooling-Law.md §4.4) — this file has already
// lowered ITS OWN priority, so the "full priority" door here means only "no further wrapping": the real
// command inherits the lowered priority exactly as it would under `nice`. Its `process.argv` read is a
// censused entry (`tooling-argv-front-door:niced-exec`): it has no cli.ts shape, since ITS whole job is
// passing through whatever argv it is invoked with. It never calls `process.exit` — `run-tool.ts` is the
// one exit home, and this file is not a `runTool` program — so it sets `process.exitCode` and lets the
// event loop drain; a registered `process.on(signal, …)` listener does not itself keep node alive.
//
// NOT `detached`: the real child shares THIS process's own group (a package.json script's, or a niced
// door's synthetic detached group). A caller that kills the launcher's GROUP — the wedge watchdog and
// Ctrl-C in scripts/vitest-supervised.ts — must reach the real command too, and a detached child would be
// orphaned by exactly that kill. SIGINT/SIGQUIT/SIGHUP are what the terminal (or a group kill) already
// delivers to EVERY member of that shared group directly — the real child gets its own copy without any
// relay, so this launcher only ignores them (a no-op handler, so it does not die first and orphan the
// child by exiting). SIGTERM is typically aimed at ONE pid, this launcher's — that one IS relayed, direct
// to the child, never as a group signal (the child is not its own group leader here to relay one to).
import process from "node:process";
import { EXIT } from "./exit-contract.ts";
import { childExitCode, spawnFullPriorityChild } from "./proc.ts";
import { lowerToolingPriority } from "./process-priority.ts";

lowerToolingPriority();

function run(argv: readonly string[]): void {
  const [cmd, ...args] = argv;
  if (cmd === undefined) {
    process.stderr.write("niced-exec: no command given\n");
    process.exitCode = EXIT.misuse;
    return;
  }

  const child = spawnFullPriorityChild(cmd, args, { stdio: "inherit" });

  // Never dying from these is the whole point — they already reached the real child directly.
  const ignore = (): void => undefined;
  process.on("SIGINT", ignore);
  process.on("SIGQUIT", ignore);
  process.on("SIGHUP", ignore);
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  child
    .wait()
    .then((exit) => {
      if (exit.error !== undefined) {
        process.stderr.write(`niced-exec: spawn failed: ${cmd}: ${exit.error.message}\n`);
        process.exitCode = EXIT.toolError;
        return;
      }
      process.exitCode = childExitCode(exit);
    })
    .catch((error: unknown) => {
      // `wait()` never rejects (a spawn failure resolves as `exit.error`, above) — this is a pure
      // exhaustiveness backstop the `no-floating-promises` rule requires, never a real branch.
      process.stderr.write(`niced-exec: unreachable: ${String(error)}\n`);
      process.exitCode = EXIT.toolError;
    });
}

run(process.argv.slice(2));
