// @instrument-proof: #1837's SECOND defect — a stage that never served a settled app stayed UP. Two lanes on
// 2026-09-06 killed its ~7-process group by hand (the stack leader, the node watchers) after it sat
// on a band for 16 minutes; nothing reaped it before the 60 min keeper TTL, and every reuse in between would
// have inherited the same dead app. This pins the arm that ends it: a PLANTED readiness failure against a
// stage this run booted must leave ZERO of that stage's processes alive, clear the row, and say which arm
// did it — through the SHIPPED `settleStageReadiness`, not a re-spelling of its rules.
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
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";
import { pidAlive } from "@orb/tooling/floor/artifacts/run-retention";
import type { EnsureStageOps, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { STAGE_ROOT_REL } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { markStageSettled, markStageUnsettled, registerStageRunBinding } from "../../../../tooling/src/snap/lib/stage-run-binding.ts";
import { ensureStage } from "../../../../tooling/src/snap/ops/stage.ts";
import { readBands, writeBands } from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { readStageReaps } from "../../../../tooling/src/snap/ops/stage-reap-log.ts";
import type { StageSettleDeps } from "../../../../tooling/src/snap/ops/stage-teardown.ts";
import { settleStageReadiness } from "../../../../tooling/src/snap/ops/stage-teardown.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CASE_BUDGET_MS = scaledBudget(120_000);
const POLL_MS = 100;
const POLL_ATTEMPTS = 100;
const WARMING_SINCE = new Date(FROZEN_AT_MS).toISOString();
const MISSED = "the stage's first navigation came back degraded";

/** The readiness probe, scripted: whether the stage's server and vite both answered after the miss. */
function probes(answers: boolean): StageSettleDeps {
  return { answers: () => answers, nowIso: () => WARMING_SINCE };
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

function plantRow(input: { readonly dir: string; readonly port: number; readonly checkout: string; readonly warming?: boolean }): StageRow {
  return {
    ...(input.warming === true ? { warming: { since: WARMING_SINCE } } : {}),
    band: 9,
    sha: "dirty",
    dir: input.dir,
    serverPort: input.port,
    vitePort: input.port + 1,
    checkout: input.checkout,
    ownerPid: null,
    // The frozen clock, not the ambient one (test-determinism): a boot-dead row's timestamps are inputs the
    // teardown arm never compares against wall time, so the fixture's value is arbitrary but must be injected.
    startedAt: new Date(FROZEN_AT_MS).toISOString(),
    lastUsedAt: new Date(FROZEN_AT_MS).toISOString(),
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
  registerStageRunBinding({ row, home, booted: true });

  // RED-FIRST SHAPE: the readiness failure is planted, exactly as ops/drive.ts raises it after the warm-up
  // re-navigation has already been paid and STILL came back non-settled.
  markStageUnsettled(MISSED);
  settleStageReadiness(probes(false));

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
  // PLANTED CONTROL: the identical failure, on a row this run did not build. #324's warm-across-runs rule.
  registerStageRunBinding({ row, home, booted: false });

  markStageUnsettled(MISSED);
  settleStageReadiness(probes(false));

  expect(pidAlive(planted.pid), "a warm stage we merely reused is somebody's live asset, not our corpse").toBe(true);
  expect(
    readBands(home).map((kept) => kept.band),
    "its row survives too",
  ).toStrictEqual([9]);
  process.kill(planted.pid, "SIGTERM");
});

test("a booted stage whose server and vite answered after the first miss is kept WARMING, not torn down", { timeout: CASE_BUDGET_MS }, async ({ scratch }) => {
  const home = join(scratch, "warming-home");
  mkdirSync(home, { recursive: true });
  const planted = await plantStage(join(scratch, "warming"));
  const row = plantRow({ dir: planted.dir, port: planted.port, checkout: join(scratch, "warming") });
  writeBands(home, [row]);
  registerStageRunBinding({ row, home, booted: true });

  markStageUnsettled(MISSED);
  settleStageReadiness(probes(true));

  expect(pidAlive(planted.pid), "the cold optimize is still finishing; killing the stage restarts it from nothing").toBe(true);
  expect(readBands(home).map((kept) => kept.warming)).toStrictEqual([{ since: WARMING_SINCE }]);
  expect(readStageReaps(home), "a kept stage is not a reap").toStrictEqual([]);
  process.kill(planted.pid, "SIGTERM");
});

test("the warm retry that misses again tears the stage down, though that run only REUSED it", { timeout: CASE_BUDGET_MS }, async ({ scratch }) => {
  const home = join(scratch, "retry-miss-home");
  mkdirSync(home, { recursive: true });
  const planted = await plantStage(join(scratch, "retry-miss"));
  const row = plantRow({ dir: planted.dir, port: planted.port, checkout: join(scratch, "retry-miss"), warming: true });
  writeBands(home, [row]);
  registerStageRunBinding({ row, home, booted: false });

  markStageUnsettled(MISSED);
  settleStageReadiness(probes(true));

  expect(await until(() => !pidAlive(planted.pid)), "a second miss on a warm stage is the boot-dead verdict").toBe(true);
  expect(readBands(home)).toStrictEqual([]);
  expect(readStageReaps(home).map((entry) => entry.arm)).toContain("boot-dead");
});

test("the warm retry that settles clears the warming mark and leaves the stage up", { timeout: CASE_BUDGET_MS }, async ({ scratch }) => {
  const home = join(scratch, "retry-ok-home");
  mkdirSync(home, { recursive: true });
  const planted = await plantStage(join(scratch, "retry-ok"));
  const row = plantRow({ dir: planted.dir, port: planted.port, checkout: join(scratch, "retry-ok"), warming: true });
  writeBands(home, [row]);
  registerStageRunBinding({ row, home, booted: false });

  markStageSettled();
  settleStageReadiness(probes(true));

  expect(pidAlive(planted.pid)).toBe(true);
  expect(readBands(home).map((kept) => kept.warming)).toStrictEqual([undefined]);
  process.kill(planted.pid, "SIGTERM");
});

test("a first miss on a stage whose vite or server did not answer is still boot-dead, with no warming kept", { timeout: CASE_BUDGET_MS }, async ({
  scratch,
}) => {
  const home = join(scratch, "silent-home");
  mkdirSync(home, { recursive: true });
  const planted = await plantStage(join(scratch, "silent"));
  const row = plantRow({ dir: planted.dir, port: planted.port, checkout: join(scratch, "silent") });
  writeBands(home, [row]);
  registerStageRunBinding({ row, home, booted: true });

  markStageUnsettled(MISSED);
  settleStageReadiness(probes(false));

  expect(await until(() => !pidAlive(planted.pid))).toBe(true);
  expect(readBands(home)).toStrictEqual([]);
});

/** A stage whose server and vite ports both answer, run outside `.cache/snap-stage` so no teardown treats it as a
 *  stage group. A child process, because the health probes block this process's event loop. */
async function plantAnsweringPair(scratch: string): Promise<{ readonly server: number; readonly vite: number; readonly pid: number }> {
  const [server, vite] = [await freePort(), await freePort()];
  mkdirSync(scratch, { recursive: true });
  const script = join(scratch, "answer.cjs");
  writeFileSync(
    script,
    `for (const port of [${String(server)}, ${String(vite)}]) require("node:http").createServer((_q, s) => s.end("ok")).listen(port, "127.0.0.1");\n`,
  );
  const child = spawn(process.execPath, [script], { detached: true, stdio: "ignore" });
  child.unref();
  const pid = child.pid as number;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const answered = await Promise.all(
      [server, vite].map((port) =>
        fetch(`http://127.0.0.1:${String(port)}/`).then(
          () => true,
          () => false,
        ),
      ),
    );
    if (answered.every(Boolean)) {
      return { server, vite, pid };
    }
    await sleep(POLL_MS);
  }
  throw new Error("the planted pair never answered");
}

test("a warming stage is reused by the --stage-db fresh, and rebuilt by an explicit --fresh", { timeout: CASE_BUDGET_MS }, async ({ scratch }) => {
  const home = join(scratch, "resume-home");
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  const pair = await plantAnsweringPair(join(scratch, "resume"));
  const source = "/box/prod.db";
  const sha = "0".repeat(40);
  const row: StageRow = {
    ...plantRow({ dir: join(scratch, "resume", STAGE_ROOT_REL, sha.slice(0, 12)), port: pair.server, checkout: "/repo/main", warming: true }),
    sha,
    vitePort: pair.vite,
    holders: [],
    dbProvenance: { copiedFrom: source, cloned: true, copiedAt: WARMING_SINCE, devDbMtimeAtCopy: WARMING_SINCE },
  };
  writeBands(home, [row]);
  const ops: EnsureStageOps = {
    repoRoot: (): string => "/repo/main",
    resolveRef: (): string => sha,
    markerRoot: (): string => home,
    acquireStageBand: () => ({ allocation: { kind: "ours", band: row.band, row }, views: [] }),
    armStageKeeper: (_home, armed) => armed,
  };
  try {
    const resumed = ensureStage({ fresh: true, stageDb: source }, ops);
    expect(resumed.startedAt, "the implied fresh keeps the stage that was warming").toBe(row.startedAt);
    expect(readBands(home).map((kept) => kept.warming)).toStrictEqual([{ since: WARMING_SINCE }]);
    // Same stage, same clone source, but the user asked for --fresh by name: the rebuild starts by stopping the
    // stage, and the planted pair is not a stage group the stop may kill, so the rebuild refuses to proceed.
    expect(() => ensureStage({ fresh: true, freshExplicit: true, stageDb: source }, ops)).toThrow("could not be replaced");
  } finally {
    process.kill(pair.pid, "SIGTERM");
  }
});
