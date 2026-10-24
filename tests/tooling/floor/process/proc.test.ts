// FullPriorityChild signal ownership: an already-exited/ESRCH child is idempotent teardown; every other
// child.kill failure stays loud so invalid signals and permission failures cannot masquerade as success.
// Real Node children only: a module mock cannot reach a door another file in the shared registry already loaded.
import { ChildProcess } from "node:child_process";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { killPidGroup, spawnFullPriorityChild, spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { vi } from "vitest";

// The ambient-env WINDOW pins live beside their door in process-env.test.ts (#1848 moved the door out of
// proc.ts at its line cap); what stays here is the SPAWN/SIGNAL half — the only half proc.ts still owns.

const IDLE_CHILD = ["-e", "setTimeout(() => {}, 30_000)"] as const;

function planted(code: string): () => never {
  return (): never => {
    throw Object.assign(new Error(`planted ${code}`), { code });
  };
}

/** A live real child, killed for real when the case ends whatever the case planted on the way. */
function idleChild(): ReturnType<typeof spawnFullPriorityChild> & Disposable {
  const child = spawnFullPriorityChild(process.execPath, IDLE_CHILD, { stdio: "ignore" });
  return Object.assign(child, {
    [Symbol.dispose]: (): void => {
      vi.restoreAllMocks();
      child.kill("SIGKILL");
    },
  });
}

test("kill rethrows a non-ESRCH child.kill failure", () => {
  using child = idleChild();
  const kill = vi.spyOn(ChildProcess.prototype, "kill").mockImplementation(planted("EPERM"));
  expect(() => child.kill("SIGTERM")).toThrow("planted EPERM");
  expect(kill).toHaveBeenCalledTimes(1);
});

test("kill is idempotent for an already-exited child and for ESRCH", async () => {
  const exited = spawnFullPriorityChild(process.execPath, ["-e", ""], { stdio: "ignore" });
  expect(await exited.wait()).toMatchObject({ code: 0, error: undefined });
  const kill = vi.spyOn(ChildProcess.prototype, "kill").mockImplementation(planted("EPERM"));
  expect(() => exited.kill("SIGTERM")).not.toThrow();
  expect(kill).not.toHaveBeenCalled();
  kill.mockRestore();

  using vanished = idleChild();
  vi.spyOn(ChildProcess.prototype, "kill").mockImplementation(planted("ESRCH"));
  expect(() => vanished.kill("SIGTERM")).not.toThrow();
});

test("killGroup absorbs only ESRCH from process-group signalling", () => {
  using child = idleChild();
  const signalGroup = vi.spyOn(process, "kill");

  signalGroup.mockImplementationOnce(planted("EPERM"));
  expect(() => child.killGroup("SIGTERM")).toThrow("planted EPERM");
  expect(signalGroup).toHaveBeenLastCalledWith(-(child.pid ?? 0), "SIGTERM");

  signalGroup.mockImplementationOnce(planted("ESRCH"));
  expect(() => child.killGroup("SIGTERM")).not.toThrow();
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

/** Shorter than any child's own exit delay below, so the door's timeout always fires first. */
const TIMEOUT_WINDOW_MS = 100;
const LATE_EXIT_MS = 400;
const UNHURRIED_MS = 60_000;

test("a timed-out transcript remains no verdict when a terminated Windows child closes with 0 or 1", async ({ scratch }) => {
  // The group kill is held off, as a terminated Windows child is: the child outlives the timeout and then closes with its own code.
  const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
  try {
    for (const code of [0, 1]) {
      const late = ["-e", `setTimeout(() => process.exit(${String(code)}), ${String(LATE_EXIT_MS)})`];
      const captured = await spawnNicedTranscript(process.execPath, late, { cwd: scratch, env: inheritedProcessEnv(), timeoutMs: TIMEOUT_WINDOW_MS });
      expect(captured.code).toBeNull();
      expect(captured.transcript).toContain(`TIMED OUT after ${String(TIMEOUT_WINDOW_MS)}ms`);
    }
  } finally {
    kill.mockRestore();
  }
  for (const code of [0, 1]) {
    const prompt = ["-e", `process.exit(${String(code)})`];
    expect(await spawnNicedTranscript(process.execPath, prompt, { cwd: scratch, env: inheritedProcessEnv(), timeoutMs: UNHURRIED_MS })).toEqual({
      code,
      transcript: "",
    });
  }
});
