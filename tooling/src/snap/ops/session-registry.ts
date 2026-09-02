// The session REGISTRY's I/O (docs/design/1208-instrument-substrate.md §3.2/§3.5/§10.1): the repo-keyed dir
// beside the stage marker, one ROW file per session, the socket and log paths, daemon liveness, the limits
// from env, and the reaper primitive the sweep and the close share. Every path and verdict is derived in
// lib/session-plan.ts; this module only reads, writes and signals. Split from the client so the admin
// verbs (ops/session-admin.ts) and `--stage-status` read the registry without importing the socket client.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { adoptRunSlot } from "../../_shared/artifact-out.ts";
import { pidAlive, publishRunSlot } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { killPidGroup } from "../../_shared/proc.ts";
import type { SessionLimits, SessionRow } from "../contract/session.ts";
import {
  resolveSessionLimits,
  SESSION_CLOSE_GRACE_MS,
  SESSION_INSTRUMENT,
  SESSION_READY_POLL_MS,
  SESSION_REGISTRY_REL,
  sessionIdleMs,
  sessionRowPath,
  sessionSocketPath,
} from "../lib/session-plan.ts";
import { readSessionRow } from "../lib/session-wire.ts";
import { markerRoot } from "./stage-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session-status");

const ROW_SUFFIX = ".json";
const SOCKET_SUFFIX = ".sock";
const MS_PER_MINUTE = 60_000;

/** `<main>/.cache/snap-session/` — the stage marker's `markerRoot` derivation (#108), so every worktree of
 *  the repo sees ONE registry and a session is reachable from any of them. `ORB_SNAP_SESSION_HOME`
 *  overrides it for the committed proofs: a test that wrote the box's REAL registry would collide with a
 *  live sibling's session (the stage-marker rule — a suite never writes the shared marker). */
export function sessionRegistryHome(root: string): string {
  // biome-ignore lint/style/noProcessEnv: ORB_SNAP_SESSION_HOME is a harness knob (the committed session proofs plant a scratch registry instead of the box's real one) — ambient tooling env, not app config; the SNAP_BASE_URL posture in _shared/browser.ts.
  const override = process.env["ORB_SNAP_SESSION_HOME"];
  const home = override === undefined || override === "" ? join(markerRoot(root), SESSION_REGISTRY_REL) : override;
  mkdirSync(home, { recursive: true });
  return home;
}

/** The owner-ruled calibration knobs (F5): env-overridable TTL and cap, resolved by the pure rule. */
export function sessionLimitsFromEnv(ttlMinFlag: number | null): { readonly limits: SessionLimits; readonly errors: readonly string[] } {
  // biome-ignore lint/style/noProcessEnv: ORB_SESSION_TTL_MIN is the owner-ruled TTL override (docs/design/1208-instrument-substrate.md §12.2 F5) — ambient tooling env, not app config.
  const ttlMinEnv = process.env["ORB_SESSION_TTL_MIN"];
  // biome-ignore lint/style/noProcessEnv: ORB_SESSION_CAP is the owner-ruled cap override (F5) — same posture.
  const capEnv = process.env["ORB_SESSION_CAP"];
  return resolveSessionLimits({ ttlMinEnv, capEnv, ttlMinFlag });
}

export function readRow(home: string, name: string): SessionRow | null {
  const path = sessionRowPath(home, name);
  return existsSync(path) ? readSessionRow(readFileSync(path, "utf8")) : null;
}

export function writeRow(home: string, row: SessionRow): void {
  writeFileSync(sessionRowPath(home, row.name), `${JSON.stringify(row, null, 2)}\n`);
}

export function removeRow(home: string, name: string): void {
  rmSync(sessionRowPath(home, name), { force: true });
}

export function removeSocket(home: string, name: string): void {
  rmSync(sessionSocketPath(home, name), { force: true });
}

/** Every readable row in the registry, whoever owns it — the cap and the status read are box-wide. */
export function listRows(home: string): readonly SessionRow[] {
  return readdirSync(home)
    .filter((entry) => entry.endsWith(ROW_SUFFIX))
    .map((entry) => readRow(home, entry.slice(0, -ROW_SUFFIX.length)))
    .filter((row): row is SessionRow => row !== null);
}

