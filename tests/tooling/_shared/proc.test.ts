// FullPriorityChild signal ownership: an already-exited/ESRCH child is idempotent teardown; every other
// child.kill failure stays loud so invalid signals and permission failures cannot masquerade as success.
import { EventEmitter } from "node:events";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";

// The ambient-env WINDOW pins live beside their door in process-env.test.ts (#1848 moved the door out of
// proc.ts at its line cap); what stays here is the SPAWN/SIGNAL half — the only half proc.ts still owns.

const fake = vi.hoisted(() => ({
  exitCode: null as number | null,
  signalCode: null as NodeJS.Signals | null,
  throwCode: null as string | null,
  killCalls: 0,
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
  spawn: (): EventEmitter & {
    pid: number;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: () => boolean;
    unref: () => void;
  } => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: () => boolean;
      unref: () => void;
    };
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

const { childExitCode, FORWARDED_SIGNALS, forwardSignalsTo, killPidGroup, spawnFullPriorityChild } = await import("@orb/tooling/_shared/proc");

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

// A foreground launcher (`pnpm start`, `pnpm dev`) must forward every stop signal to its children, or a
// Ctrl-C or supervisor TERM leaves an orphan holding the port. The registrar is injected, so the wiring is
// asserted without signalling this vitest worker.
function fakeKillTarget(): { readonly killed: NodeJS.Signals[]; readonly kill: (signal: NodeJS.Signals) => void } {
  const killed: NodeJS.Signals[] = [];
  return { killed, kill: (signal) => killed.push(signal) };
}

test("every forwarded signal is registered, and each one forwards itself to the child", () => {
  const child = fakeKillTarget();
  const registered: NodeJS.Signals[] = [];
  const handlers = new Map<NodeJS.Signals, () => void>();
  forwardSignalsTo(child, (signal, handler) => {
    registered.push(signal);
    handlers.set(signal, handler);
  });

  expect(registered).toEqual([...FORWARDED_SIGNALS]);
  expect([...FORWARDED_SIGNALS]).toEqual(["SIGINT", "SIGTERM", "SIGHUP"]);

  for (const signal of FORWARDED_SIGNALS) {
    handlers.get(signal)?.();
  }
  expect(child.killed).toEqual([...FORWARDED_SIGNALS]);
});

test("registering does not signal the child; the kill happens only when a handler fires", () => {
  const child = fakeKillTarget();
  forwardSignalsTo(child, () => {
    // registered, never fired
  });
  expect(child.killed).toEqual([]);
});

test("the exit status is the child's, and a signal is 128+N, so Ctrl-C is 130", () => {
  expect(childExitCode({ code: 0, signal: null, error: undefined })).toBe(0);
  expect(childExitCode({ code: 7, signal: null, error: undefined })).toBe(7);
  expect(childExitCode({ code: null, signal: "SIGINT", error: undefined })).toBe(130);
  expect(childExitCode({ code: null, signal: "SIGTERM", error: undefined })).toBe(143);
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

const EXTERNAL_KILL =
  /\b(?:runNicedSync|spawnNiced|spawnNicedChild|spawnNicedTranscript|execNicedSync|execNicedSyncBuffer|spawnFullPrioritySync|spawnFullPriorityChild)\(\s*"kill"/;

function walkTs(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") {
        walkTs(path, out);
      }
    } else if (entry.name.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

test("no tooling source spawns the external kill binary (planted control: the old spelling is caught)", () => {
  expect(EXTERNAL_KILL.test('runNicedSync("kill", ["-TERM", `-${pgid}`], { stdio: "ignore" });')).toBe(true);
  const files = walkTs(fileURLToPath(new URL("../../../tooling/src/", import.meta.url)), []);
  expect(files.length).toBeGreaterThan(100);
  const offenders = files.filter((file) => EXTERNAL_KILL.test(readFileSync(file, "utf8")));
  expect(offenders, "signal a process group through killPidGroup (tooling/src/_shared/proc.ts), never `kill -SIG -<pgid>`").toEqual([]);
});
