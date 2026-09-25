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
import process from "node:process";
import { EXIT } from "./exit-contract.ts";
import { needsWindowsShell, quoteWindowsShellArg } from "./niced-exec-shell.ts";
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

  const shell = needsWindowsShell(cmd, process.platform);
  const child = spawnFullPriorityChild(cmd, shell ? args.map(quoteWindowsShellArg) : args, {
    stdio: "inherit",
    shell,
    // Its OWN process group on POSIX — never this launcher's. A package.json script's child shares the
    // terminal's foreground group by default, so a Ctrl-C reaches BOTH the launcher and an un-detached
    // real child directly, and the explicit forward below would deliver a SECOND SIGINT — vitest and
    // Playwright can skip graceful teardown on a double signal. Detaching makes this launcher the ONE path
    // in: the terminal signals it, and it alone decides whether and how to relay. win32 `detached` opens a
    // console window instead, so it stays off there — win32's terminal delivery is a different mechanism.
    detached: process.platform !== "win32",
  });

  // Forwarded to the child's OWN process group (killGroup), never a single-process kill: detaching it
  // above is what makes this the only delivery path, so relaying once here is exactly once, never twice.
  const forward = (signal: NodeJS.Signals): void => {
    child.killGroup(signal);
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGHUP", () => forward("SIGHUP"));

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
