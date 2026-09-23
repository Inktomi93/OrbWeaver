// THE FAILED-BOOT TEARDOWN pin (#1494). `main` used to return `EXIT.toolError` on an identity failure
// without ever iterating `children`: the tool reported failure, left the identity file unwritten, and left
// every already-spawned engine RUNNING — a half fleet holding GPUs with no durable record to stop it by.
//
// The children here are `setsid node -e` hangs, spawned through the SAME door the launcher uses
// (`spawnFullPriorityChild("setsid", …)`) so the process topology under test is the real one: setsid execs
// in place, the child's pid IS its pgid, and the group signal is what takes its descendants with it.
// Nothing here is vLLM, no port is bound, and the real launcher is never invoked
// (CLAUDE.md "Engines" — the engine launcher is never executed to inspect it).
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import type { FullPriorityChild } from "@orb/tooling/_shared/proc";
import { spawnFullPriorityChild } from "@orb/tooling/_shared/proc";
import { stopSpawnedEngines } from "@orb/tooling/stack";
import { expect, test } from "../../../support/tool-fixtures.ts";

const WAIT_TICK_MS = 50;
const WAIT_TICKS = 100;

/** An engine stand-in: a setsid group leader that forks ONE descendant (vLLM's APIServer/EngineCore
 *  shape), publishes both pids, and then hangs until something signals its group. */
function engineLike(outFile: string): string {
  return [
    "const { spawn } = require('node:child_process');",
    "const { writeFileSync } = require('node:fs');",
    "const core = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1e9)'], { stdio: 'ignore' });",
    `writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ leader: process.pid, core: core.pid }));`,
    "setInterval(() => undefined, 1e9);",
  ].join("\n");
}

interface EnginePids {
  readonly leader: number;
  readonly core: number;
}

async function readPids(file: string): Promise<EnginePids> {
  for (let i = 0; i < WAIT_TICKS; i += 1) {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf8")) as EnginePids;
    }
    await sleep(WAIT_TICK_MS);
  }
  throw new Error("the planted engine never published its pids — the fixture, not the door, is broken");
}

async function waitGone(pid: number): Promise<boolean> {
  for (let i = 0; i < WAIT_TICKS; i += 1) {
    if (!existsSync(`/proc/${pid}`)) {
      return true;
    }
    await sleep(WAIT_TICK_MS);
  }
  return false;
}

function killTree(pids: EnginePids | null): void {
  for (const pid of pids === null ? [] : [pids.leader, pids.core]) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The test owns these disposable pids and the door under test may already have reaped them. No
      // `@orb-gate-ignore`: caught-failure-ownership does not scan tests/, so a marker would suppress
      // nothing and read STALE to gate-ignore-inventory.
    }
  }
}

test("stopSpawnedEngines tears down the engines THIS launcher spawned, descendants included (#1494)", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "orb-engine-teardown-"));
  const pidFile = path.join(home, "pids.json");
  let pids: EnginePids | null = null;
  let child: FullPriorityChild | null = null;
  try {
    child = spawnFullPriorityChild("setsid", [process.execPath, "-e", engineLike(pidFile)], { cwd: home, logPath: path.join(home, "engine.log") });
    pids = await readPids(pidFile);
    const lines: string[] = [];

    const signalled = stopSpawnedEngines([child], (line) => lines.push(line));

    expect(signalled, "a live spawned engine must be signalled").toBe(1);
    expect(lines.join("\n"), "and the operator must be told the fleet was torn down, not left running").toContain("the boot failed");
    expect(await waitGone(pids.leader), "the engine we spawned must be gone").toBe(true);
    expect(await waitGone(pids.core), "…and so must its core — the signal is a GROUP signal").toBe(true);
  } finally {
    killTree(pids);
    rmSync(home, { recursive: true, force: true });
  }
});

test("stopSpawnedEngines skips a child that already exited, and signals nothing for an empty fleet (#1494 planted control)", async () => {
  // The other direction: the teardown must not claim work it did not do, or a clean adopt-only run would
  // read as a fleet we tore down. An adopted incumbent never appears here at all — it produces no child.
  const home = mkdtempSync(path.join(tmpdir(), "orb-engine-teardown-exited-"));
  try {
    const dead = spawnFullPriorityChild("setsid", [process.execPath, "-e", "process.exit(0)"], { cwd: home, logPath: path.join(home, "engine.log") });
    await dead.wait();
    const lines: string[] = [];
    const record = (line: string): number => lines.push(line);
    expect(stopSpawnedEngines([dead], record), "an already-exited child is not a teardown").toBe(0);
    expect(stopSpawnedEngines([], record), "an empty fleet signals nothing").toBe(0);
    expect(lines).toEqual([]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
