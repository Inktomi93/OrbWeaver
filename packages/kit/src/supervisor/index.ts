// @orb/kit/supervisor — the contract between a launcher that supervises the server and the server it spawns.
// One home for both sides: the launcher sets the key and loops on the code; the server reads the key before it
// offers a restart and ends with the code to ask for one.

/** The env key a supervisor sets on the server's child env. Launch-only: it is never written to `.env`. */
export const SUPERVISOR_ENV_KEY = "ORB_SUPERVISOR";

/** The value `pnpm start` sets: the one launcher that respawns the server. */
export const START_SUPERVISOR = "pnpm-start";

/** The exit code the server ends with to be spawned again: sysexits `EX_TEMPFAIL`, outside the tool codes
 *  (0 to 3) and the `128 + signal` range, so a crash or a Ctrl-C never reads as a restart. */
export const RESTART_EXIT_CODE = 75;

/** Was this process started by a launcher that respawns it on {@link RESTART_EXIT_CODE}? */
export function isSupervised(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[SUPERVISOR_ENV_KEY] === START_SUPERVISOR;
}

/** Did the child ask to be spawned again? `null` is a signal death, which is never a restart. */
export function isRestartExit(code: number | null): boolean {
  return code === RESTART_EXIT_CODE;
}
