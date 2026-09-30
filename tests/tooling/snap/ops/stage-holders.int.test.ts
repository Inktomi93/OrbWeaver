// A stage hold's soundness: every ensureStage caller holds what it bound, a reused pid never pins a stage,
// dead entries never pile up, a normal exit lets go, and the first beat is written before the run proceeds.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import { stageBandPorts } from "../../../../tooling/src/_shared/ports.ts";
import type { StageHolder, StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { liveHoldersOf, stageDecision } from "../../../../tooling/src/snap/lib/stage-bands.ts";
import { STAGE_ROOT_REL } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { ensureStage } from "../../../../tooling/src/snap/ops/stage.ts";
import { holdStageUse } from "../../../../tooling/src/snap/ops/stage-holders.ts";
import { readBands, releaseLockDir, touchRow, writeRow } from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { holderProcessRunning, processStartTicks } from "../../../../tooling/src/snap/ops/stage-probe.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

vi.setConfig({ testTimeout: scaledBudget(60_000, 2) });

const SHA = "0".repeat(40);
const OWNER = "/repo/.claude/worktrees/lane";
const SIBLING = "/repo/main";
const MINUTE = 60_000;
const NOW_ISO = new Date(FROZEN_AT_MS).toISOString();
const DAYS_AGO = new Date(FROZEN_AT_MS - 3 * 24 * 60 * MINUTE).toISOString();

const planted = vi.hoisted(() => ({ home: "", row: null as unknown }));

// @orb-waive test-mock-doctrine(mock): ensureStage's shared-reuse arm needs a sibling's live, healthy stage (bound ports, healthz, served-probe); these stubs stand in for that census and for the repo root, and the hold registration under test runs for real. Ends if ensureStage takes an injected census.
vi.mock("../../../../tooling/src/snap/ops/stage-git.ts", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  repoRoot: (): string => "/repo/main",
  resolveRef: (): string => "0".repeat(40),
}));
// @orb-waive test-mock-doctrine(mock): ensureStage's shared-reuse arm needs a sibling's live, healthy stage (bound ports, healthz, served-probe); these stubs stand in for that census and for the repo root, and the hold registration under test runs for real. Ends if ensureStage takes an injected census.
vi.mock("../../../../tooling/src/snap/ops/stage-census.ts", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  acquireStageBand: (): unknown => ({ allocation: { kind: "shared-reuse", band: 3, row: planted.row }, views: [] }),
}));
// @orb-waive test-mock-doctrine(mock): ensureStage's shared-reuse arm needs a sibling's live, healthy stage (bound ports, healthz, served-probe); these stubs stand in for that census and for the repo root, and the hold registration under test runs for real. Ends if ensureStage takes an injected census.
vi.mock("../../../../tooling/src/snap/ops/stage-keeper.ts", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  armStageKeeper: (_home: string, row: unknown): unknown => row,
}));
// @orb-waive test-mock-doctrine(mock): ensureStage's shared-reuse arm needs a sibling's live, healthy stage (bound ports, healthz, served-probe); these stubs stand in for that census and for the repo root, and the hold registration under test runs for real. Ends if ensureStage takes an injected census.
vi.mock("../../../../tooling/src/snap/ops/stage-marker.ts", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  markerRoot: (): string => planted.home,
}));

function scratchHome(label: string): string {
  const home = mkdtempSync(join(tmpdir(), `cbsn-holders-${label}-`));
  mkdirSync(join(home, STAGE_ROOT_REL), { recursive: true });
  return home;
}

function stageRow(over: Partial<StageRow> = {}): StageRow {
  const ports = stageBandPorts(3);
  return {
    band: 3,
    sha: SHA,
    dir: `${OWNER}/.cache/snap-stage/000000000000`,
    serverPort: ports.server,
    vitePort: ports.vite,
    checkout: OWNER,
    ownerPid: null,
    startedAt: DAYS_AGO,
    lastUsedAt: DAYS_AGO,
    sessions: [],
    dbProvenance: null,
    rsyncs: 0,
    holders: [],
    ...over,
  };
}

