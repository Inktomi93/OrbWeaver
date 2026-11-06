// The stage stop over a REAL process group on a real port: real socket table, real incarnation reads and real group
// signals. Only the stage-root judgment is fixed (the group is not a stage) and the signals are recorded on their
// way out, so a test can tell which signal reached the group and which never did.
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { vi } from "vitest";
import { listeningPids, processCompletion } from "../../../../tooling/src/floor/host/platform.ts";
import { observeProcessGroup, runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { waitSync } from "../../../../tooling/src/floor/process/sync-sleep.ts";
import type { StageStopDeps } from "../../../../tooling/src/snap/contract/stage.ts";
import { processGroupTarget } from "../../../../tooling/src/snap/ops/stage-probe.ts";
import { stopStage } from "../../../../tooling/src/snap/ops/stage-teardown.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { plantSplitGroup } from "../../_split-group.ts";

vi.spyOn(process.stdout, "write").mockImplementation(() => true);

/** The wait the escalation polls with. Its poll count is fixed by the production grace, so a short wait keeps the
 *  whole stop to a fraction of a second while the TERM grace still outlasts the holder's exit. */
const POLL_WAIT_MS = 3;
/** The stop is aimed at a band whose second port nothing binds. */
const UNBOUND_PORT = 47_713;

/** The real socket table, asked only about the group's port so each poll stays cheap. The owner ordering is `ss`'s own. */
function realStopDeps(port: number, sent: string[]): StageStopDeps {
  return {
    readPorts: () => listeningPids({ run: (command, args) => runNicedSync(command, [...args, `sport = :${String(port)}`]) }),
    isStageRooted: () => true,
    incarnationOf: processCompletion,
    captureGroup: (pid): ReturnType<StageStopDeps["captureGroup"]> => {
      const target = processGroupTarget(pid);
      const group = target === null ? null : observeProcessGroup(target);
      return group === null
        ? null
        : {
            alive: group.alive,
            signal: (kind): void => {
              sent.push(`${String(target)} ${kind}`);
              group.signal(kind);
            },
          };
    },
    wait: () => waitSync(POLL_WAIT_MS),
    runLauncher: () => undefined,
  };
}

test("a holder that exited on TERM leaves its group member to the KILL", { timeout: scaledBudget(30_000) }, async ({ scratch }) => {
  const group = await plantSplitGroup(scratch, "member-holds-port");
  try {
    const sent: string[] = [];
    const verdict = stopStage(join(scratch, "no-stage"), { server: group.port, vite: UNBOUND_PORT }, realStopDeps(group.port, sent));
    expect(verdict).toEqual({ kind: "stopped" });
    expect(sent).toEqual([`${String(group.groupId)} SIGTERM`, `${String(group.groupId)} SIGKILL`]);
    await expect.poll(() => processCompletion(group.leaderPid), { timeout: scaledBudget(5000) }).toEqual({ kind: "gone" });
  } finally {
    group.dispose();
  }
});

test("a group seen empty is not signalled again while something outside it holds the port", { timeout: scaledBudget(30_000) }, async ({ scratch }) => {
  const group = await plantSplitGroup(scratch, "outsider-holds-port");
  try {
    const sent: string[] = [];
    const verdict = stopStage(join(scratch, "no-stage"), { server: group.port, vite: UNBOUND_PORT }, realStopDeps(group.port, sent));
    expect(verdict).toEqual({ kind: "unconfirmed", reason: expect.stringContaining("emptied") });
    expect(sent, "the emptied group's id never got a KILL").toEqual([`${String(group.groupId)} SIGTERM`]);
    expect(processCompletion(group.outsiderPid ?? 0).kind, "the outsider was not touched").toBe("live");
  } finally {
    group.dispose();
  }
});
