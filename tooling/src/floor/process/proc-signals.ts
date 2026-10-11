// The foreground launchers' signal wiring and exit mirroring: pure over an injected registrar, spawns
// nothing. Split out of ./proc.ts at its line cap; proc.ts re-exports these names, so importers keep their
// spelling, the same door discipline ./proc-contract.ts follows.
import { constants as osConstants } from "node:os";
import type { ChildExit, StopSignalTarget } from "./proc-contract.ts";

/** The signals a foreground launcher owes its children: Ctrl-C, a supervisor's stop, a closed terminal. */
export const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/** Wire each stop signal to the target. The registrar and the platform are injected (`process.on` and
 *  `process.platform` in a live launcher) so a test proves every platform's wiring without signalling its own
 *  runner. Registering our own handler is what keeps a Ctrl-C from killing the launcher before the child drains.
 *  On win32 the console already delivered the same event to the child, which shares it, and `kill` there is
 *  TerminateProcess whatever the signal: the launcher only notes the stop, so the child's own shutdown runs. */
export function forwardSignalsTo(target: StopSignalTarget, register: (signal: NodeJS.Signals, handler: () => void) => void, platform: NodeJS.Platform): void {
  const deliver = platform !== "win32";
  for (const signal of FORWARDED_SIGNALS) {
    register(signal, () => {
      target.noteStop(signal);
      if (deliver) {
        target.kill(signal);
      }
    });
  }
}

/** The shell convention for "killed by signal N". */
const SIGNAL_EXIT_BASE = 128;

/** Mirror a child's exit faithfully: its code, or 128+signal when a signal took it (Ctrl-C gives 130). */
export function childExitCode(exit: ChildExit): number {
  if (exit.signal === null) {
    return exit.code ?? 0;
  }
  return SIGNAL_EXIT_BASE + osConstants.signals[exit.signal];
}

// First name wins where two share a number (SIGABRT before SIGIOT), which is the name a person expects.
const SIGNAL_BY_NUMBER: ReadonlyMap<number, NodeJS.Signals> = (Object.keys(osConstants.signals) as readonly NodeJS.Signals[]).reduce(
  (map, signal) => (map.has(osConstants.signals[signal]) ? map : map.set(osConstants.signals[signal], signal)),
  new Map<number, NodeJS.Signals>(),
);

/** The inverse of {@link childExitCode}: the signal a mirrored exit code names, or null for a plain code. A
 *  supervisor whose child runs through the mirror (the win32 niced-exec launcher) sees a signal death as a code, and must
 *  still tell it from a verdict. */
export function signalOfExitCode(code: number): NodeJS.Signals | null {
  return SIGNAL_BY_NUMBER.get(code - SIGNAL_EXIT_BASE) ?? null;
}
