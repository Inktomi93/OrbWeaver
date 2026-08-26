// FullPriorityChild signal ownership: an already-exited/ESRCH child is idempotent teardown; every other
// child.kill failure stays loud so invalid signals and permission failures cannot masquerade as success.
import { EventEmitter } from "node:events";
import process from "node:process";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";

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

const { spawnFullPriorityChild } = await import("@orb/tooling/_shared/proc");

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
