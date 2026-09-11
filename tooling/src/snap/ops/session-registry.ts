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
import { publishRunSlot } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { killPidGroup } from "../../_shared/proc.ts";
import { pidAlive } from "../../_shared/run-retention.ts";
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
const BOOT_LOCK = ".boot.lock";
const BOOT_RESERVATIONS = ".boot";
const BOOT_LOCK_POLL_MS = 25;
const MS_PER_MINUTE = 60_000;

/** THE ONE env door for the session registry — read once, at module load, because every consumer is a
 *  FRESH PROCESS (the client cli, the daemon cli, each spawned proof), so a caller that wants different
 *  knobs sets them in the environment of the CHILD and never mid-process. That is the same posture
 *  `_shared/load-budget.ts` states for `ORB_BUDGET_CEILING_MS`, and it is why one destructure can serve
 *  both readers below instead of three scattered `process.env` reads. */
// biome-ignore lint/style/noProcessEnv: the three ambient TOOLING knobs this file owns — ORB_SNAP_SESSION_HOME (the committed proofs plant a scratch registry; writing the box's REAL one would collide with a live sibling's session) plus the owner-ruled ORB_SESSION_TTL_MIN / ORB_SESSION_CAP overrides (docs/design/1208-instrument-substrate.md §12.2 F5). Same class as this tree's SNAP_BASE_URL/DEBUG_TOKEN/FFMPEG_BIN rows; the env door the rule points at (packages/server/src/foundation/env) sits ABOVE @orb/tooling in the cake and cannot be imported down here.
const { ORB_SNAP_SESSION_HOME: HOME_OVERRIDE, ORB_SESSION_TTL_MIN: TTL_MIN_ENV, ORB_SESSION_CAP: CAP_ENV } = process.env;

/** `<main>/.cache/snap-session/` — the stage marker's `markerRoot` derivation (#108), so every worktree of
 *  the repo sees ONE registry and a session is reachable from any of them. `ORB_SNAP_SESSION_HOME`
 *  overrides it for the committed proofs: a test that wrote the box's REAL registry would collide with a
 *  live sibling's session (the stage-marker rule — a suite never writes the shared marker). */
export function sessionRegistryHome(root: string): string {
  const home = HOME_OVERRIDE === undefined || HOME_OVERRIDE === "" ? join(markerRoot(root), SESSION_REGISTRY_REL) : HOME_OVERRIDE;
  mkdirSync(home, { recursive: true });
  return home;
}

/** The owner-ruled calibration knobs (F5): env-overridable TTL and cap, resolved by the pure rule. */
export function sessionLimitsFromEnv(ttlMinFlag: number | null): { readonly limits: SessionLimits; readonly errors: readonly string[] } {
  return resolveSessionLimits({ ttlMinEnv: TTL_MIN_ENV, capEnv: CAP_ENV, ttlMinFlag });
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

interface BootReservation {
  readonly name: string;
  readonly pid: number;
}

function bootReservation(value: unknown): BootReservation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const name = Reflect.get(value, "name");
  const pid = Reflect.get(value, "pid");
  return typeof name === "string" && Number.isInteger(pid) && Number(pid) > 0 ? { name, pid: Number(pid) } : null;
}

function reservationDir(home: string): string {
  return join(home, BOOT_RESERVATIONS);
}

function reservationPath(home: string, name: string): string {
  return join(reservationDir(home), name);
}

function reservationNames(home: string): readonly string[] {
  const dir = reservationDir(home);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).filter((name) => {
    // @orb-waive caught-failure-ownership(catch): an unreadable reservation cannot hold capacity; the lock owner removes that exact file below before returning false. Ends if malformed reservations must block acquisition instead of being reclaimed.
    try {
      const reservation = bootReservation(JSON.parse(readFileSync(reservationPath(home, name), "utf8")));
      if (reservation?.name === name && pidAlive(reservation.pid)) {
        return true;
      }
    } catch {
      // A partial/dead reservation never holds capacity; the lock holder removes it below.
    }
    rmSync(reservationPath(home, name), { force: true });
    return false;
  });
}

function withBootLock<T>(home: string, fn: () => T): T {
  const path = join(home, BOOT_LOCK);
  for (;;) {
    // @orb-waive caught-failure-ownership(error): only EEXIST is the expected lock-contention signal and it retries after a bounded poll; every other mkdir failure rethrows. Ends if the lock stops being represented by exclusive directory creation.
    try {
      mkdirSync(path);
      break;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, BOOT_LOCK_POLL_MS);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}

/** Reserve one name and one cap slot before spawning its daemon. A row is only published after Chromium
 *  launches, so checking `liveRows()` alone races two cold boots through a cap of one. */
export function reserveSessionBoot(home: string, name: string, cap: number): "reserved" | "name" | "cap" {
  return withBootLock(home, () => {
    mkdirSync(reservationDir(home), { recursive: true });
    const pending = reservationNames(home);
    if (pending.includes(name)) {
      return "name";
    }
    if (liveRows(home).length + pending.length >= cap) {
      return "cap";
    }
    writeFileSync(reservationPath(home, name), JSON.stringify({ name, pid: process.pid } satisfies BootReservation));
    return "reserved";
  });
}

export function releaseSessionBoot(home: string, name: string): void {
  rmSync(reservationPath(home, name), { force: true });
}

/** The names of every session whose daemon is ALIVE, for the band table's reaper fence (§3.6): a stage row
 *  listing one of these is IN USE and is never a strand, whatever its idle age — the daemon is driving it,
 *  and a reaper that eats a live stage is worse than no reaper. */
export function liveSessionNames(root: string): ReadonlySet<string> {
  return new Set(liveRows(sessionRegistryHome(root)).map((row) => row.name));
}

/** Signal the daemon's whole process group — `spawnFullPriorityChild` is detached, so the daemon leads its own
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
