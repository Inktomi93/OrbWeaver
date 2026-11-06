// @subject tooling/src/floor/process/incarnation.ts
// Process incarnation against the real OS tool of whichever platform runs this file: no injected reads. It owns
// one disposable detached child, and signals nothing else.
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { processCompletion } from "@orb/tooling/floor/host/platform";
import { killPidGroup, spawnFullPriorityChild } from "@orb/tooling/floor/process/proc";
import { sameIncarnation } from "../../../../tooling/src/floor/process/incarnation.ts";
import { incarnationGuard } from "../../../../tooling/src/floor/process/run-marker-join.ts";
import { scaledBudget } from "../../_load-budget.ts";

const READ_TIMEOUT_MS = scaledBudget(10_000);
const READ_INTERVAL_MS = 50;

test("a live child has a start-time identity, and the real stop door ends that incarnation for good", async () => {
  const child = spawnFullPriorityChild(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  const exited = child.wait();
  try {
    const pid = child.pid;
    if (pid === undefined) {
      throw new Error("the disposable child did not spawn");
    }
    const live = processCompletion(pid);
    expect(live).toEqual({ kind: "live", identity: expect.stringMatching(/\S/u) });
    expect(sameIncarnation(pid, live, processCompletion, "disposable child")).toBe(true);

    // The guard sends through a recorder here, so only the door below signals a real process.
    const sent: string[] = [];
    const guard = incarnationGuard("incarnation-proof", {
      read: processCompletion,
      select: () => [pid],
      signal: (target, kind) => {
        sent.push(`${String(target)} ${kind}`);
      },
    });
    expect(guard.signal(pid, "SIGTERM"), "the live incarnation is signalled").toBe(true);
    expect(sent).toEqual([`${String(pid)} SIGTERM`]);

    killPidGroup(pid, "SIGKILL");
    await exited;
    await expect.poll(() => processCompletion(pid), { timeout: READ_TIMEOUT_MS, interval: READ_INTERVAL_MS }).toEqual({ kind: "gone" });

    expect(sameIncarnation(pid, live, processCompletion, "disposable child"), "an exited pid is not the incarnation recorded").toBe(false);
    expect(guard.signal(pid, "SIGKILL"), "an exited pid is refused").toBe(false);
    expect(sent, "and never signalled").toEqual([`${String(pid)} SIGTERM`]);
  } finally {
    child.kill("SIGKILL");
    await exited;
  }
});
