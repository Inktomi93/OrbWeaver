import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import type { EngineLaunchIdentity, ObservedEngineProcess } from "@orb/server/infra/providers/vllm/engine";
import {
  captureEngineLaunchIdentity,
  engineIdentityFilePath,
  parseEngineIdentityFile,
  readEngineIdentityFile,
  serializeEngineIdentityFile,
  signalEngineLaunchIdentity,
  signalRecordedEngineProcess,
  verifyEngineLaunchIdentity,
  writeEngineLaunchIdentities,
} from "@orb/server/infra/providers/vllm/engine";
import { expect, test } from "../../../../../support/fixtures.ts";

const FILE_MODE_MODULUS = 0o1000;

const OBSERVED: ObservedEngineProcess = {
  pid: 4242,
  pgid: 4242,
  startTicks: "998877",
  executable: "/usr/bin/python3.13",
  cmdlineBase64: Buffer.from("python\0/opt/vllm/bin/vllm\0serve\0").toString("base64"),
  cwd: "/repo",
};

const IDENTITY: EngineLaunchIdentity = {
  version: 1,
  engine: "embed",
  port: 8701,
  repoRoot: "/repo",
  ...OBSERVED,
};

test("the durable identity codec rejects malformed and dangerous process targets", () => {
  const file = { version: 1 as const, repoRoot: "/repo", engines: { embed: IDENTITY } };
  expect(parseEngineIdentityFile(serializeEngineIdentityFile(file))).toEqual(file);
  expect(parseEngineIdentityFile('{"version":1')).toBeNull();
  expect(parseEngineIdentityFile(JSON.stringify({ ...file, engines: { embed: { ...IDENTITY, pid: 1, pgid: 1 } } }))).toBeNull();
  expect(parseEngineIdentityFile(JSON.stringify({ ...file, engines: { embed: { ...IDENTITY, pgid: 0 } } }))).toBeNull();
});

test("ownership requires the launch record, listener, start ticks, executable, cmdline, cwd, and process group to match", () => {
  expect(verifyEngineLaunchIdentity(IDENTITY, OBSERVED, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 })).toEqual({
    verdict: "owned",
    pgid: 4242,
  });
  expect(verifyEngineLaunchIdentity(IDENTITY, null, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: null }).verdict).toBe("absent");
  expect(
    verifyEngineLaunchIdentity(IDENTITY, { ...OBSERVED, startTicks: "998878" }, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 }).verdict,
  ).toBe("refused");
  expect(
    verifyEngineLaunchIdentity(IDENTITY, { ...OBSERVED, executable: "/usr/bin/foreign" }, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 })
      .verdict,
  ).toBe("refused");
  expect(
    verifyEngineLaunchIdentity(
      IDENTITY,
      { ...OBSERVED, cmdlineBase64: Buffer.from("foreign\0").toString("base64") },
      { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 },
    ).verdict,
  ).toBe("refused");
  expect(
    verifyEngineLaunchIdentity(IDENTITY, { ...OBSERVED, pgid: 31_337 }, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 }).verdict,
  ).toBe("refused");
  expect(
    verifyEngineLaunchIdentity(IDENTITY, { ...OBSERVED, cwd: "/tmp" }, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 4242 }).verdict,
  ).toBe("refused");
  expect(verifyEngineLaunchIdentity(IDENTITY, OBSERVED, { engine: "embed", port: 8701, repoRoot: "/repo", listenerPid: 7331 }).verdict).toBe("refused");
});

test("a stale or foreign target is refused before the signal syscall", () => {
  const calls: Array<readonly [number, NodeJS.Signals]> = [];
  const kill = (target: number, signal: NodeJS.Signals): void => {
    calls.push([target, signal]);
  };
  const staleObserved: readonly (ObservedEngineProcess | null)[] = [
    null,
    { ...OBSERVED, startTicks: "998878" },
    { ...OBSERVED, executable: "/usr/bin/foreign" },
    { ...OBSERVED, cmdlineBase64: Buffer.from("foreign\0").toString("base64") },
    { ...OBSERVED, pgid: 31_337 },
    { ...OBSERVED, cwd: "/tmp" },
  ];
  for (const observed of staleObserved) {
    expect(
      signalEngineLaunchIdentity(IDENTITY, "SIGTERM", {
        engine: "embed",
        port: 8701,
        repoRoot: "/repo",
        listenerPid: 4242,
        readProcess: () => observed,
        kill,
      }).verdict,
    ).toBe("refused");
  }
  expect(
    signalEngineLaunchIdentity(IDENTITY, "SIGKILL", {
      engine: "embed",
      port: 8701,
      repoRoot: "/repo",
      listenerPid: 7331,
      readProcess: () => OBSERVED,
      kill,
    }).verdict,
  ).toBe("refused");
  expect(
    signalEngineLaunchIdentity({ ...IDENTITY, pid: 1, pgid: 1 }, "SIGKILL", {
      engine: "embed",
      port: 8701,
      repoRoot: "/repo",
      listenerPid: 1,
      readProcess: () => ({ ...OBSERVED, pid: 1, pgid: 1 }),
      kill,
    }).verdict,
  ).toBe("refused");
  expect(calls).toEqual([]);
});

test("launch identities merge by engine through one atomic owner-only record", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-engine-identity-"));
  try {
    const embed = { ...IDENTITY, repoRoot };
    const gen: EngineLaunchIdentity = { ...IDENTITY, engine: "gen", port: 8703, repoRoot, pid: 5252, pgid: 5252 };
    writeEngineLaunchIdentities(repoRoot, [embed]);
    writeEngineLaunchIdentities(repoRoot, [gen]);
    expect(readEngineIdentityFile(repoRoot)).toEqual({ version: 1, repoRoot, engines: { embed, gen } });
    expect(statSync(engineIdentityFilePath(repoRoot)).mode % FILE_MODE_MODULUS).toBe(0o600);
    expect(readFileSync(engineIdentityFilePath(repoRoot), "utf8")).not.toContain("tmp-");
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("a launch identity captured from a disposable owned process can stop its own process group", async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-owned-engine-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 60_000)"], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
  });
  await once(child, "spawn");
  const pid = child.pid;
  expect(pid).toBeGreaterThan(1);
  if (pid === undefined || pid <= 1) {
    throw new Error("owned-process test did not receive a safe child pid");
  }

  try {
    const identity = captureEngineLaunchIdentity("gen", 8703, repoRoot, pid);
    expect(identity).not.toBeNull();
    if (identity === null) {
      throw new Error("owned-process test could not capture the child identity");
    }
    const exited = once(child, "exit");
    writeEngineLaunchIdentities(repoRoot, [identity]);
    const result = signalRecordedEngineProcess({
      repoRoot,
      engine: "gen",
      port: 8703,
      listenerPid: pid,
      signal: "SIGTERM",
    });
    expect(result).toEqual({ verdict: "signaled", pgid: pid });
    await exited;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // The owned child can exit between the state read and cleanup signal.
      }
    }
    rmSync(repoRoot, { force: true, recursive: true });
  }
});
