import process from "node:process";
import { setImmediate as nextTurn, setTimeout as sleep } from "node:timers/promises";
import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { isTerminalSessionCallError, runSessionCallWithinBudget } from "../../../../tooling/src/snap/ops/session-call-watchdog.ts";
import { refuseTerminalSessionRequest } from "../../../../tooling/src/snap/ops/session-daemon-request.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

type WatchdogState = Parameters<typeof runSessionCallWithinBudget>[0];

/** A recovery clock too short to wait for anything — the terminal arms below need the outer wait to expire. */
const INSTANT_RECOVERY_BASE_MS = 1;

function watchdogState(): WatchdogState {
  return { name: "non-page-hang", recover: () => Promise.resolve(), recoveryBaseMs: INSTANT_RECOVERY_BASE_MS };
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

// #1832 — THE OUTER WAIT MAY NOT BE SHORTER THAN THE RECOVERY IT BOUNDS. The daemon's recovery awaits a CDP
// ack (up to its own 500ms-base window) and THEN a reload commit, and the timed-out work rejects only once
// that reload destroys its context. The old outer race gave the whole sequence ONE ack-sized window, so a
// recovery that legitimately used its ack budget declared the session TERMINAL and the next call re-booted
// onto an unnavigated page (exit 3). Planted here: a cancellation protocol that settles the work after
// RECOVERY_MS, inside its declared clock but beyond an ack-sized window. The terminal twin above (a recovery
// that never settles) proves the bound still fires.
const RECOVERY_MS = 2600;
const DECLARED_RECOVERY_BASE_MS = 8000;

test("a recovery that settles inside its declared inner clocks keeps the session: the timeout is reported, not terminal", async () => {
  const cancelled = Promise.withResolvers<number>();
  const state: WatchdogState = {
    name: "slow-cancellation",
    recover: async () => {
      await sleep(RECOVERY_MS);
      cancelled.reject(new Error("execution context was destroyed by the cancellation reload"));
    },
    recoveryBaseMs: DECLARED_RECOVERY_BASE_MS,
  };
  const error = await caughtError(runSessionCallWithinBudget(state, "slow cancellation", () => cancelled.promise, 1));
  expect(error.message).toContain("ORB-LOAD-KILL");
  expect(error.message).not.toContain("is terminal");
  expect(isTerminalSessionCallError(error)).toBe(false);
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
