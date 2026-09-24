// `pnpm start`'s supervisor loop: the once-per-invocation pass, then spawn, wait and respawn while the server exits
// with `RESTART_EXIT_CODE`. Each spawn's plan is rebuilt from `.env`, because a restart exists to apply a changed file.
// Signal handlers are registered once for the whole loop and reach whichever child is current.
import { isRestartExit } from "@orb/kit/supervisor";
import { EXIT } from "../../_shared/exit-contract.ts";
import { childExitCode, forwardSignalsTo } from "../../_shared/proc.ts";
import type { StartSupervisorDeps, SupervisedChild } from "../contract/types.ts";

/** Run the prepare pass once, then the server until it exits with anything but the restart code. A stop signal
 *  ends the loop whatever code the child then exits with, so a Ctrl-C during a restart never respawns. */
export async function superviseStart(deps: StartSupervisorDeps): Promise<number> {
  const stop = await deps.prepare();
  if (stop !== null) {
    return stop;
  }
  // A holder, not a `let`: the signal handler writes it, which control-flow narrowing cannot see.
  const state: { child: SupervisedChild | null; signal: NodeJS.Signals | null } = { child: null, signal: null };
  forwardSignalsTo(
    {
      kill: (signal): void => {
        state.signal ??= signal;
        state.child?.kill(signal);
      },
    },
    deps.register,
  );
  for (;;) {
    const child = deps.spawn(deps.launch());
    state.child = child;
    const exit = await child.wait();
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
