// FullPriorityChild signal ownership: an already-exited/ESRCH child is idempotent teardown; every other
// child.kill failure stays loud so invalid signals and permission failures cannot masquerade as success.
import { EventEmitter } from "node:events";
import process from "node:process";
import { PassThrough } from "node:stream";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { vi } from "vitest";

// The ambient-env WINDOW pins live beside their door in process-env.test.ts (#1848 moved the door out of
// proc.ts at its line cap); what stays here is the SPAWN/SIGNAL half — the only half proc.ts still owns.

const fake = vi.hoisted(() => ({
  exitCode: null as number | null,
  signalCode: null as NodeJS.Signals | null,
  throwCode: null as string | null,
  killCalls: 0,
  child: undefined as EventEmitter | undefined,
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
  spawn: (): EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: () => boolean;
    unref: () => void;
  } => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
      pid: number;
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: () => boolean;
      unref: () => void;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    fake.child = child;
    child.pid = 1234;
    Object.defineProperties(child, {
      exitCode: { get: () => fake.exitCode },
      signalCode: { get: () => fake.signalCode },
    });
    child.kill = (): boolean => {
      fake.killCalls += 1;
      if (fake.throwCode !== null) {
        throw Object.assign(new Error(`planted ${fake.throwCode}`), { code: fake.throwCode });
      }
      return true;
    };
    child.unref = (): void => undefined;
    return child;
  },
}));

vi.mock("cross-spawn", async () => {
  const childProcess = await import("node:child_process");
  return { default: { spawn: childProcess.spawn, sync: childProcess.spawnSync } };
});
// The child pid is synthetic, so OS priority changes must stay at the external boundary.
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, setPriority: vi.fn() };
});

const { killPidGroup, spawnFullPriorityChild, spawnNicedTranscript } = await import("@orb/tooling/floor/process/proc");

test("kill rethrows a non-ESRCH child.kill failure", () => {
  fake.exitCode = null;
  fake.signalCode = null;
  fake.throwCode = "EPERM";
  fake.killCalls = 0;
  const child = spawnFullPriorityChild("probe", []);
  expect(() => child.kill("SIGTERM")).toThrow("planted EPERM");
  expect(fake.killCalls).toBe(1);
});

test("kill is idempotent for an already-exited child and for ESRCH", () => {
  fake.exitCode = 0;
  fake.throwCode = "EPERM";
  fake.killCalls = 0;
  const exited = spawnFullPriorityChild("probe", []);
  expect(() => exited.kill("SIGTERM")).not.toThrow();
  expect(fake.killCalls).toBe(0);

  fake.exitCode = null;
  fake.throwCode = "ESRCH";
  const vanished = spawnFullPriorityChild("probe", []);
  expect(() => vanished.kill("SIGTERM")).not.toThrow();
});

test("killGroup absorbs only ESRCH from process-group signalling", () => {
  const signalGroup = vi.spyOn(process, "kill");
  const child = spawnFullPriorityChild("probe", []);

  signalGroup.mockImplementationOnce(() => {
    throw Object.assign(new Error("planted group EPERM"), { code: "EPERM" });
  });
  expect(() => child.killGroup("SIGTERM")).toThrow("planted group EPERM");
  expect(signalGroup).toHaveBeenLastCalledWith(-1234, "SIGTERM");

  signalGroup.mockImplementationOnce(() => {
    throw Object.assign(new Error("planted group ESRCH"), { code: "ESRCH" });
  });
  expect(() => child.killGroup("SIGTERM")).not.toThrow();
  signalGroup.mockRestore();
});

// The external `kill` binary is BANNED as a process-group door (#1254, 2026-09-02): procps-ng 4.0.4 parses
// `kill -TERM -4570` as `kill(-4, SIGTERM)` — the pgid's FIRST DIGIT — so with seven-digit pids starting
// in 1 the stage teardown became `kill(-1)`, every process the user owns, and logged the owner out twice
// (strace receipts on the row). `kill -TERM -- -4570` parses correctly, but the repo has ONE door for a
// group signal: `killPidGroup` → `process.kill(-pgid)`, a syscall no shell parser touches.
test("killPidGroup signals the NEGATIVE pgid through the syscall, never a shell", () => {
  const spy = vi.spyOn(process, "kill").mockImplementation(() => true);
  try {
    killPidGroup(4570, "SIGTERM");
    expect(spy).toHaveBeenCalledWith(-4570, "SIGTERM");
  } finally {
    spy.mockRestore();
  }
});

/** Virtual-timer fixture data the test advances explicitly; no real clock waits on it. */
const VIRTUAL_WINDOW_MS = 100;

test("a timed-out transcript remains no verdict when a terminated Windows child closes with 0 or 1", async ({ scratch }) => {
  // the subject is the proc door's native setTimeout window, which an injected data clock cannot drive; ends if the door exposes an injected timer seam.
  vi.useFakeTimers();
  const options = { cwd: scratch, env: {}, timeoutMs: VIRTUAL_WINDOW_MS };
  const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
  try {
    for (const code of [0, 1]) {
      const result = spawnNicedTranscript("probe", [], options);
      await vi.advanceTimersByTimeAsync(VIRTUAL_WINDOW_MS);
      fake.child?.emit("close", code);
      const captured = await result;
      expect(captured.code).toBeNull();
      expect(captured.transcript).toContain(`TIMED OUT after ${String(VIRTUAL_WINDOW_MS)}ms`);
    }
    for (const code of [0, 1]) {
      const result = spawnNicedTranscript("probe", [], options);
      fake.child?.emit("close", code);
      expect(await result).toEqual({ code, transcript: "" });
    }
  } finally {
    vi.useRealTimers();
    kill.mockRestore();
  }
});
