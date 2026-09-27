// T4's missing behavioral control: a REAL snap daemon
// boots and binds a REAL isolated stage, measures once, then observes one killed half of the stage's port
// pair. The next daemon call must stamp the death in BOTH registries and refuse loudly; the real status
// and sweep verbs must expose and free that exact band while the browser daemon remains alive.
//
// This is a `.suite` because the property crosses session-daemon, stage census, the shared band table and
// both CLI admin verbs rather than mirroring one source file. A detached scratch checkout gives the stage
// a unique owner, and `--fresh` plus a raised test-only cap forces allocation onto a free band instead of
// sharing or reaping a sibling. Cleanup closes the session and tears down only that checkout's row.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/_shared/host-slots";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { vi } from "vitest";
import { listeningPids, socketTableOrThrow } from "../../../../tooling/src/_shared/platform.ts";
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import type { StageRow } from "../../../../tooling/src/snap/contract/stage.ts";
import { readSessionRow } from "../../../../tooling/src/snap/lib/session-wire.ts";
import { markerRoot, readBands } from "../../../../tooling/src/snap/ops/stage-marker.ts";
import type { CliResult } from "../../../support/tool-fixtures.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CASE_BUDGET_MS = scaledBudget(600_000, 2);
const CLI_BUDGET_MS = scaledBudget(480_000, 2);
const POLL_MS = 100;
const POLL_ATTEMPTS = 100;
const QUIET = ["--no-shot"];
vi.setConfig({ testTimeout: CASE_BUDGET_MS, hookTimeout: CASE_BUDGET_MS });

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

function sessionRow(home: string, name: string): SessionRow {
  const row = readSessionRow(readFileSync(join(home, `${name}.json`), "utf8"));
  expect(row, `session ${name} must have a readable registry row`).not.toBeNull();
  return row as SessionRow;
}

function stageIdentity(row: StageRow): Pick<StageRow, "band" | "checkout" | "dir" | "serverPort" | "sha" | "vitePort"> {
  return {
    band: row.band,
    checkout: row.checkout,
    dir: row.dir,
    serverPort: row.serverPort,
    sha: row.sha,
    vitePort: row.vitePort,
  };
}

function envOf(pairs: readonly (readonly [string, string])[]): Record<string, string> {
  return Object.fromEntries(pairs);
}

