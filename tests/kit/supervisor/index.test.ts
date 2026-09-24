// @orb/kit/supervisor — the contract between `pnpm start`'s supervisor and the server it spawns: the env key the
// supervisor sets and the exit code that asks for a respawn. Both sides import these; a drift is a server that
// never restarts or a launcher that loops on a crash.
import { isRestartExit, isSupervised, RESTART_EXIT_CODE, START_SUPERVISOR, SUPERVISOR_ENV_KEY } from "@orb/kit/supervisor";
import { expect, test } from "../../support/fixtures.ts";

test("the server reads the supervisor from the env key the launcher sets, and nothing else counts", () => {
  expect(isSupervised(Object.fromEntries([[SUPERVISOR_ENV_KEY, START_SUPERVISOR]]))).toBe(true);
  // Control: an env without the key, an empty value, or a value that names no launcher is not supervised.
  expect(isSupervised({})).toBe(false);
  expect(isSupervised(Object.fromEntries([[SUPERVISOR_ENV_KEY, ""]]))).toBe(false);
  expect(isSupervised(Object.fromEntries([[SUPERVISOR_ENV_KEY, "systemd"]]))).toBe(false);
  expect(isSupervised(Object.fromEntries([[SUPERVISOR_ENV_KEY, undefined]]))).toBe(false);
});

test("the restart code is one the server never uses for anything else: not clean, not a failure, not a signal", () => {
  expect(isRestartExit(RESTART_EXIT_CODE)).toBe(true);
  // Control: a clean stop, a boot failure, the tool-error and misuse codes and a Ctrl-C (128+2) all end the supervisor.
  for (const other of [0, 1, 2, 3, 130, 143, null]) {
    expect(isRestartExit(other), String(other)).toBe(false);
  }
});
