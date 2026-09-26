// `pnpm start`'s supervisor loop: the once-per-invocation pass, then spawn, wait and respawn while the server exits
// with `RESTART_EXIT_CODE`. Each spawn's plan is rebuilt from `.env`, because a restart exists to apply a changed file.
// Signal handlers are registered once for the whole loop and reach whichever child is current; on win32 the console
// reaches the child itself, so the handler only records the stop.
// The browser open waits beside a child and ends with it, so a server that dies in boot opens nothing; its respawn waits.
import { isRestartExit } from "@orb/kit/supervisor";
import { EXIT } from "../../_shared/exit-contract.ts";
import { childExitCode, forwardSignalsTo } from "../../_shared/proc-signals.ts";
import type { StartSupervisorDeps, SupervisedChild } from "../contract/types.ts";
import { startAppUrl } from "./start-plan.ts";

/** Open the app once the server on `port` answers, unless that child exits first. */
async function openWhenServed(deps: StartSupervisorDeps, port: number, alive: AbortSignal, pending: { open: boolean }): Promise<void> {
  if ((await deps.served(port, alive)) && !alive.aborted) {
    pending.open = false;
    await deps.openApp(startAppUrl(port));
  }
}

/** Run the prepare pass once, then the server until it exits with anything but the restart code. A stop signal
 *  ends the loop whatever code the child then exits with, so a Ctrl-C during a restart never respawns. */
export async function superviseStart(deps: StartSupervisorDeps): Promise<number> {
  const stop = await deps.prepare();
  if (stop !== null) {
    return stop;
  }
  const browser = deps.browser();
  if (browser.kind === "refused") {
    deps.notice(browser.reason);
  }
  // A holder, not a `let`: the open resolves beside the loop, which control-flow narrowing cannot see.
  const pending = { open: browser.kind === "open" };
  // A holder, not a `let`: the signal handler writes it, which control-flow narrowing cannot see.
  const state: { child: SupervisedChild | null; signal: NodeJS.Signals | null } = { child: null, signal: null };
  forwardSignalsTo(
    {
      noteStop: (signal): void => {
        state.signal ??= signal;
      },
      kill: (signal): void => {
        state.child?.kill(signal);
      },
    },
    deps.register,
    deps.platform,
  );
  for (;;) {
    const spawn = deps.launch();
    const child = deps.spawn(spawn.plan);
    state.child = child;
    const alive = new AbortController();
    if (pending.open) {
      // @orb-waive caught-failure-ownership(openWhenServed): the open has no awaiter, because an opener can outlive the server; a rejection is printed to the operator through `notice`, and the server keeps running because a browser is a convenience. Ends if the open gains an awaiter.
      openWhenServed(deps, spawn.port, alive.signal, pending).catch((error: unknown) => {
        deps.notice(`could not open a browser — ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    const exit = await child.wait();
    alive.abort();
    if (exit.error !== undefined) {
      deps.notice(`could not run the server — ${exit.error.message}`);
      return EXIT.toolError;
    }
    if (state.signal !== null || !isRestartExit(exit.code)) {
      return childExitCode(exit);
    }
    deps.notice("the server asked to restart; reading .env again and starting it.");
  }
}
