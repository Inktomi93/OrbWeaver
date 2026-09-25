// A foreground launcher (`pnpm start`, `pnpm dev`) must pass every stop signal on to its children, or a
// Ctrl-C or supervisor TERM leaves an orphan holding the port. The registrar and the platform are injected,
// so the wiring is asserted for every platform without signalling this vitest worker.
import { childExitCode, FORWARDED_SIGNALS, forwardSignalsTo } from "@orb/tooling/_shared/proc-signals";
import { expect, test } from "../../support/tool-fixtures.ts";

function fakeStopTarget(): {
  readonly noted: NodeJS.Signals[];
  readonly killed: NodeJS.Signals[];
  readonly noteStop: (signal: NodeJS.Signals) => void;
  readonly kill: (signal: NodeJS.Signals) => void;
} {
  const noted: NodeJS.Signals[] = [];
  const killed: NodeJS.Signals[] = [];
  return { noted, killed, noteStop: (signal) => noted.push(signal), kill: (signal) => killed.push(signal) };
}

function fireAll(platform: NodeJS.Platform): { readonly target: ReturnType<typeof fakeStopTarget>; readonly registered: readonly NodeJS.Signals[] } {
  const target = fakeStopTarget();
  const registered: NodeJS.Signals[] = [];
  const handlers = new Map<NodeJS.Signals, () => void>();
  forwardSignalsTo(
    target,
    (signal, handler) => {
      registered.push(signal);
      handlers.set(signal, handler);
    },
    platform,
  );
  for (const signal of FORWARDED_SIGNALS) {
    handlers.get(signal)?.();
  }
  return { target, registered };
}

test.each(["linux", "darwin"] as const)("on %s every stop signal is registered, noted, and sent to the child", (platform) => {
  const { target, registered } = fireAll(platform);
  expect(registered).toEqual([...FORWARDED_SIGNALS]);
  expect([...FORWARDED_SIGNALS]).toEqual(["SIGINT", "SIGTERM", "SIGHUP"]);
  expect(target.noted).toEqual([...FORWARDED_SIGNALS]);
  expect(target.killed).toEqual([...FORWARDED_SIGNALS]);
});

// On Windows the console delivers Ctrl-C and a closed window to every process attached to it, the child
// included, and `ChildProcess.kill` is TerminateProcess whatever the signal name. A forwarded kill would cut
// the server's own shutdown short, so the launcher notes the stop and sends nothing.
test("on win32 every stop signal is registered and noted, and none is sent to the child", () => {
  const { target, registered } = fireAll("win32");
  expect(registered).toEqual([...FORWARDED_SIGNALS]);
  expect(target.noted).toEqual([...FORWARDED_SIGNALS]);
  expect(target.killed).toEqual([]);
});

test("registering does not signal the child; the kill happens only when a handler fires", () => {
  const target = fakeStopTarget();
  forwardSignalsTo(
    target,
    () => {
      // registered, never fired
    },
    "linux",
  );
  expect(target.noted).toEqual([]);
  expect(target.killed).toEqual([]);
});

test("the exit status is the child's, and a signal is 128+N, so Ctrl-C is 130", () => {
  expect(childExitCode({ code: 0, signal: null, error: undefined })).toBe(0);
  expect(childExitCode({ code: 7, signal: null, error: undefined })).toBe(7);
  expect(childExitCode({ code: null, signal: "SIGINT", error: undefined })).toBe(130);
  expect(childExitCode({ code: null, signal: "SIGTERM", error: undefined })).toBe(143);
});
