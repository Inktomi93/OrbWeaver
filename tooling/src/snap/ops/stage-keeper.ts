// THE STAGE'S OWN IDLE TIMER — #1163 arm (b), the owner's design in one sentence: "with snap, when it
// doesn't use the default stack and spawns its own — make a timer; each interaction resets the timer; if
// the timer expires it tears itself down." Re-raised 2026-09-05: "there's supposed to be a whole
// mechanism, not just 60 minute idle."
//
// WHAT WAS MISSING. Arm (a), lazy reap-on-acquire, only ever fires when a lane NEEDS a band, and design
// §3.6 parked arm (b) inside the session daemon on the reasoning that it "already has a clock" — so a
// stage driven WITHOUT `--session` had no clock at all. Measured on the shared box 2026-09-05 15:0xZ: six
// of ten bands held, bands 0/1/2 stranded 2h56m / 4h51m / 1h37m with LIVE `node --watch-preserve-output`
// servers resident and "sessions: none" on every row, contributing to a loadavg of 50-83 on 24 cores that
// made three sibling lanes refuse to produce a verdict. Nobody was refused a band, so arm (a) never fired.
//
// THE SHAPE. `armStageKeeper` is called by `ensureStage` on EVERY path that yields a live row (boot, warm
// reuse, our rebuild, a sibling's `shared-reuse`), and spawns — once per band, idempotently — a detached,
// NICED child in its own process group: `node tooling/src/snap/cli.ts --stage-keeper <band>`. The argv
// front door stays cli.ts's (gate `tooling-argv-front-door`), exactly as `--session-daemon` does, and the
// child rides `spawnNicedChild` (policy `tooling-child-process-door`) rather than a raw spawn.
//
// WHO RE-ARMS IT: nobody, explicitly — and that is the design. The keeper POLLS the row rather than
// holding a resettable in-memory timer, so every write the substrate already makes (`touchRow` from
// `ensureStage`, `bindSessionToBand`/`touchSessionHeartbeat` from a daemon call, an attached sibling run)
// re-arms it for free, with no new coupling and no IPC to lose. The three interactions it honours are
// lib/stage-keeper-plan.ts's; the third — an established connection from a non-stage process — is what
// keeps a 90-minute one-shot drive alive between table writes.
//
// WHAT IT REFUSES. A row naming a RESERVED port (the dev `:5173`/`:8788` pair, the fixture, an e2e mode)
// is refused outright with exit 2 and nothing is touched: the operator's own stack is out of scope by
// definition. A row that is gone, or now names a DIFFERENT keeper pid (a `--fresh` rebuild booted a new
// stage on the same band), makes this keeper RELEASE without acting.
//
// IT IS NEVER A FENCE. Nothing consults `row.keeper` before reaping: a dead keeper pid leaves the band
// exactly as reapable by reap-on-acquire and `--stage-sweep` as it was before this file existed, and
// `armStageKeeper` re-spawns one whenever it finds the recorded pid gone. `--stage-status` says so out
// loud rather than printing a timer column that might be protection nobody is providing.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { spawnNicedChild } from "../../_shared/proc.ts";
import { pidAlive } from "../../_shared/run-retention.ts";
import type { StageKeeperEvidence, StageRow } from "../contract/stage.ts";
import {
  keeperPollMs,
  reservedRowPorts,
  stageKeeperClaim,
  stageKeeperReapLine,
  stageKeeperReservedRefusal,
  stageKeeperVerdict,
} from "../lib/stage-keeper-plan.ts";
import { stageKeeperLogPath } from "../lib/stage-plan.ts";
import { liveSessionNames } from "./session-registry.ts";
import { stageLimits } from "./stage-census.ts";
import { repoRoot } from "./stage-git.ts";
import { markerRoot, readBands, setStageKeeper } from "./stage-marker.ts";
import { foreignBandPeer } from "./stage-probe.ts";
import { tearDownStageRow } from "./stage-teardown.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --isolated <route>");

/** The keeper's entry is THIS tool's cli — derived from this module's own location, never from argv (the
 *  `--session-daemon` discipline: one argv front door). */
const SNAP_CLI = fileURLToPath(new URL("../cli.ts", import.meta.url));

/** Is the row's recorded keeper still running? Exported because `--stage-status` asks the same question. */
export function stageKeeperAlive(row: StageRow): boolean {
  return row.keeper !== undefined && pidAlive(row.keeper.pid);
}

/** Arm the band's idle timer if it has none, or if the one it names is gone. Idempotent and cheap: a warm
 *  reuse of a stage whose keeper is alive spawns nothing. Returns the row as the table now reads it, so a
 *  caller that prints the row shows the keeper it just armed.
 *
 *  A FAILURE TO ARM IS NOT A FAILURE TO STAGE. `ensureStage`'s deliverable is a served app; a keeper that
 *  could not spawn costs the box a strand that arm (a) and `--stage-sweep` still reap, so it is reported
 *  and the stage is returned rather than the run being refused. */
