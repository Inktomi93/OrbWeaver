// WHAT IS RUNNING, AND WHOSE IS IT — the observation half of the isolated stage, split out of ops/stage.ts
// when that file crossed the tooling line cap (docs/architecture/core/Core-Tooling-Law.md §4.3). One command family:
// read the band ports' owners (ONE `ss` for the whole table), read the box's ESTABLISHED connections so a
// band can be asked whether anything is actually DRIVING it (#1163's interaction signal), decide whether a
// bound port belongs to a STAGE, age a process, kill a process group, take the THREE health probes of
// design §3.6, and list the stage dirs on disk. Nothing here boots, tears down or judges — ops/stage.ts orchestrates and
// lib/stage-plan.ts + lib/stage-bands.ts rule; these are the raw signals all of them read.
//
// Every negative here is "I could not measure", never "it is not there": `ss`/`ps`/`readlink` failing to
// answer returns null or false, and the callers are written to treat that as unknown rather than as
// permission to act. That is what keeps the #324 sweep from ever reaping something it merely failed to
// identify (the #310 liveness-gate lesson).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { budget } from "../../_shared/load-budget.ts";
import { killPidGroup, runNicedSync } from "../../_shared/proc.ts";
import type { ServedState } from "../../stack/index.ts";
import type { EstablishedConnection, StagePorts } from "../contract/stage.ts";
import { STAGE_ROOT_REL, stageBaseUrl } from "../lib/stage-plan.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const SS_PID_RE = /pid=(\d+)/u;
const SS_PORT_RE = /:(\d+)\s/u;
/** `ss -tnp state established` column layout: `Recv-Q Send-Q Local:Port Peer:Port [users:(…)]`. A state
 *  filter suppresses the State column, so the queue depths lead — which is also what distinguishes a data
 *  row from the header without matching on the header's words. */
const SS_MIN_FIELDS = 4;
const SS_LOCAL_FIELD = 2;
const SS_PEER_FIELD = 3;

/** ONE `ss -tlnp`, parsed into port → pid. Ten bands × two ports used to mean twenty `ss` invocations per
 *  allocation (`bandIsBound` alone forked twice per band); the table asks the box ONE question and every
 *  band verdict is read off the same snapshot, so the census can never disagree with itself mid-read. */
export function listeningPids(): ReadonlyMap<number, number> {
  const bound = new Map<number, number>();
  const out = runNicedSync("ss", ["-tlnp"]);
  if (out.status !== 0) {
    return bound;
  }
  for (const line of out.stdout.split("\n")) {
    const port = SS_PORT_RE.exec(line);
    const pid = SS_PID_RE.exec(line);
    if (port !== null && pid !== null) {
      bound.set(Number(port[1]), Number(pid[1]));
    }
  }
  return bound;
}

/** ONE `ss -tnp state established`, parsed into the ESTABLISHED connections of the box: for each socket,
 *  which local port it terminates, which peer port it faces, and which pid owns the LOCAL end.
 *
 *  THIS IS THE STAGE TIMER'S "SOMEBODY IS DRIVING IT" SIGNAL (#1163, design §3.6). `lastUsedAt` is stamped
 *  by table writes, and a one-shot drive writes the table ONCE and then holds a browser against the stage
 *  for as long as the run takes — a 90-minute matrix pass would look idle to a clock that only reads the
 *  row. A page holds vite's HMR websocket open for its whole life, so an established connection to a band
 *  port from a process that is not the stage's own IS the interaction, observed rather than assumed. */
