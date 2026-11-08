// The stage sweep's live-use guard, judged in its own process by the production census and evidence builder.
// A child because the session registry reads its home override at import. The parent spawns it with a cwd under
// `.cache/snap-stage`, so this process is a stage-rooted holder of the band it plants as bound.
import process from "node:process";
import type { PortOwner } from "../../../../tooling/src/floor/host/platform.ts";
import { stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../../../../tooling/src/snap/contract/session.ts";
import type { StageSweepVerdict } from "../../../../tooling/src/snap/contract/stage.ts";
import { diskSafeArgv, diskSafeUrl } from "../../../../tooling/src/snap/lib/disk-safe-argv.ts";
import { stageSweepVerdict } from "../../../../tooling/src/snap/lib/stage-bands.ts";
import { sessionRegistryHome, writeRow as writeSessionRow } from "../../../../tooling/src/snap/ops/session-registry.ts";
import { stageBandViews } from "../../../../tooling/src/snap/ops/stage-census.ts";
import { currentHolder } from "../../../../tooling/src/snap/ops/stage-holders.ts";
import { bindSessionToBand, readBands, writeRow } from "../../../../tooling/src/snap/ops/stage-marker.ts";
import { evidenceFor } from "../../../../tooling/src/snap/ops/stage-status.ts";

/** What keeps the six-hour-idle row on band 0 in use: a session whose daemon is alive or dead, or a running holder. */
const SWEEP_CHILD_MODES = ["session-live", "session-dead", "holder-live"] as const;
export type SweepChildMode = (typeof SWEEP_CHILD_MODES)[number];

export interface SweepChildReport {
  readonly sessions: readonly string[];
  readonly verdict: StageSweepVerdict;
}

const BAND = 0;
const SESSION_NAME = "p-live-lane";
const OWNER = "/repo";
const MS_PER_HOUR = 3_600_000;
const TTL_MS = MS_PER_HOUR;
/** A pid nothing owns, so the daemon it names is dead. */
const DEAD_PID = 2_147_483_646;

function sessionRow(daemonPid: number, stampedAt: string): SessionRow {
  return {
    v: SESSION_PROTOCOL_VERSION,
    name: SESSION_NAME,
    ownerCheckout: OWNER,
    daemonPid,
    pgid: daemonPid,
    socket: "/tmp/orb-sweep-child.sock",
    cdpEndpoint: null,
    slotDir: "/tmp/orb-sweep-child-slot",
    binding: { kind: "stage", url: diskSafeUrl(`http://localhost:${String(stageBandPorts(BAND).vite)}`) },
    environment: {
      viewport: { width: 1280, height: 720 },
      device: null,
      colorScheme: null,
      reducedMotion: false,
      contrast: null,
      reducedTransparency: false,
      deviceScaleFactor: null,
    },
    bootArgv: diskSafeArgv([]),
    createdAt: stampedAt,
    lastUsedAt: stampedAt,
    inflightOp: null,
    lastOp: null,
    ttlMs: TTL_MS,
    headless: true,
    calls: 0,
  };
}

function judge(home: string, mode: SweepChildMode, nowMs: number): SweepChildReport {
  const now = new Date(nowMs).toISOString();
  const aged = new Date(nowMs - 6 * MS_PER_HOUR).toISOString();
  if (mode === "holder-live") {
    const planted = readBands(home).find((row) => row.band === BAND);
    if (planted === undefined) {
      throw new Error(`the parent planted no row on band ${String(BAND)}`);
    }
    // An aged stamp, so only this process still running keeps the holder live.
    writeRow(home, { ...planted, holders: [{ ...currentHolder(OWNER), stampedAt: aged }] });
  } else {
    // The daemon's own bind stamps the heartbeat, so the row is re-aged after it: only the session can save it.
    bindSessionToBand(home, BAND, SESSION_NAME, now);
    const bound = readBands(home).find((row) => row.band === BAND);
    if (bound === undefined) {
      throw new Error(`the session bind left no row on band ${String(BAND)}`);
    }
    writeRow(home, { ...bound, lastUsedAt: aged });
    writeSessionRow(sessionRegistryHome(OWNER), sessionRow(mode === "session-live" ? process.pid : DEAD_PID, now));
  }
  const ports = stageBandPorts(BAND);
  const self: PortOwner = { kind: "pid", pid: process.pid };
  const views = stageBandViews({
    rows: readBands(home),
    root: OWNER,
    checkout: OWNER,
    targetSha: null,
    nowMs,
    bound: new Map([
      [ports.server, self],
      [ports.vite, self],
    ]),
  });
  const view = views.find((candidate) => candidate.band === BAND);
  if (view === undefined) {
    throw new Error(`the census has no view of band ${String(BAND)}`);
  }
  return { sessions: view.row?.sessions ?? [], verdict: stageSweepVerdict(evidenceFor(view, [process.pid], nowMs), TTL_MS) };
}

if (import.meta.main) {
  const [home, asked, nowMs] = process.argv.slice(2);
  const mode = SWEEP_CHILD_MODES.find((candidate) => candidate === asked);
  if (home === undefined || mode === undefined || nowMs === undefined) {
    throw new Error(`usage: _stage-sweep-child.ts <home> <${SWEEP_CHILD_MODES.join("|")}> <now-ms>`);
  }
  process.stdout.write(`${JSON.stringify(judge(home, mode, Number(nowMs)))}\n`);
}