export function armStageKeeper(home: string, row: StageRow): StageRow {
  if (stageKeeperAlive(row)) {
    return row;
  }
  // A LOG FILE, NEVER A PIPE, and the reason is the launcher as much as the child (`_shared/proc.ts`
  // `spawnNicedChild`): with no `logPath` the child gets `["ignore","pipe","pipe"]`, and (a) the keeper's
  // first write after this snap call exits would be EPIPE — losing the one line #1163 asks it to print —
  // while (b) the parent's stream handles stay referenced, so `child.unref()` alone does NOT let a short
  // `snap` call's event loop drain. This is the session daemon's shape, applied to the second detached
  // child snap owns.
  mkdirSync(dirname(stageKeeperLogPath(home, row.band)), { recursive: true });
  const child = spawnNicedChild(process.execPath, [SNAP_CLI, "--stage-keeper", String(row.band)], {
    cwd: process.cwd(),
    logPath: stageKeeperLogPath(home, row.band),
  });
  // The keeper outlives this process by design; without `unref` node would hold the caller open until the
  // child exits, which for a 60-minute idle timer means never.
  child.unref();
  if (child.pid === undefined) {
    print(`[snap-stage] could not arm band ${row.band}'s idle timer — reap-on-acquire and \`--stage-sweep\` remain its only arms`);
    return row;
  }
  const keeper = { pid: child.pid, armedAt: new Date().toISOString() };
  setStageKeeper(home, row.band, keeper);
  print(
    `[snap-stage] band ${row.band} idle timer armed (pid ${keeper.pid}, TTL ${Math.round(stageLimits().ttlMs / MS_PER_MINUTE)}m, log ${stageKeeperLogPath(home, row.band)})`,
  );
  return { ...row, keeper };
}

const MS_PER_MINUTE = 60_000;

/** ONE poll's observation of the box for a live row. The two expensive reads — the session registry walk
 *  and the `ss` fork — are taken only when the cheap checks could still end in a reap: neither can turn a
 *  `release` or a `refuse` into anything else. */
function pollEvidence(input: {
  readonly root: string;
  readonly row: StageRow;
  readonly reservedPorts: readonly number[];
  readonly nowMs: number;
  readonly ttlMs: number;
}): StageKeeperEvidence {
  const { root, row, reservedPorts, nowMs, ttlMs } = input;
  const identityHolds = row.keeper !== undefined && row.keeper.pid === process.pid;
  const judgeable = identityHolds && reservedPorts.length === 0;
  const live = judgeable && row.sessions.length > 0 ? liveSessionNames(root) : new Set<string>();
  return {
    row,
    keeperPid: process.pid,
    liveSessions: row.sessions.filter((name) => live.has(name)),
    foreignPeer: judgeable ? foreignBandPeer({ server: row.serverPort, vite: row.vitePort }) : null,
    reservedPorts,
    nowMs,
    ttlMs,
  };
}

/** `snap --stage-keeper <band>` — the keeper process itself. Resolves when it has released, reaped or
 *  refused; the exit is the process's. Never returns while the band is in use. */
export async function runStageKeeper(band: number): Promise<number> {
  const root = repoRoot();
  const home = markerRoot(root);
  const ttlMs = stageLimits().ttlMs;
  const pollMs = keeperPollMs(ttlMs);
  for (;;) {
    const row = readBands(home).find((candidate) => candidate.band === band) ?? null;
    const nowMs = Date.now();
    if (row === null) {
      print(`[snap-stage] band ${band} idle timer released — the row it was armed for is gone`);
      return EXIT.clean;
    }
    const reservedPorts = reservedRowPorts(row);
    // ADOPT FIRST (lib/stage-keeper-plan.ts `stageKeeperClaim`): the arming write can land after this
    // child's first poll, and a row whose recorded keeper died is one this keeper is here to take over.
    // Never for a RESERVED row — that one is refused below without the timer ever owning anything.
    if (reservedPorts.length === 0 && stageKeeperClaim(row, pidAlive) === "adopt") {
      setStageKeeper(home, band, { pid: process.pid, armedAt: new Date(nowMs).toISOString() });
      continue;
    }
    const verdict = stageKeeperVerdict(pollEvidence({ root, row, reservedPorts, nowMs, ttlMs }));
    if (verdict === "release") {
      print(`[snap-stage] band ${band} idle timer released — the row was rebuilt under a different timer`);
      return EXIT.clean;
    }
    if (verdict === "refuse") {
      print(stageKeeperReservedRefusal(row, reservedPorts));
      return EXIT.toolError;
    }
    if (verdict === "reap") {
      print(stageKeeperReapLine(row, nowMs, ttlMs));
      tearDownStageRow(home, row, "timer", nowMs);
      return EXIT.clean;
    }
    await sleep(pollMs);
  }
}
