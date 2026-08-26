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
  reapOrphanedFamily,
  serializeEngineIdentityFile,
  signalEngineLaunchIdentity,
  signalOrphanedEngineGroup,
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

test("orphan recovery signals only a stable survivor in the recorded group after the leader is absent", () => {
  const survivor = { ...OBSERVED, pid: 5000, pgid: IDENTITY.pgid };
  const calls: Array<readonly [number, NodeJS.Signals]> = [];
  const readProcess = (pid: number): ObservedEngineProcess | null => {
    if (pid === IDENTITY.pid) {
      return null;
    }
    return pid === survivor.pid ? survivor : null;
  };
  expect(signalOrphanedEngineGroup(IDENTITY, survivor.pid, "SIGKILL", { readProcess, kill: (target, signal) => calls.push([target, signal]) })).toEqual({
    verdict: "signaled",
    pgid: IDENTITY.pgid,
  });
  expect(calls).toEqual([[-IDENTITY.pgid, "SIGKILL"]]);
});

test("leader reuse, foreign PGID, and changing survivor identity receive zero signals", () => {
  const calls: number[] = [];
  const survivor = { ...OBSERVED, pid: 5000, pgid: IDENTITY.pgid };
  expect(
    signalOrphanedEngineGroup(IDENTITY, survivor.pid, "SIGKILL", {
      readProcess: (pid) => (pid === IDENTITY.pid ? { ...OBSERVED, startTicks: "reused" } : survivor),
      kill: (target) => calls.push(target),
    }).verdict,
  ).toBe("refused");
  expect(
    signalOrphanedEngineGroup(IDENTITY, survivor.pid, "SIGKILL", {
      readProcess: (pid) => (pid === IDENTITY.pid ? null : { ...survivor, pgid: 7331 }),
      kill: (target) => calls.push(target),
    }).verdict,
  ).toBe("refused");
  let reads = 0;
  expect(
    signalOrphanedEngineGroup(IDENTITY, survivor.pid, "SIGKILL", {
      readProcess: (pid) => (pid === IDENTITY.pid ? null : { ...survivor, startTicks: String(100 + reads++) }),
      kill: (target) => calls.push(target),
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

test("a genuinely owned survivor is reaped only through its recorded process group", async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-owned-orphan-"));
  const leaderScript = [
    'const { spawn } = require("node:child_process")',
    'const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 60_000)", "VLLM::EngineCore"], { stdio: "ignore" })',
    "console.log(child.pid)",
    "setInterval(() => undefined, 60_000)",
  ].join(";");
  const leader = spawn(process.execPath, ["-e", leaderScript], { cwd: repoRoot, detached: true, stdio: ["ignore", "pipe", "ignore"] });
  await once(leader, "spawn");
  const leaderPid = leader.pid;
  expect(leaderPid).toBeGreaterThan(1);
  if (leaderPid === undefined || leaderPid <= 1 || leader.stdout === null) {
    throw new Error("owned-orphan test did not receive a safe leader");
  }
  const [chunk] = (await once(leader.stdout, "data")) as [Buffer];
  const survivorPid = Number(chunk.toString("utf8").trim());
  expect(survivorPid).toBeGreaterThan(1);
  try {
    const identity = captureEngineLaunchIdentity("gen", 8703, repoRoot, leaderPid);
    expect(identity).not.toBeNull();
    if (identity === null) {
      throw new Error("owned-orphan test could not capture leader identity");
    }
    writeEngineLaunchIdentities(repoRoot, [identity]);
    const exited = once(leader, "exit");
    leader.kill("SIGTERM");
    await exited;
    expect(() => process.kill(survivorPid, 0)).not.toThrow();
    expect(await reapOrphanedFamily(repoRoot)).toEqual([leaderPid]);
  } finally {
    try {
      process.kill(-leaderPid, "SIGKILL");
    } catch {
      // The reaper should already have removed the owned disposable group.
    }
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("a disposable foreign same-cwd process with vllm serve in argv receives zero reaper signals", async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "orb-foreign-engine-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 60_000)", "vllm serve"], { cwd: repoRoot, detached: true, stdio: "ignore" });
  await once(child, "spawn");
  const pid = child.pid;
  expect(pid).toBeGreaterThan(1);
  if (pid === undefined || pid <= 1) {
    throw new Error("foreign-process test did not receive a safe child pid");
  }
  try {
    expect(await reapOrphanedFamily(repoRoot)).toEqual([]);
    expect(() => process.kill(pid, 0)).not.toThrow();
  } finally {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Test owns this disposable group; it may have exited independently.
    }
    rmSync(repoRoot, { force: true, recursive: true });
  }
});
