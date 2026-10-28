import { existsSync, readFileSync } from "node:fs";
import { captureProcessGroup } from "@orb/tooling/floor/process/proc";
import { terminateFailedSpawn } from "../../../../tooling/src/stack/ops/prod-up.ts";
import { expect, test } from "./prod-stop-fixtures.ts";

test("failed boot retains its captured descendants after root exit and removes the record only after completion", async ({ stop }) => {
  const tree = captureProcessGroup(stop.record.pid, stop.process);
  stop.state.rows = stop.state.rows.filter((row) => row.pid !== stop.record.pid);
  await terminateFailedSpawn(stop.record, { now: stop.now, pause: stop.pause }, tree);
  expect(stop.state.tasks).toEqual([["/PID", String(stop.leaf.pid), "/F"]]);
  expect(existsSync(stop.pidfile)).toBe(false);
});

test("failed boot preserves its private record when taskkill refuses", async ({ stop }) => {
  stop.state.status = 5;
  stop.state.remove = "none";
  await expect(terminateFailedSpawn(stop.record, { process: stop.process, now: stop.now, pause: stop.pause })).rejects.toThrow("taskkill failed");
  expect(readFileSync(stop.pidfile, "utf8")).toBe(stop.original);
  expect(stop.state.tasks).toHaveLength(1);
});

test("failed boot preserves its record while captured descendants outlive escalation", async ({ stop }) => {
  stop.state.remove = "root";
  await expect(terminateFailedSpawn(stop.record, { process: stop.process, now: stop.now, pause: stop.pause })).rejects.toThrow("remained live");
  expect(stop.state.tasks).toEqual([
    ["/PID", String(stop.record.pid), "/PID", String(stop.leaf.pid), "/F"],
    ["/PID", String(stop.leaf.pid), "/F"],
  ]);
  expect(readFileSync(stop.pidfile, "utf8")).toBe(stop.original);
});

test("POSIX failed boot probes and escalates the complete owned group through the native signal edge", async ({ stop }) => {
  let alive = true;
  const signals: (readonly [number, string | number])[] = [];
  await terminateFailedSpawn(stop.record, {
    now: stop.now,
    pause: stop.pause,
    process: {
      platform: "linux",
      signal: (pid, signal) => {
        signals.push([pid, signal]);
        if (signal === "SIGKILL") {
          alive = false;
        }
        if (!alive && signal === 0) {
          throw Object.assign(new Error("gone"), { code: "ESRCH" });
        }
        return true;
      },
    },
  });
  expect(signals.filter(([, signal]) => signal !== 0)).toEqual([
    [-stop.record.pid, "SIGTERM"],
    [-stop.record.pid, "SIGKILL"],
  ]);
  expect(signals.filter(([, signal]) => signal === 0).every(([pid]) => pid === -stop.record.pid)).toBe(true);
  expect(existsSync(stop.pidfile)).toBe(false);
});