/** Socket files no row accounts for — a daemon that died between binding and writing its row. */
export function orphanSockets(home: string): readonly string[] {
  const named = new Set(listRows(home).map((row) => row.name));
  return readdirSync(home)
    .filter((entry) => entry.endsWith(SOCKET_SUFFIX))
    .map((entry) => entry.slice(0, -SOCKET_SUFFIX.length))
    .filter((name) => !named.has(name));
}

export function rowIsLive(row: SessionRow): boolean {
  return pidAlive(row.daemonPid);
}

export function liveRows(home: string): readonly SessionRow[] {
  return listRows(home).filter(rowIsLive);
}

/** Signal the daemon's whole process group — `spawnNicedChild` is detached, so the daemon leads its own
 *  group and the browser tree rides with it. Through the SYSCALL door (`_shared/proc.ts` `killPidGroup`)
 *  and never a spawned `kill -SIG -<pgid>`: procps parses that as the pgid's first digit, which with
 *  seven-digit pids is `kill(-1)` — the whole box (#1254, paid by this file on 2026-09-02). A row whose
 *  pgid is not a real group leader (≤ 1) is refused outright: a corrupt row must never become a broadcast. */
function signalSessionGroup(row: SessionRow, signal: "TERM" | "KILL"): void {
  if (!Number.isInteger(row.pgid) || row.pgid <= 1) {
    return;
  }
  killPidGroup(row.pgid, signal === "TERM" ? "SIGTERM" : "SIGKILL");
}

/** Wait for the daemon pid to leave, bounded by the close grace; true when it did. */
export async function waitForDaemonExit(row: SessionRow, graceMs: number = SESSION_CLOSE_GRACE_MS): Promise<boolean> {
  const deadline = Date.now() + graceMs;
  while (pidAlive(row.daemonPid)) {
    if (Date.now() > deadline) {
      return false;
    }
    await sleep(SESSION_READY_POLL_MS);
  }
  return true;
}

/** Reap a session whose daemon is dead, wedged or being force-closed: TERM the group, KILL it if it lingers
 *  past the grace, drop the socket + row, and SETTLE the session slot's in-flight marker (published with no
 *  aliases — nothing to point at, the ring may prune it) so `abandonedRuns` stops naming it (§3.8). */
export async function reapSession(home: string, root: string, row: SessionRow): Promise<string> {
  const steps: string[] = [];
  if (pidAlive(row.daemonPid)) {
    signalSessionGroup(row, "TERM");
    if (await waitForDaemonExit(row)) {
      steps.push(`stopped daemon pid ${row.daemonPid} (group ${row.pgid})`);
    } else {
      signalSessionGroup(row, "KILL");
      steps.push(`killed daemon group ${row.pgid} (did not leave within ${SESSION_CLOSE_GRACE_MS}ms)`);
    }
  } else {
    // The browser tree may outlive a daemon that died — the group signal reaches it whether or not the
    // leader is gone (ESRCH when nothing is left, which `kill` reports and we do not need).
    signalSessionGroup(row, "KILL");
    steps.push(`daemon pid ${row.daemonPid} was already gone; signalled group ${row.pgid}`);
  }
  removeSocket(home, row.name);
  removeRow(home, row.name);
  if (existsSync(row.slotDir)) {
    publishRunSlot(root, adoptRunSlot(root, SESSION_INSTRUMENT, row.slotDir), []);
    steps.push("settled the session slot's marker");
  }
  return steps.join(", ");
}

/** The one-line census `--stage-status` prints (§3.8's third reader): live names, dead names, the remedy. */
export function sessionStatusSummary(root: string, nowMs: number): string {
  const rows = listRows(sessionRegistryHome(root));
  if (rows.length === 0) {
    return "none";
  }
  const live = rows.filter(rowIsLive);
  const dead = rows.filter((row) => !rowIsLive(row));
  const parts = [
    `${live.length} live${live.length === 0 ? "" : ` (${live.map((row) => `${row.name} idle ${Math.round(sessionIdleMs(row, nowMs) / MS_PER_MINUTE)}m`).join(" · ")})`}`,
    ...(dead.length === 0 ? [] : [`${dead.length} DEAD (${dead.map((row) => row.name).join(", ")} — \`pnpm snap --session-sweep\`)`]),
  ];
  return parts.join(" · ");
}
