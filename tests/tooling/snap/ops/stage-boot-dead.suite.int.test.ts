// @instrument-proof: #1837's SECOND defect — a stage that never served a settled app stayed UP. Two lanes on
// 2026-09-06 killed its ~7-process group by hand (the stack leader, dev.sh, the node watchers) after it sat
// on a band for 16 minutes; nothing reaped it before the 60 min keeper TTL, and every reuse in between would
// have inherited the same dead app. This pins the arm that ends it: a PLANTED readiness failure against a
// stage this run booted must leave ZERO of that stage's processes alive, clear the row, and say which arm
// did it — through the SHIPPED `tearDownBootDeadStage`, not a re-spelling of its rules.
//
// @instrument-absence-proof: the second case is the fence #324's ruling requires. A stage this run merely
// REUSED (ours warm, or a sibling checkout's at the same sha) is the warm-across-runs feature and must
// survive the identical readiness failure — otherwise this arm would kill a third party's live stage.
//
// The stage here is PLANTED, not booted: a scratch dir whose path contains `.cache/snap-stage` (so
// `pidIsStageRooted` recognises the child as ours) holding a real detached node process group that binds a
// real free port. The row carries the `dirty` key so `removeStageDir` is a plain rmSync with no git
// bookkeeping, and the band table lives in a scratch home so the box's real bands are never touched.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import type { StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { __resetStageRunBinding, markStageBootDead, registerStageRunBinding } from "../../../../tooling/src/snap/lib/stage-run-binding.ts";
import { readBands, writeBands } from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { readStageReaps } from "../../../../tooling/src/snap/ops/stage-reap-log.ts";
import { tearDownBootDeadStage } from "../../../../tooling/src/snap/ops/stage-teardown.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CASE_BUDGET_MS = scaledBudget(120_000);
const POLL_MS = 100;
const POLL_ATTEMPTS = 100;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(predicate: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    if (predicate()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return predicate();
}

/** A free port, taken by binding and releasing one — the planted stage child re-binds it a beat later. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => probe.close((error) => (error === undefined ? resolve() : reject(error))));
  return port;
}

/** Plant a stage: a `.cache/snap-stage/dirty` dir, and a DETACHED node process group inside it holding the
 *  row's server port. That is the shape `stopStage`'s band check must kill — the two facts it fences on are
 *  the port being held and the holder being stage-rooted. */
async function plantStage(scratch: string): Promise<{ readonly dir: string; readonly port: number; readonly pid: number }> {
  const dir = join(scratch, ".cache", "snap-stage", "dirty");
  mkdirSync(dir, { recursive: true });
  const port = await freePort();
  const script = join(dir, "planted-server.cjs");
  writeFileSync(script, `require("node:http").createServer((_q,s)=>s.end("stage")).listen(${String(port)},"127.0.0.1");\n`);
  const child = spawn(process.execPath, [script], { cwd: dir, detached: true, stdio: "ignore" });
  child.unref();
  const pid = child.pid;
  expect(pid, "the planted stage child must have a pid").toBeTypeOf("number");
  expect(await until(() => !pidAlive(pid as number) || existsSync(script)), "the planted stage child started").toBe(true);
  // Give it a beat to actually bind: `stopStage`'s band check reads the LISTENING socket, not the pid.
  await sleep(500);
  return { dir, port, pid: pid as number };
}

function plantRow(input: { readonly dir: string; readonly port: number; readonly checkout: string }): StageRow {
  return {
    band: 9,
    sha: "dirty",
    dir: input.dir,
    serverPort: input.port,
    vitePort: input.port + 1,
    checkout: input.checkout,
    ownerPid: null,
    startedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
  };
}

test("a boot-dead stage this run BOOTED leaves zero stage processes behind", { timeout: CASE_BUDGET_MS }, async ({ scratch }) => {
  const home = join(scratch, "booted-home");
  mkdirSync(home, { recursive: true });
  const planted = await plantStage(join(scratch, "booted"));
  const row = plantRow({ dir: planted.dir, port: planted.port, checkout: join(scratch, "booted") });
  writeBands(home, [row]);
  __resetStageRunBinding();
  registerStageRunBinding({ row, home, booted: true });

  // RED-FIRST SHAPE: the readiness failure is planted, exactly as ops/drive.ts raises it after the warm-up
  // re-navigation has already been paid and STILL came back non-settled.
  markStageBootDead("the stage's warm-up re-navigation came back degraded");
  tearDownBootDeadStage();

  expect(await until(() => !pidAlive(planted.pid)), `the planted stage group (pid ${String(planted.pid)}) must be dead, not orphaned`).toBe(true);
  expect(readBands(home), "the band it held must be free").toStrictEqual([]);
  expect(
    readStageReaps(home).map((entry) => entry.arm),
    "and the ledger must name WHICH arm ended it, so `--stage-status` can answer for the vanished band",
  ).toContain("boot-dead");
  expect(existsSync(planted.dir), "the stage dir goes with it").toBe(false);
});

test("a boot-dead readiness failure never tears down a stage this run only REUSED", { timeout: CASE_BUDGET_MS }, async ({ scratch }) => {
  const home = join(scratch, "reused-home");
  mkdirSync(home, { recursive: true });
  const planted = await plantStage(join(scratch, "reused"));
  const row = plantRow({ dir: planted.dir, port: planted.port, checkout: join(scratch, "reused") });
  writeBands(home, [row]);
  __resetStageRunBinding();
  // PLANTED CONTROL: the identical failure, on a row this run did not build. #324's warm-across-runs rule.
  registerStageRunBinding({ row, home, booted: false });

  markStageBootDead("the stage's warm-up re-navigation came back degraded");
  tearDownBootDeadStage();

  expect(pidAlive(planted.pid), "a warm stage we merely reused is somebody's live asset, not our corpse").toBe(true);
  expect(
    readBands(home).map((kept) => kept.band),
    "its row survives too",
  ).toStrictEqual([9]);
  process.kill(planted.pid, "SIGTERM");
});
