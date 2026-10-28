import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeProdRecord } from "../../../../tooling/src/stack/lib/prod-record.ts";
import { doDown } from "../../../../tooling/src/stack/ops/prod-down.ts";
import { expect, test } from "./prod-stop-fixtures.ts";

test("identity-gated Windows stop removes the private record only after the captured tree is gone", async ({ stop }) => {
  expect(await doDown({ port: stop.record.port, process: stop.process, now: stop.now, pause: stop.pause })).toBe(0);
  expect(stop.state.tasks).toEqual([["/PID", String(stop.record.pid), "/PID", String(stop.leaf.pid), "/F"]]);
  expect(existsSync(stop.pidfile)).toBe(false);
  expect(stop.root.hasExited()).toBe(false);
});

test("taskkill permission refusal retains the actual production record", async ({ stop }) => {
  stop.state.status = 5;
  stop.state.remove = "none";
  await expect(doDown({ port: stop.record.port, process: stop.process, now: stop.now, pause: stop.pause })).rejects.toThrow("taskkill failed");
  expect(stop.state.tasks).toHaveLength(1);
  expect(readFileSync(stop.pidfile, "utf8")).toBe(stop.original);
  expect(stop.root.hasExited()).toBe(false);
});

test("POSIX root TERM and group KILL permission refusals retain the actual production record", async ({ stop }) => {
  for (const refused of ["SIGTERM", "SIGKILL"] as const) {
    const calls: (readonly [number, string | number])[] = [];
    await expect(
      doDown({
        port: stop.record.port,
        now: stop.now,
        pause: stop.pause,
        process: {
          platform: "linux",
          signal: (pid, signal) => {
            calls.push([pid, signal]);
            if (signal === refused) {
              throw Object.assign(new Error(`planted ${refused} permission refusal`), { code: "EPERM" });
            }
            return true;
          },
        },
      }),
    ).rejects.toThrow(`planted ${refused} permission refusal`);
    expect(calls.filter(([, signal]) => signal !== 0).at(-1)).toEqual([refused === "SIGTERM" ? stop.record.pid : -stop.record.pid, refused]);
    expect(readFileSync(stop.pidfile, "utf8")).toBe(stop.original);
  }
});

test("unreadable or malformed process observations preserve the actual production record", async ({ stop }) => {
  for (const observation of [
    { status: 1, stdout: "[]", stderr: "planted refusal" },
    { status: 0, stdout: "{}", stderr: "" },
  ]) {
    stop.state.observation = observation;
    await expect(doDown({ port: stop.record.port, process: stop.process, now: stop.now, pause: stop.pause })).rejects.toThrow("observation");
    expect(readFileSync(stop.pidfile, "utf8")).toBe(stop.original);
  }
  expect(stop.state.tasks).toEqual([]);
});

test("a surviving descendant after root termination retains the actual production record", async ({ stop }) => {
  stop.state.remove = "root";
  await expect(doDown({ port: stop.record.port, process: stop.process, now: stop.now, pause: stop.pause })).rejects.toThrow("remained live");
  expect(stop.state.tasks).toEqual([
    ["/PID", String(stop.record.pid), "/PID", String(stop.leaf.pid), "/F"],
    ["/PID", String(stop.leaf.pid), "/F"],
  ]);
  expect(readFileSync(stop.pidfile, "utf8")).toBe(stop.original);
});

test("a foreign listener fails the real identity gate before process-tree observation or signaling", async ({ stop }) => {
  const record = { ...stop.record, pid: stop.leafPid, pgid: stop.leafPid };
  const text = serializeProdRecord(record);
  writeFileSync(stop.pidfile, text);
  expect(await doDown({ port: stop.record.port, process: stop.process })).toBe(1);
  expect(stop.state.tasks).toEqual([]);
  expect(readFileSync(stop.pidfile, "utf8")).toBe(text);
  expect(stop.root.hasExited()).toBe(false);
});

test("an absent listener cannot delete a record when Windows descendant ownership cannot be established", async ({ stop }) => {
  stop.root.kill("SIGKILL");
  await stop.exited;
  stop.state.rows = stop.state.rows.filter((row) => row.pid !== stop.record.pid);
  await expect(doDown({ port: stop.record.port, process: stop.process })).rejects.toThrow("cannot be identified");
  expect(readFileSync(stop.pidfile, "utf8")).toBe(stop.original);
  expect(stop.state.tasks).toEqual([]);
  expect(stop.leaf.hasExited()).toBe(false);
});
