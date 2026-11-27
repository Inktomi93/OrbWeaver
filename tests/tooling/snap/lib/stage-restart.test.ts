// A re-synced `--dirty` stage navigates only after the server its `node --watch` restarts is listening again:
// the 502s a navigation met while the watcher was between processes are what this wait exists to prevent.
import { expect, test } from "@orb/testkit/tooling";
import type { RestartProbe } from "../../../../tooling/src/snap/lib/stage-restart.ts";
import { awaitServerRestart, changesRestartServer, RESTART_POLL_MS } from "../../../../tooling/src/snap/lib/stage-restart.ts";

const ROOT = "/work/tree";
const WATCH_ROOTS = [`${ROOT}/packages/server/src`, `${ROOT}/packages/kit/src`];
const OLD_PID = 100;
const NEW_PID = 200;
const WINDOW_POLLS = 4;

/** A probe that reads its pids in order and repeats the last one; `slept` counts the polls the wait spent. */
function scriptedProbe(pids: readonly (number | null)[]): { readonly probe: RestartProbe; readonly slept: number[] } {
  const slept: number[] = [];
  let next = 0;
  return {
    slept,
    probe: {
      serverPid: (): number | null => {
        const pid = pids[Math.min(next, pids.length - 1)] ?? null;
        next += 1;
        return pid;
      },
      sleep: (ms: number): void => {
        slept.push(ms);
      },
    },
  };
}

const WINDOW_MS = WINDOW_POLLS * RESTART_POLL_MS;

test("a re-sync restarts the server only when it changed a file under a watched source root", () => {
  expect(changesRestartServer(ROOT, ["packages/kit/src/ids/index.ts"], WATCH_ROOTS)).toBe(true);
  expect(changesRestartServer(ROOT, ["tooling/src/snap/ops/stage.ts", "packages/client/src/main.tsx"], WATCH_ROOTS)).toBe(false);
  // A sibling directory that shares a watched root's name prefix is not under it.
  expect(changesRestartServer(ROOT, ["packages/server/src-extra/x.ts"], WATCH_ROOTS)).toBe(false);
  expect(changesRestartServer(ROOT, [], WATCH_ROOTS)).toBe(false);
});

test("the wait returns once a different process listens, through the gap where nothing does", () => {
  const { probe, slept } = scriptedProbe([OLD_PID, null, null, NEW_PID]);
  expect(awaitServerRestart({ before: OLD_PID, probe, detectMs: WINDOW_MS, bootMs: WINDOW_MS })).toBe("restarted");
  // One sleep while the old process still listened, one while the port was empty; the sleep-free read in between saw it go.
  expect(slept).toHaveLength(2);
});

test("a listener that never changes means the watcher did not fire, so the wait ends after the detect window", () => {
  const { probe, slept } = scriptedProbe([OLD_PID]);
  expect(awaitServerRestart({ before: OLD_PID, probe, detectMs: WINDOW_MS, bootMs: WINDOW_MS })).toBe("unchanged");
  expect(slept).toHaveLength(WINDOW_POLLS);
});

test("a server that goes down and never listens again times out instead of letting the run navigate into 502s", () => {
  const { probe } = scriptedProbe([OLD_PID, null]);
  expect(awaitServerRestart({ before: OLD_PID, probe, detectMs: WINDOW_MS, bootMs: WINDOW_MS })).toBe("timeout");
});

test("a server that was already down before the sync is waited for without a detect window", () => {
  const { probe, slept } = scriptedProbe([null, null, NEW_PID]);
  expect(awaitServerRestart({ before: null, probe, detectMs: WINDOW_MS, bootMs: WINDOW_MS })).toBe("restarted");
  expect(slept).toHaveLength(2);
});
