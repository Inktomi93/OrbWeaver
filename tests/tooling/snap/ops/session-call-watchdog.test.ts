import process from "node:process";
import { setImmediate as nextTurn } from "node:timers/promises";
import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { isTerminalSessionCallError, runSessionCallWithinBudget } from "../../../../tooling/src/snap/ops/session-call-watchdog.ts";
import { refuseTerminalSessionRequest } from "../../../../tooling/src/snap/ops/session-daemon-request.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

type WatchdogState = Parameters<typeof runSessionCallWithinBudget>[0];

function watchdogState(): WatchdogState {
  return { name: "non-page-hang", recover: () => Promise.resolve() };
}

async function caughtError(work: Promise<number>): Promise<Error> {
  try {
    await work;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw error;
  }
  throw new Error("expected watchdog work to reject");
}

test("a never-resolving non-page call reaches a terminal timeout without a second unbounded await", async () => {
  const never = new Promise<number>(() => undefined);
  const error = await caughtError(runSessionCallWithinBudget(watchdogState(), "heap parser", () => never, 1));
  expect(error.message).toContain("ORB-LOAD-KILL");
  expect(isTerminalSessionCallError(error)).toBe(true);
});

test("a rejection after a terminal timeout is owned instead of becoming unhandled", async () => {
  const late = Promise.withResolvers<number>();
  const unhandled: string[] = [];
  const onUnhandled = (reason: Error): void => {
    unhandled.push(reason.message);
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const error = await caughtError(runSessionCallWithinBudget(watchdogState(), "late parser rejection", () => late.promise, 1));
    expect(isTerminalSessionCallError(error)).toBe(true);
    late.reject(new Error("planted late rejection"));
    await nextTurn();
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test.each(["status", "call"] as const)("a terminal session refuses a subsequent %s request instead of reusing possibly-live work", (kind) => {
  const events: string[] = [];
  let ended = false;
  const refused = refuseTerminalSessionRequest(
    { name: "non-page-hang", terminalReason: "terminal heap parser remained live" },
    { kind },
    {
      destroyed: false,
      writable: true,
      write: (text: string) => events.push(text),
      end: () => {
        ended = true;
      },
    },
  );
  expect(refused).toBe(true);
  expect(events.join("")).toContain("SESSION DEAD");
  expect(events.join("")).toContain(`"exit":${EXIT.toolError}`);
  expect(ended).toBe(true);
});