function ownerFresh(home: string): string {
  const row = readBands(home)[0] ?? null;
  const liveHolders = row === null ? [] : liveHoldersOf(row, FROZEN_AT_MS, holderProcessRunning);
  return stageDecision({ targetSha: SHA, row, fresh: true, healthy: true, checkout: OWNER, nowMs: FROZEN_AT_MS, liveHolders });
}

test("a sibling's cache:check that shared-reuses a stage through ensureStage holds it, so the owner's --fresh refuses", () => {
  planted.home = scratchHome("ensure");
  planted.row = stageRow();
  writeRow(planted.home, stageRow());
  ensureStage({ ref: SHA, fresh: false });
  expect(readBands(planted.home)[0]?.holders).toEqual([expect.objectContaining({ pid: process.pid, checkout: SIBLING })]);
  expect(ownerFresh(planted.home)).toBe("refuse");
});

test("a holder whose pid now belongs to another process does not pin the stage", () => {
  const unrelated = spawn("sleep", ["30"], { stdio: "ignore" });
  try {
    const pid = unrelated.pid ?? 0;
    const reused: StageHolder = { pid, pidStart: "1", checkout: SIBLING, stampedAt: DAYS_AGO };
    expect(holderProcessRunning(reused)).toBe(false);
    expect(liveHoldersOf(stageRow({ holders: [reused] }), FROZEN_AT_MS, holderProcessRunning)).toEqual([]);
    // Positive control: the same pid with its real start time is running.
    const genuine: StageHolder = { ...reused, pidStart: processStartTicks(pid) ?? "unreadable" };
    expect(holderProcessRunning(genuine)).toBe(true);
  } finally {
    unrelated.kill();
  }
});

test("dead holder entries are pruned whenever the table is written, so they never pile up across runs", () => {
  const home = scratchHome("prune");
  const dead = Array.from(
    { length: 40 },
    (_unused, index): StageHolder => ({ pid: 2_147_483_000 + index, pidStart: "1", checkout: SIBLING, stampedAt: DAYS_AGO }),
  );
  writeRow(home, stageRow({ holders: dead }));
  touchRow(home, 3, NOW_ISO);
  expect(readBands(home)[0]?.holders).toEqual([]);
});

test("a run that exits normally removes its holder entry", () => {
  const home = scratchHome("exit");
  const row = stageRow();
  writeRow(home, row);
  const holders = fileURLToPath(new URL("../../../../tooling/src/snap/ops/stage-holders.ts", import.meta.url));
  const script = `const { holdStageUse } = await import(${JSON.stringify(holders)}); holdStageUse(${JSON.stringify(home)}, ${JSON.stringify(row)}, ${JSON.stringify(SIBLING)}, 60000);`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  expect(child.status, child.stderr).toBe(0);
  expect(readBands(home)[0]?.holders).toEqual([]);
});

test("the first beat waits out a contended lock and is on the row before the run proceeds", () => {
  const home = scratchHome("contended");
  const row = stageRow();
  writeRow(home, row);
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  mkdirSync(lockDir);
  // A live holder the lock will not break until it exits a moment later. It is orphaned on purpose: a child of
  // this process would stay a zombie while the first beat blocks, and a zombie's pid still reads as alive.
  const holder = spawnSync("sh", ["-c", "sleep 2 >/dev/null 2>&1 & echo $!"], { encoding: "utf8" });
  writeFileSync(join(lockDir, "pid"), `${holder.stdout.trim()}\n`);
  const release = holdStageUse(home, row, SIBLING, 60 * MINUTE);
  try {
    expect(readBands(home)[0]?.holders).toEqual([expect.objectContaining({ pid: process.pid, checkout: SIBLING })]);
    expect(ownerFresh(home)).toBe("refuse");
  } finally {
    release();
  }
});

test("a first beat that cannot be written at all fails the bind instead of running unprotected", () => {
  const home = scratchHome("unwritable");
  const row = stageRow();
  writeRow(home, row);
  const lockDir = join(home, STAGE_ROOT_REL, "bands.lock");
  mkdirSync(lockDir);
  writeFileSync(join(lockDir, "pid"), `${String(process.pid)}\n`);
  try {
    expect(() => holdStageUse(home, row, SIBLING, 60 * MINUTE)).toThrow("could not register");
  } finally {
    releaseLockDir(lockDir);
  }
});
