// WHAT IS RUNNING, AND WHOSE IS IT — the observation half of the isolated stage, split out of ops/stage.ts
// when that file crossed the tooling line cap (docs/law/Core-Tooling-Law.md §4.3). One command family:
// read the band ports' owners (ONE socket-table read for the whole table), read the box's ESTABLISHED
// connections so a band can be asked whether anything is actually DRIVING it (#1163's interaction signal),
// decide whether a bound port belongs to a STAGE, age a process, kill a process group, take the THREE
// health probes of design §3.6, and list the stage dirs on disk. Nothing here boots, tears down or judges —
// ops/stage.ts orchestrates and lib/stage-plan.ts + lib/stage-bands.ts rule; these are the raw signals all
// of them read, every one through the platform module.
//
// Every negative here is "I could not measure", never "it is not there": a process table that fails to
// answer returns null or false, and an unreadable socket table arrives as the platform module's refusal.
// The callers treat both as unknown rather than as permission to act. That is what keeps the #324 sweep
// from ever reaping something it merely failed to identify (the #310 liveness-gate lesson).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { httpOkSync } from "../../_shared/http-probe.ts";
import { budget } from "../../_shared/load-budget.ts";
import type { EstablishedConnection, SocketTableRead } from "../../_shared/platform.ts";
import { establishedConnections, processAgeSeconds, processGroupId, processInfo } from "../../_shared/platform.ts";
import { killPidGroup, runNicedSync } from "../../_shared/proc.ts";
import type { ServedState } from "../../stack/index.ts";
import type { StagePorts } from "../contract/stage.ts";
import { STAGE_ROOT_REL, stageBaseUrl, stageServedProbeSpawn } from "../lib/stage-plan.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/** Is anything that is NOT one of this stage's own processes connected to its ports right now? Returns a
 *  DESCRIPTION of the first such peer (for the timer's log line) or null when nobody is.
 *
 *  THIS IS THE STAGE TIMER'S "SOMEBODY IS DRIVING IT" SIGNAL (#1163, design §3.6). `lastUsedAt` is stamped
 *  by table writes, and a one-shot drive writes the table ONCE and then holds a browser against the stage
 *  for as long as the run takes. A page holds vite's HMR websocket open for its whole life, so an
 *  established connection to a band port from a process that is not the stage's own IS the interaction.
 *
 *  UNCERTAINTY COUNTS AS CONNECTED, deliberately: a peer whose own socket row the table did not name, or one
 *  reaching the band from off-box, is reported as foreign. The timer is the arm with no pressure behind
 *  it — "I could not identify the client" must never be the reason a lane's stage disappears mid-drive.
 *  `isStageOwn` and `connections` are injected so a committed proof can plant both directions without a
 *  real stage. */
export function foreignBandPeer(
  ports: StagePorts,
  isStageOwn: (pid: number) => boolean = pidIsStageRooted,
  table: SocketTableRead<readonly EstablishedConnection[]> = establishedConnections(),
): string | null {
  if (table.kind === "refused") {
    // No table, no way to rule a client out: the same uncertainty the rule above counts as connected.
    return `an unreadable connection table (${table.reason})`;
  }
  const connections = table.value;
  const ownerOfLocalPort = new Map<number, number>();
  for (const row of connections) {
    if (row.pid !== null && !ownerOfLocalPort.has(row.localPort)) {
      ownerOfLocalPort.set(row.localPort, row.pid);
    }
  }
  const bandPorts = new Set([ports.server, ports.vite]);
  for (const row of connections) {
    if (!bandPorts.has(row.localPort)) {
      continue;
    }
    if (!LOOPBACK_HOSTS.has(row.peerHost)) {
      return `${row.peerHost}:${row.peerPort} (off-box client of :${row.localPort})`;
    }
    const peerPid = ownerOfLocalPort.get(row.peerPort);
    if (peerPid === undefined) {
      return `${row.peerHost}:${row.peerPort} (unidentified client of :${row.localPort})`;
    }
    if (!isStageOwn(peerPid)) {
      return `pid ${peerPid} (client of :${row.localPort})`;
    }
  }
  return null;
}

/** The pid bound to a stage-band port, or null — the row-less teardown's index. `bound` is one read of the
 *  socket table, so a caller judging the whole table reads ONE snapshot rather than re-reading it per band. */
export function stageBandPortPid(port: number, bound: ReadonlyMap<number, number>): number | null {
  return bound.get(port) ?? null;
}

/** Is EITHER half of a band bound right now? The liveness half of the #108 ownership question —
 *  a foreign row over an unbound band is a corpse to reclaim, over a bound one it is a live sibling.
 *  The #324 sweep asks the same question before judging anything. */
export function bandIsBound(ports: StagePorts, bound: ReadonlyMap<number, number>): boolean {
  return stageBandPortPid(ports.server, bound) !== null || stageBandPortPid(ports.vite, bound) !== null;
}

/** Is the process holding a band port actually a SNAP STAGE? The sweep's one hard fence (#324): a stage
 *  runs out of `.cache/snap-stage/<key>/`, so both its cwd and its argv name that path, and anything else
 *  on a band port — the dev stack on a mis-set PORT, an unrelated server — is never ours to kill. Both
 *  signals are read because either alone can be missing (a cwd the OS does not expose; a child re-exec'd
 *  with a bare argv). No signal at all ⇒ FALSE: "I could not identify it" is not "it is a stage". */
export function pidIsStageRooted(pid: number): boolean {
  const info = processInfo(pid);
  if (info === null) {
    return false;
  }
  return (info.cwd?.includes(STAGE_ROOT_REL) ?? false) || info.cmdline.includes(STAGE_ROOT_REL);
}

/** Elapsed seconds of a process, or null when the OS cannot say (a dead/unreadable pid). The AGE signal for
 *  a marker-less stage — the sweep treats a null as "unknown", never as "old" (see stageSweepVerdict). */
export function pidElapsedSeconds(pid: number): number | null {
  return processAgeSeconds(pid);
}

/** Kill a pid's whole PROCESS GROUP — a stage leader is the stack cli with node and vite children, and
 *  killing the leader alone leaves exactly the orphans #324 is about. Returns whether a group was named.
 *  win32 has no group: the pid's tree is terminated instead. */
export function killProcessGroup(pid: number): boolean {
  const target = process.platform === "win32" ? pid : processGroupId(pid);
  if (target === null) {
    return false;
  }
  killPidGroup(target, "SIGTERM");
  return true;
}

// ── the three health probes (design §3.6) ─────────────────────────────────────────────────────────────

/** The served-probe child's ceiling. It fetches up to five modules from the stage's own vite, each with its
 *  own 3 s budget inside the child, so this is the child's whole life — a wedged probe must not hold a snap
 *  call open. Load-scaled through the one policy (#1232): the literal is the QUIET-BOX base. */
const SERVED_PROBE_BASE_MS = 20_000;

/** Probe 1 of 3: does the stage's SERVER answer /healthz? */
export function stageHealthzOk(serverPort: number): boolean {
  return httpOkSync(`http://127.0.0.1:${serverPort}/healthz`);
}

/** Probe 2 of 3: does the stage's VITE answer at the origin snap navigates to? */
export function stageViteOk(vitePort: number): boolean {
  return httpOkSync(`${stageBaseUrl(vitePort)}/`);
}

/** Probe 3 of 3: is that vite serving the code that is ON DISK, or a transform from before its watcher died?
 *
 *  THE VERB ALREADY EXISTS and is not re-spelled here: `tooling/src/stack/ops/served-probe.ts`, reached
 *  through the stack cli's `served-probe` verb. We run the STAGE'S OWN COPY of it, from the stage dir, with
 *  the stage's `VITE_PORT` — so the comparison is that tree's disk source against that tree's vite, never
 *  ours against theirs.
 *
 *  A child, not an import, for one reason: the whole stage path is SYNCHRONOUS (spawnSync boots, socket
 *  probes, JSON writes) and `probeServedTransform` is async.
 *
 *  Exit codes are the stack tool's contract: 0 fresh · 1 stale · 2 could-not-measure. A ref whose tree
 *  predates the probe entry has nothing to run, which is `unverifiable` — an honest "I could not measure",
 *  which `stageHealthVerdict` then reads by source kind. */
export function stageServedState(stageDir: string, vitePort: number): ServedState {
  const spawn = stageServedProbeSpawn(stageDir, existsSync, process.execPath);
  if (spawn === null) {
    return "unverifiable";
  }
  const env: NodeJS.ProcessEnv = {
    // biome-ignore lint/style/noProcessEnv: spawnSync's `env` REPLACES the child's environment, so the ambient PATH (which `nice` and `node` are found through) has to come across — harness plumbing, not app config. Only VITE_PORT is added, and it is what points the probe at the STAGE's vite instead of the dev one.
    ...process.env,
    VITE_PORT: String(vitePort),
  };
  const res = runNicedSync(spawn.command, spawn.args, { cwd: stageDir, env, timeout: budget(SERVED_PROBE_BASE_MS) });
  const state = SERVED_STATE_RE.exec(res.stdout);
  if (state === null) {
    return "unverifiable";
  }
  const named = state[1];
  return named === "fresh" || named === "stale" || named === "unreachable" ? named : "unverifiable";
}

const SERVED_STATE_RE = /^SERVED state=([a-z-]+)/mu;

/** Stage worktree/dir names present under `.cache/snap-stage/` (excludes the band table). Stage dirs are
 *  per-checkout by design — each is a worktree of its own checkout — so this can only ever see ours. */
export function stageDirs(root: string): string[] {
  const dir = join(root, STAGE_ROOT_REL);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