function establishedConnections(): readonly EstablishedConnection[] {
  const out = runNicedSync("ss", ["-tnp", "state", "established"]);
  if (out.status !== 0) {
    return [];
  }
  const rows: EstablishedConnection[] = [];
  for (const line of out.stdout.split("\n")) {
    const fields = line.trim().split(/\s+/u);
    // Recv-Q Send-Q Local:Port Peer:Port [users:(("cmd",pid=N,fd=M))] — the header line's first field is
    // the word "Recv-Q", so requiring a numeric queue depth drops it without matching on its text.
    if (fields.length < SS_MIN_FIELDS || !/^\d+$/u.test(fields[0] ?? "")) {
      continue;
    }
    const local = splitHostPort(fields[SS_LOCAL_FIELD] ?? "");
    const peer = splitHostPort(fields[SS_PEER_FIELD] ?? "");
    if (local === null || peer === null) {
      continue;
    }
    const pid = SS_PID_RE.exec(line);
    rows.push({ localPort: local.port, peerHost: peer.host, peerPort: peer.port, pid: pid === null ? null : Number(pid[1]) });
  }
  return rows;
}

/** `host:port` split from the RIGHT — an IPv6 local address is `[::1]:8888`, so a left split loses. */
function splitHostPort(token: string): { readonly host: string; readonly port: number } | null {
  const colon = token.lastIndexOf(":");
  if (colon <= 0) {
    return null;
  }
  const port = Number(token.slice(colon + 1));
  return Number.isInteger(port) ? { host: token.slice(0, colon), port } : null;
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/** Is anything that is NOT one of this stage's own processes connected to its ports right now? Returns a
 *  DESCRIPTION of the first such peer (for the timer's log line) or null when nobody is.
 *
 *  UNCERTAINTY COUNTS AS CONNECTED, deliberately: a peer whose own socket row `ss` did not name, or one
 *  reaching the band from off-box, is reported as foreign. The timer is the arm with no pressure behind
 *  it — "I could not identify the client" must never be the reason a lane's stage disappears mid-drive.
 *  `isStageOwn` is injected so a committed proof can plant both directions without a real stage. */
export function foreignBandPeer(ports: StagePorts, isStageOwn: (pid: number) => boolean = pidIsStageRooted): string | null {
  const connections = establishedConnections();
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

/** The pid bound to a stage-band port, or null — the row-less teardown's index. `bound` is injectable so a
 *  caller judging the whole table reads ONE snapshot rather than re-forking `ss` per band. */
export function stageBandPortPid(port: number, bound: ReadonlyMap<number, number> = listeningPids()): number | null {
  return bound.get(port) ?? null;
}

/** Is EITHER half of a band bound right now? The liveness half of the #108 ownership question —
 *  a foreign row over an unbound band is a corpse to reclaim, over a bound one it is a live sibling.
 *  The #324 sweep asks the same question before judging anything. */
export function bandIsBound(ports: StagePorts, bound: ReadonlyMap<number, number> = listeningPids()): boolean {
  return stageBandPortPid(ports.server, bound) !== null || stageBandPortPid(ports.vite, bound) !== null;
}

/** Is the process holding a band port actually a SNAP STAGE? The sweep's one hard fence (#324): a stage
 *  runs out of `.cache/snap-stage/<key>/`, so both its cwd and its argv name that path, and anything else
 *  on a band port — the dev stack on a mis-set PORT, an unrelated server — is never ours to kill. Both
 *  signals are read because either alone can be missing (a `/proc` we cannot readlink; a `stack.sh` child
 *  re-exec'd with a bare argv). No signal at all ⇒ FALSE: "I could not identify it" is not "it is a stage". */
export function pidIsStageRooted(pid: number): boolean {
  const cwd = runNicedSync("readlink", ["-f", `/proc/${pid}/cwd`]);
  if (cwd.status === 0 && cwd.stdout.includes(STAGE_ROOT_REL)) {
    return true;
  }
  const args = runNicedSync("ps", ["-o", "args=", "-p", String(pid)]);
  return args.status === 0 && args.stdout.includes(STAGE_ROOT_REL);
}

/** Elapsed seconds of a process, or null when `ps` cannot say (a dead/unreadable pid). The AGE signal for
 *  a marker-less stage — the sweep treats a null as "unknown", never as "old" (see stageSweepVerdict). */
export function pidElapsedSeconds(pid: number): number | null {
  const res = runNicedSync("ps", ["-o", "etimes=", "-p", String(pid)]);
  if (res.status !== 0) {
    return null;
  }
  const seconds = Number(res.stdout.trim());
  return Number.isFinite(seconds) ? seconds : null;
}

/** Kill a pid's whole PROCESS GROUP — a stage leader is `stack.sh` with dev.sh/node/vite children, and
 *  killing the leader alone leaves exactly the orphans #324 is about. Returns whether a group was named. */
export function killProcessGroup(pid: number): boolean {
  const pgid = runNicedSync("ps", ["-o", "pgid=", "-p", String(pid)]).stdout.trim();
  if (pgid.length === 0) {
    return false;
  }
  killPidGroup(Number(pgid), "SIGTERM");
  return true;
}

// ── the three health probes (design §3.6) ─────────────────────────────────────────────────────────────

const CURL_TIMEOUT_S = "2";
/** The served-probe child's ceiling. It fetches up to five modules from the stage's own vite, each with its
 *  own 3 s budget inside the child, so this is the child's whole life — a wedged probe must not hold a snap
 *  call open. Load-scaled through the one policy (#1232): the literal is the QUIET-BOX base. */
const SERVED_PROBE_BASE_MS = 20_000;

function curlOk(url: string): boolean {
  return runNicedSync("curl", ["-sf", "-m", CURL_TIMEOUT_S, url], { stdio: "ignore" }).status === 0;
}

/** Probe 1 of 3: does the stage's SERVER answer /healthz? */
export function stageHealthzOk(serverPort: number): boolean {
  return curlOk(`http://127.0.0.1:${serverPort}/healthz`);
}

/** Probe 2 of 3: does the stage's VITE answer at the origin snap navigates to? */
export function stageViteOk(vitePort: number): boolean {
  return curlOk(`${stageBaseUrl(vitePort)}/`);
}

/** Probe 3 of 3: is that vite serving the code that is ON DISK, or a transform from before its watcher died?
 *
 *  THE VERB ALREADY EXISTS and is not re-spelled here: `tooling/src/stack/ops/served-probe.ts`, reached
 *  through `prod-entry.ts served-probe` exactly as `stack.sh`'s `served_probe()` reaches it (`stack.sh:441`).
 *  We run the STAGE'S OWN COPY of it, from the stage dir, with the stage's `VITE_PORT` — so the comparison is
 *  that tree's disk source against that tree's vite, never ours against theirs.
 *
 *  A child, not an import, for one reason: the whole stage path is SYNCHRONOUS (spawnSync boots, `ss`
 *  probes, JSON writes) and `probeServedTransform` is async. The bash front door already spawns it; this is
 *  the same door from node.
 *
 *  Exit codes are the stack tool's contract: 0 fresh · 1 stale · 2 could-not-measure. A ref whose tree
 *  predates the probe entry has nothing to run, which is `unverifiable` — an honest "I could not measure",
 *  which `stageHealthVerdict` then reads by source kind. */
export function stageServedState(stageDir: string, vitePort: number): ServedState {
  const entry = join(stageDir, "tooling", "src", "stack", "ops", "prod-entry.ts");
  if (!existsSync(entry)) {
    return "unverifiable";
  }
  const env: NodeJS.ProcessEnv = {
    // biome-ignore lint/style/noProcessEnv: spawnSync's `env` REPLACES the child's environment, so the ambient PATH (which `nice` and `node` are found through) has to come across — harness plumbing, not app config. Only VITE_PORT is added, and it is what points the probe at the STAGE's vite instead of the dev one.
    ...process.env,
    VITE_PORT: String(vitePort),
  };
  const res = runNicedSync("node", [entry, "served-probe"], { cwd: stageDir, env, timeout: budget(SERVED_PROBE_BASE_MS) });
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