test("T4 — killing one half of a real daemon-bound stage makes death sticky, status-visible, and sweepable without touching sibling bands", async ({
  repoRoot,
  runCli,
  scratch,
}) => {
  const ownerCheckout = join(scratch, `t4-owner-${process.pid}`);
  const sessionHome = join(scratch, "sessions");
  const name = `p-t4-stage-death-${process.pid}`;
  const env = envOf([
    ["ORB_SNAP_SESSION_HOME", sessionHome],
    [HOST_POOL_ROOT_ENV, join(scratch, "host-slots")],
    ["ORB_STAGE_CAP", "10"],
  ]);
  const snap = (args: readonly string[]): Promise<CliResult> => runCli("snap", args, { cwd: ownerCheckout, env, timeoutMs: CLI_BUDGET_MS });
  const stageHome = markerRoot(repoRoot);
  mkdirSync(sessionHome, { recursive: true });

  const worktree = await spawnNiced("git", ["worktree", "add", "--detach", ownerCheckout, "HEAD"], { cwd: repoRoot, timeoutMs: CLI_BUDGET_MS });
  expect(worktree.code, worktree.stderr).toBe(0);

  let ownedBand: number | null = null;
  try {
    const boot = await snap(["--session", name, "--isolated", "--ref", "HEAD", "--fresh", "/login", "--eval", "1 + 1", "--no-failure-evidence", ...QUIET]);
    expect([EXIT.clean, EXIT.violations]).toContain(boot.code);
    expect(boot.stdout).toMatch(/EVAL\[0\][^\n]*\n2/u);

    // Cold Vite dependency optimization can legitimately make the boot call red. A second live-page call
    // owns a fresh evidence window and is the successful pre-death daemon call T4 requires.
    const beforeDeath = await snap(["--session", name, "--eval", "1 + 1", ...QUIET]);
    await expect(beforeDeath).toExitWith(EXIT.clean);
    expect(beforeDeath.stdout).toMatch(/EVAL\[0\][^\n]*\n2/u);

    const liveSession = sessionRow(sessionHome, name);
    expect(liveSession.stage?.status).toBe("live");
    if (liveSession.stage === null || liveSession.stage === undefined) {
      throw new Error(`session ${name} booted without its real stage binding`);
    }
    ownedBand = liveSession.stage.band;
    const liveStage = readBands(stageHome).find((row) => row.band === ownedBand);
    expect(liveStage).toBeDefined();
    expect(liveStage?.checkout).toBe(ownerCheckout);
    expect(liveStage?.sessions).toContain(name);

    const beforeDeathStatus = await snap(["--stage-status"]);
    await expect(beforeDeathStatus).toExitWith(EXIT.clean);
    expect(beforeDeathStatus.stdout).toContain(`band ${ownedBand}`);
    expect(liveStage?.dead).toBeUndefined();

    const bound = socketTableOrThrow(listeningPids());
    const serverPid = bound.get(liveStage?.serverPort ?? -1);
    const vitePid = bound.get(liveStage?.vitePort ?? -1);
    expect(serverPid, "the real stage server half must be listening").toBeDefined();
    expect(vitePid, "the real stage vite half must be listening").toBeDefined();
    expect(vitePid).not.toBe(serverPid);

    // The plant: kill EXACTLY the vite half. The stack leader may subsequently take its sibling down,
    // but this test sends one signal to one bound pid and lets production lifecycle code do the rest.
    process.kill(vitePid as number, "SIGKILL");
    expect(await until(() => !pidAlive(vitePid as number))).toBe(true);

    const op = ["--eval", "40 + 2", ...QUIET];
    const refused = await snap(["--session", name, ...op]);
    await expect(refused).toExitWith(EXIT.toolError);
    expect(refused.stdout).toContain(`STAGE DEAD     session ${name}'s band ${ownedBand} died at `);
    expect(refused.stdout).toContain(`during \`${op.join(" ")}\``);
    expect(refused.stdout).toContain("pnpm snap --stage-sweep");
    expect(refused.stdout).toContain(`pnpm snap --session-close ${name}`);
    expect(refused.stdout).toContain(`pnpm snap --session ${name}`);

    const deadSession = sessionRow(sessionHome, name);
    expect(deadSession.stage?.status).toBe("dead");
    expect(deadSession.stage?.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
    expect(deadSession.stage?.op).toBe(op.join(" "));

    const status = await snap(["--stage-status"]);
    await expect(status).toExitWith(EXIT.clean);
    expect(status.stdout).toContain(`band ${ownedBand}`);
    expect(status.stdout).toContain(`DEAD since ${deadSession.stage?.detectedAt} during \`${op.join(" ")}\``);

    // WHAT THE SWEEP MAY NOT TOUCH IS A **LIVE** SIBLING (#1744). The band table is SHARED by every
    // worktree of the repo, and `--stage-sweep` is a global verb whose whole job is reaping stranded rows
    // and reconciling dangling ones — so "every row that existed before still exists after" asserts
    // against the product's own contract the moment a concurrent lane's stage is stranded. Measured
    // 2026-09-05: a sibling row for checkout `…/agent-a8db677b611562972` was gone after the sweep and the
    // arm read RED with nothing wrong here. The property that survives is the one this test can ATTRIBUTE:
    // a sibling whose BOTH ports are bound is `live`, is not sweepable, and must therefore be neither
    // named by the sweep's own record nor altered in the table.
    const boundPorts = socketTableOrThrow(listeningPids());
    const liveSiblings = readBands(stageHome)
      .filter((row) => row.band !== ownedBand && boundPorts.has(row.serverPort) && boundPorts.has(row.vitePort))
      .map(stageIdentity);
    expect(pidAlive(deadSession.daemonPid), "the browser daemon remains live while its stage is dead").toBe(true);
    const swept = await snap(["--stage-sweep"]);
    await expect(swept).toExitWith(EXIT.clean);
    expect(swept.stdout).toContain(`band ${ownedBand}`);
    expect(swept.stdout).toMatch(/reaped a stranded stage|reconciled a dangling row/u);
    expect(readBands(stageHome).some((row) => row.band === ownedBand)).toBe(false);
    expect(pidAlive(deadSession.daemonPid), "sweeping the dead stage must not close the otherwise-live session").toBe(true);

    // The sweep's own record is what makes the claim ATTRIBUTABLE: it prints one `band N: …` line per
    // band it acted on, so a live sibling appearing there is this sweep reaching outside its dead band —
    // the defect — while a row that vanished without being named belongs to whoever else was running.
    const sweptBands = new Set([...swept.stdout.matchAll(/\bband (\d+):/gu)].map((match) => Number(match[1])));
    expect(sweptBands.has(ownedBand)).toBe(true);
    expect(liveSiblings.filter((sibling) => sweptBands.has(sibling.band))).toEqual([]);
    // …and a live sibling row this sweep left in place must be the row it found. An ABSENT one is its own
    // owner's teardown landing inside our window (the table is shared and no row here obeys our
    // lifecycle) — unattributable, so it substitutes itself rather than reading as a red.
    const afterByBand = new Map(readBands(stageHome).map((row) => [row.band, stageIdentity(row)]));
    const untouched = liveSiblings.filter((sibling) => !sweptBands.has(sibling.band));
    expect(untouched.map((sibling) => afterByBand.get(sibling.band) ?? sibling)).toEqual(untouched);

    // Sticky means the stage-table row can be gone and the session still refuses with the FIRST detection.
    const stillDead = await snap(["--session", name, "--eval", "6 * 7", ...QUIET]);
    await expect(stillDead).toExitWith(EXIT.toolError);
    expect(stillDead.stdout).toContain(`died at ${deadSession.stage?.detectedAt}`);
    expect(stillDead.stdout).toContain(`during \`${op.join(" ")}\``);
  } finally {
    if (existsSync(ownerCheckout)) {
      await snap(["--session-close", name]);
      await snap(["--stage-down", "--stage-owner", ownerCheckout, "--force"]);
      await snap(["--session-sweep"]);
    }
    await spawnNiced("git", ["worktree", "remove", "--force", ownerCheckout], { cwd: repoRoot, timeoutMs: CLI_BUDGET_MS });
    await spawnNiced("git", ["worktree", "prune"], { cwd: repoRoot, timeoutMs: CLI_BUDGET_MS });
  }
});
