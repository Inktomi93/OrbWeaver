// THE STATEFUL SESSION SUBSTRATE, phase 1 (docs/design/1208-instrument-substrate.md §8 T1/T2/T3/T5/T6/T9 +
// §10.1) — driven through the REAL cli over `--file` fixtures with a SCRATCH registry (`ORB_SNAP_SESSION_HOME`)
// and tiny caps/TTLs from env, so no case here touches the box's real `<main>/.cache/snap-session/` (the
// stage-marker rule: a suite never writes the shared marker). Every daemon a case boots is closed in its
// `finally`; the sweep is the belt.
//
// PLANTED CONTROLS, both directions: T1 carries the one-shot twin as the FENCE it is (two fresh browsers
// share nothing by construction) beside the session A/B isolation the substrate adds; T2 kills a daemon
// MID-CALL so the loud line names the op, and the live sibling proves the sweep reaps nothing it should not;
// T5's half-window call proves the TTL resets (or the reap would be a way to stop testing); T6's close
// proves the cap admits the next boot; T9's contrast defect reds both paths, so "identical pairs" cannot be
// two paths that both measured nothing. The attach case drives the OWNER's page from a second CDP client
// through the one attach door and proves the owner survives the disconnect (the phase-0 spike's receipt,
// now behind `attachProbeSession`).
//
// @instrument-proof: T9 — the same `--contrast p` on a WCAG-failing fixture exits 1 with `contrast-fails=1`
// one-shot AND through a session (one implementation, never a second capture path).
// @instrument-absence-proof: T2 — a call on a session whose daemon is GONE exits 2 with `SESSION DEAD …
// mid-<op>`, never a comfortable RESULT from a browser that no longer exists.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { abandonedRuns } from "@orb/tooling/_shared/artifacts";
import { attachProbeSession, closeProbeSession } from "@orb/tooling/_shared/browser";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { markedPids, mintRunMarker, RUN_MARKER_ENV, runMarkerEnv } from "@orb/tooling/_shared/run-marker";
import { vi } from "vitest";
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_INSTRUMENT } from "../../../../tooling/src/snap/lib/session-plan.ts";
import { readSessionRow, resultPairsOf } from "../../../../tooling/src/snap/lib/session-wire.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import type { CliResult } from "../../../support/tool-fixtures.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// Wall clock only — every arm asserts a STRUCTURAL fact (an eval value, an exit code, a file, a pid's
// liveness), so this file stays in the parallel lane and scales its budgets rather than withholding. A
// daemon boot is one Chromium (~3 s quiet); the busiest case boots two and drives four calls.
const CASE_BUDGET_MS = scaledBudget(120_000, 4);
const CLI_BUDGET_MS = scaledBudget(60_000, 4);
vi.setConfig({ testTimeout: CASE_BUDGET_MS, hookTimeout: CASE_BUDGET_MS });

const FIXTURE_HTML =
  '<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>fixture</title></head><body><main id="m">fixture</main><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}}</script></body></html>';
/** T8's subject: a real surface for the design-audit arm — a landmark, prose for the colour/type
 *  families, and one sized, named control so the interactive census has a non-empty denominator. */
const AUDIT_FIXTURE_HTML =
  '<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>audit fixture</title></head>' +
  '<body style="margin:0;background:#000;color:#fff"><main><p style="font-size:16px;margin:24px">the reading surface under audit</p>' +
  '<button type="button" aria-label="Only action" style="width:48px;height:48px;background:#fff;color:#000">Go</button></main>' +
  // `shell` is part of the bridge the --design-audit arm reads for the panel axis (#148 item 2); a
  // fixture that publishes __orb WITHOUT it is a partial bridge, which the arm reports as a nav failure.
  "<script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},shell:()=>null}</script></body></html>";
/** The same WCAG-failing plant tests/tooling/snap/cli.int.test.ts uses for the one-shot contrast proof. */
const BAD_CONTRAST_HTML =
  '<!doctype html><html data-app-ready="settled"><body style="background:#8a8a8a"><p style="color:#7a7a7a;font-size:16px">barely there text</p><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}}</script></body></html>';
const EVAL_RE = /EVAL\[0\][^\n]*\n(\d+)/u;
const QUIET = ["--no-shot"];
/** A promise-returning eval snap awaits — the in-flight window T2 and the busy case need. */
const SLOW_EVAL = "new Promise((resolve) => setTimeout(() => resolve('slow-done'), 4000))";
/** T5 ACTIVE's long call: beyond that case's 9s idle TTL, and it rides the NAVIGATING watchdog (180s
 *  base, `sessionCallWatchdogBaseMs`) because its argv carries `--file` — the 5s non-navigating ceiling
 *  never applies to it. The pair moved from 1.2s TTL / 2s eval on 2026-09-05 (#1744): an idle TTL is
 *  never load-scaled (the ONE policy's IDLE class), so the only way the arm survives co-scheduling is a
 *  TTL the HARNESS's own gap cannot beat — a fresh snap CLI child costs 0.83-2.85s on this box at
 *  loadavg ~30, which at 1.2s reaped the daemon between the long call and the next one and turned the
 *  follow-up into a correct `never navigated` refusal (exit 3) with nothing wrong in the substrate. */
const ACTIVE_TTL_EVAL = "new Promise((resolve) => setTimeout(() => resolve('active-ttl-done'), 12000))";
/** T5 ACTIVE's second call is LIVE (no `--file`), so it is held to the 5s non-navigating watchdog: it only
 *  has to be in flight long enough for the row's `inflightOp` to be observed and the close to race it. */
const IN_FLIGHT_EVAL = "new Promise((resolve) => setTimeout(() => resolve('in-flight-done'), 2000))";
/** T17's dead promise keeps the call in flight without blocking the browser protocol that aborts it. */
const HANGING_EVAL = "new Promise(() => {})";
const POLL_MS = 250;
const POLL_ATTEMPTS = 80;
/** The three env knobs the substrate reads (ops/session-registry.ts) — spelled once, composed by `envOf`. */
const SESSION_HOME_KEY = "ORB_SNAP_SESSION_HOME";
const SESSION_TTL_KEY = "ORB_SESSION_TTL_MIN";
const SESSION_CAP_KEY = "ORB_SESSION_CAP";

function envOf(pairs: readonly (readonly [string, string])[]): Record<string, string> {
  return Object.fromEntries(pairs);
}

function evalValue(stdout: string): number {
  const raw = EVAL_RE.exec(stdout)?.[1];
  expect(raw, `the in-page eval must have printed a number — got:\n${stdout}`).toBeDefined();
  return Number(raw);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Poll (bounded) until the predicate holds; returns whether it did — a caller asserts on the boolean. */
async function until(predicate: () => boolean, attempts = POLL_ATTEMPTS): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return predicate();
}

function rowOf(home: string, name: string): SessionRow {
  const row = readSessionRow(readFileSync(join(home, `${name}.json`), "utf8"));
  expect(row, `session ${name} must have a readable row in ${home}`).not.toBeNull();
  return row as SessionRow;
}

function pairsOf(stdout: string): Record<string, string> {
  return Object.fromEntries(resultPairsOf(stdout.split("\n")));
}

interface Rig {
  readonly home: string;
  readonly fixture: string;
  readonly auditFixture: string;
  readonly bad: string;
  readonly env: Readonly<Record<string, string>>;
  readonly snap: (args: readonly string[], env?: Readonly<Record<string, string>>) => Promise<CliResult>;
  readonly close: (names: readonly string[]) => Promise<void>;
}

/** One case's isolated world: a scratch registry, the fixtures, and the cli door with the env that points
 *  every spawned snap (client AND daemon — the daemon inherits the client's env) at that registry. */
async function rig(
  plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>,
  runCli: (tool: string, args: readonly string[], opts?: { cwd?: string; env?: Readonly<Record<string, string>>; timeoutMs?: number }) => Promise<CliResult>,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<Rig> {
  const root = await plantedTree({ "fixture.html": FIXTURE_HTML, "audit.html": AUDIT_FIXTURE_HTML, "bad.html": BAD_CONTRAST_HTML, "registry/.keep": "" });
  const home = join(root, "registry");
  const env = { ...envOf([[SESSION_HOME_KEY, home]]), ...extraEnv };
  const snap = (args: readonly string[], over: Readonly<Record<string, string>> = {}): Promise<CliResult> =>
    runCli("snap", args, { env: { ...env, ...over }, timeoutMs: CLI_BUDGET_MS });
  const close = async (names: readonly string[]): Promise<void> => {
    for (const name of names) {
      await snap(["--session-close", name]);
    }
    await snap(["--session-sweep"]);
  };
  return { home, fixture: join(root, "fixture.html"), auditFixture: join(root, "audit.html"), bad: join(root, "bad.html"), env, snap, close };
}

const uniq = (tag: string): string => `p-s1-${tag}-${process.pid}`;

// ── T1: a lane's emulation cannot reach a sibling ────────────────────────────────────────────────────

test("T1 — two sessions over one fixture: A's --viewport 412x823 is A's alone (B reads 1280), and A's LIVE page still reads 412", async ({
  plantedTree,
  runCli,
}) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("t1a");
  const b = uniq("t1b");
  try {
    const bootA = await r.snap(["--session", a, "--file", r.fixture, "--viewport", "412x823", "--eval", "innerWidth", ...QUIET]);
    await expect(bootA).toExitWith(EXIT.clean);
    expect(evalValue(bootA.stdout)).toBe(412);
    const bootB = await r.snap(["--session", b, "--file", r.fixture, "--eval", "innerWidth", ...QUIET]);
    await expect(bootB).toExitWith(EXIT.clean);
    expect(evalValue(bootB.stdout)).toBe(1280);
    // The control that the instrument MEASURES (and that a later call drives the live page, no route):
    const live = await r.snap(["--session", a, "--eval", "innerWidth", ...QUIET]);
    await expect(live).toExitWith(EXIT.clean);
    expect(evalValue(live.stdout)).toBe(412);
    expect(live.stdout).not.toContain("booting");
    // A later call may not re-emulate: the lifetime flag is refused by name, not silently overridden.
    const refused = await r.snap(["--session", b, "--viewport", "100x100", "--eval", "innerWidth", ...QUIET]);
    await expect(refused).toExitWith(EXIT.misuse);
    expect(refused.stdout).toContain("--viewport");
    expect(refused.stdout).toContain("boot call");
  } finally {
    await r.close([a, b]);
  }
});

test("T1 FENCE — the pre-substrate twin: two one-shots share nothing by construction (a fence, not a defect proof)", async ({ plantedTree, runCli }) => {
  const r = await rig(plantedTree, runCli);
  const narrow = await r.snap(["--file", r.fixture, "--viewport", "412x823", "--eval", "innerWidth", ...QUIET]);
  const wide = await r.snap(["--file", r.fixture, "--eval", "innerWidth", ...QUIET]);
  expect(evalValue(narrow.stdout)).toBe(412);
  expect(evalValue(wide.stdout)).toBe(1280);
});

// ── T2: a died session is LOUD ───────────────────────────────────────────────────────────────────────

test("T2 — a daemon killed MID-CALL: the call and the next exit 2 with SESSION DEAD naming the op; abandonedRuns names A not B; the sweep reaps A and leaves B measuring", async ({
  plantedTree,
  runCli,
  repoRoot,
}) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("t2a");
  const b = uniq("t2b");
  try {
    await expect(await r.snap(["--session", a, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    await expect(await r.snap(["--session", b, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    const rowA = rowOf(r.home, a);
    const rowB = rowOf(r.home, b);

    // A slow call is in flight when A's daemon dies.
    const inflight = r.snap(["--session", a, "--eval", SLOW_EVAL, ...QUIET]);
    expect(await until(() => rowOf(r.home, a).inflightOp !== null)).toBe(true);
    process.kill(rowA.daemonPid, "SIGKILL");
    expect(await until(() => !pidAlive(rowA.daemonPid))).toBe(true);
    const mid = await inflight;
    await expect(mid).toExitWith(EXIT.toolError);
    expect(mid.stdout).toContain("SESSION DEAD");
    expect(mid.stdout).toContain(`mid-\`--eval ${SLOW_EVAL}`);

    // The NEXT call is refused the same way, naming the sweep — never a silently-resolving pointer.
    const next = await r.snap(["--session", a, "--eval", "1", ...QUIET]);
    await expect(next).toExitWith(EXIT.toolError);
    expect(next.stdout).toContain("SESSION DEAD");
    expect(next.stdout).toContain("--session-sweep");

    // The marker IS the dead-session oracle: A's slot is abandoned (marker pid gone), B's is not.
    const abandoned = abandonedRuns(repoRoot, SESSION_INSTRUMENT).map((run) => run.dir);
    expect(abandoned).toContain(rowA.slotDir);
    expect(abandoned).not.toContain(rowB.slotDir);

    const sweep = await r.snap(["--session-sweep"]);
    await expect(sweep).toExitWith(EXIT.clean);
    expect(sweep.stdout).toContain(`${a}: DEAD — reaped`);
    expect(sweep.stdout).toContain(`${b}: live`);
    expect(abandonedRuns(repoRoot, SESSION_INSTRUMENT).map((run) => run.dir)).not.toContain(rowA.slotDir);
    expect(existsSync(join(r.home, `${a}.json`))).toBe(false);
    // B survived the sweep and still measures.
    const bAfter = await r.snap(["--session", b, "--eval", "innerWidth", ...QUIET]);
    await expect(bAfter).toExitWith(EXIT.clean);
    expect(evalValue(bAfter.stdout)).toBe(1280);
  } finally {
    await r.close([a, b]);
  }
});

// ── T3: per-call slots under concurrency ─────────────────────────────────────────────────────────────

test("T3 — two sessions publishing the SAME --out concurrently keep both PNGs in their own slots, and the pointer names a FINISHED run", async ({
  plantedTree,
  runCli,
  repoRoot,
}) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("t3a");
  const b = uniq("t3b");
  const out = uniq("t3-shot");
  const pointer = join(repoRoot, "reports", "snaps", `${out}.png`);
  try {
    await expect(await r.snap(["--session", a, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    await expect(await r.snap(["--session", b, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    const [ra, rb] = await Promise.all([
      r.snap(["--session", a, "--file", r.fixture, "--out", out]),
      r.snap(["--session", b, "--file", r.fixture, "--out", out]),
    ]);
    await expect(ra).toExitWith(EXIT.clean);
    await expect(rb).toExitWith(EXIT.clean);
    const slots = [ra, rb].map((res) => {
      const rel = /^run slot\s+(\S+)/mu.exec(res.stdout)?.[1];
      expect(rel, `each call names its run slot — got:\n${res.stdout}`).toBeDefined();
      return join(repoRoot, rel as string);
    });
    expect(new Set(slots).size).toBe(2);
    for (const slot of slots) {
      expect(existsSync(join(slot, "snaps", `${out}.png`)), `${slot} keeps its PNG`).toBe(true);
      expect(existsSync(join(slot, ".inflight")), `${slot} finished (no in-flight marker)`).toBe(false);
    }
    const target = readlinkSync(pointer);
    expect(target).toContain("runs/snap/");
    expect(slots.some((slot) => target.includes(slot.slice(slot.lastIndexOf("/") + 1)))).toBe(true);
  } finally {
    rmSync(pointer, { force: true });
    await r.close([a, b]);
  }
});

// ── T5: the TTL ──────────────────────────────────────────────────────────────────────────────────────

test("T5 — a tiny TTL reaps an idle daemon; a call inside the window resets it (the daemon survives past 2× the window)", async ({ plantedTree, runCli }) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("t5a");
  const b = uniq("t5b");
  try {
    // A: TTL 3 s, one call, then nothing — gone within a few seconds, row removed by its own shutdown.
    await expect(await r.snap(["--session", a, "--file", r.fixture, "--eval", "1", ...QUIET], envOf([[SESSION_TTL_KEY, "0.05"]]))).toExitWith(EXIT.clean);
    const pidA = rowOf(r.home, a).daemonPid;
    expect(pidAlive(pidA)).toBe(true);
    expect(await until(() => !pidAlive(pidA))).toBe(true);
    expect(await until(() => !existsSync(join(r.home, `${a}.json`))), "the reaped session's row must be removed by its own shutdown").toBe(true);

    // B: TTL 8 s. A call at ~4 s resets the clock; alive at ~4 s after THAT call (past the boot's window
    // end), then gone within one more TTL — the positive control that the reap is idleness, not age.
    await expect(await r.snap(["--session", b, "--file", r.fixture, "--eval", "1", ...QUIET], envOf([[SESSION_TTL_KEY, "0.1333"]]))).toExitWith(EXIT.clean);
    const pidB = rowOf(r.home, b).daemonPid;
    await sleep(4000);
    await expect(await r.snap(["--session", b, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    await sleep(5000);
    expect(pidAlive(pidB), "the mid-window call must have reset the TTL").toBe(true);
    expect(await until(() => !pidAlive(pidB))).toBe(true);
  } finally {
    await r.close([a, b]);
  }
});

test("T5 ACTIVE — a call longer than the TTL keeps its daemon, rearms only after settling, and close cannot rearm it", async ({ plantedTree, runCli }) => {
  // 9s, not the original 1.2s (#1744) — see ACTIVE_TTL_EVAL: the TTL has to outlast the harness's own
  // child-spawn gap, which an idle TTL may never be load-scaled to cover.
  const r = await rig(plantedTree, runCli, envOf([[SESSION_TTL_KEY, "0.15"]]));
  const a = uniq("t5-active");
  try {
    const long = await r.snap(["--session", a, "--file", r.fixture, "--eval", ACTIVE_TTL_EVAL, ...QUIET]);
    await expect(long).toExitWith(EXIT.clean);
    const booted = rowOf(r.home, a);
    expect(pidAlive(booted.daemonPid)).toBe(true);
    expect(rowOf(r.home, a).daemonPid).toBe(booted.daemonPid);

    const next = await r.snap(["--session", a, "--eval", "document.title", ...QUIET]);
    await expect(next).toExitWith(EXIT.clean);
    expect(next.stdout).toContain("fixture");
    expect(next.stdout).not.toContain("booting");

    const draining = r.snap(["--session", a, "--eval", IN_FLIGHT_EVAL, ...QUIET]);
    expect(await until(() => rowOf(r.home, a).inflightOp !== null)).toBe(true);
    const close = r.snap(["--session-close", a]);
    await expect(draining).resolves.toMatchObject({ code: EXIT.clean });
    await expect(close).resolves.toMatchObject({ code: EXIT.clean });
    expect(await until(() => !pidAlive(booted.daemonPid))).toBe(true);
    expect(existsSync(join(r.home, `${a}.json`))).toBe(false);
  } finally {
    await r.close([a]);
  }
});

// ── T6: the cap ──────────────────────────────────────────────────────────────────────────────────────

test("T6 — at the cap the next boot exits 2 naming the live sessions with idle ages; closing one admits it", async ({ plantedTree, runCli }) => {
  const r = await rig(plantedTree, runCli, envOf([[SESSION_CAP_KEY, "2"]]));
  const a = uniq("t6a");
  const b = uniq("t6b");
  const c = uniq("t6c");
  try {
    await expect(await r.snap(["--session", a, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    await expect(await r.snap(["--session", b, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    const refused = await r.snap(["--session", c, "--file", r.fixture, "--eval", "1", ...QUIET]);
    await expect(refused).toExitWith(EXIT.toolError);
    expect(refused.stdout).toContain("cap is 2");
    expect(refused.stdout).toContain(a);
    expect(refused.stdout).toContain(b);
    expect(refused.stdout).toContain("last used");
    expect(existsSync(join(r.home, `${c}.json`))).toBe(false);

    const closed = await r.snap(["--session-close", a]);
    await expect(closed).toExitWith(EXIT.clean);
    expect(closed.stdout).toContain(`closed ${a}`);
    const admitted = await r.snap(["--session", c, "--file", r.fixture, "--eval", "1", ...QUIET]);
    await expect(admitted).toExitWith(EXIT.clean);
    expect(admitted.stdout).toContain("booting");
  } finally {
    await r.close([a, b, c]);
  }
});

test("T6 RACE — two cold boots under cap one reserve exactly one daemon slot", async ({ plantedTree, runCli }) => {
  const r = await rig(plantedTree, runCli, envOf([[SESSION_CAP_KEY, "1"]]));
  const a = uniq("t6-race-a");
  const b = uniq("t6-race-b");
  try {
    const [left, right] = await Promise.all([
      r.snap(["--session", a, "--file", r.fixture, "--eval", "1", ...QUIET]),
      r.snap(["--session", b, "--file", r.fixture, "--eval", "1", ...QUIET]),
    ]);
    const results = [left, right];
    expect(results.filter((result) => result.code === EXIT.clean)).toHaveLength(1);
    expect(results.filter((result) => result.code === EXIT.toolError)).toHaveLength(1);
    expect([existsSync(join(r.home, `${a}.json`)), existsSync(join(r.home, `${b}.json`))].filter(Boolean)).toHaveLength(1);
  } finally {
    await r.close([a, b]);
  }
});

// ── T9: one implementation ───────────────────────────────────────────────────────────────────────────

test("T9 — the same argv one-shot vs through a session yields identical RESULT pairs except out; a planted contrast defect reds BOTH", async ({
  plantedTree,
  runCli,
}) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("t9a");
  const bad = uniq("t9bad");
  try {
    const argv = ["--file", r.fixture, "--eval", "1 + 1", "--text", ...QUIET];
    const oneShot = await r.snap(argv);
    const viaSession = await r.snap(["--session", a, ...argv]);
    await expect(oneShot).toExitWith(EXIT.clean);
    await expect(viaSession).toExitWith(EXIT.clean);
    // load/budget-factor (#1283, §7.1) are a reading of THIS PROCESS's box at THIS instant, not a fact
    // about the drive — excluded from the parity check for the same reason `out` is: two separate CLI
    // invocations legitimately disagree on it without the two paths having measured anything differently.
    const { out: _oneOut, load: _oneLoad, "budget-factor": _oneFactor, "rate-posture": _oneRatePosture, ...onePairs } = pairsOf(oneShot.stdout);
    const {
      out: _sessionOut,
      load: _sessionLoad,
      "budget-factor": _sessionFactor,
      "rate-posture": _sessionRatePosture,
      ...sessionPairs
    } = pairsOf(viaSession.stdout);
    expect(Object.keys(onePairs).length).toBeGreaterThan(10);
    expect(sessionPairs).toEqual(onePairs);

    // The planted control: the defect reds both ways, so identical pairs are not two paths that measured nothing.
    const contrast = ["--file", r.bad, "--contrast", "p", "--text", ...QUIET];
    const badOneShot = await r.snap(contrast);
    const badViaSession = await r.snap(["--session", bad, ...contrast]);
    await expect(badOneShot).toExitWith(EXIT.violations);
    await expect(badViaSession).toExitWith(EXIT.violations);
    expect(pairsOf(badOneShot.stdout)["contrast-fails"]).toBe("1");
    expect(pairsOf(badViaSession.stdout)["contrast-fails"]).toBe("1");
  } finally {
    await r.close([a, bad]);
  }
});

// ── one request at a time · F4 · status/export · attach ──────────────────────────────────────────────

test("a second caller mid-call is refused with SESSION BUSY naming the op; the first call still lands", async ({ plantedTree, runCli }) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("busy");
  try {
    await expect(await r.snap(["--session", a, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    const slow = r.snap(["--session", a, "--eval", SLOW_EVAL, ...QUIET]);
    expect(await until(() => rowOf(r.home, a).inflightOp !== null)).toBe(true);
    const second = await r.snap(["--session", a, "--eval", "2", ...QUIET]);
    await expect(second).toExitWith(EXIT.toolError);
    expect(second.stdout).toContain("SESSION BUSY");
    expect(second.stdout).toContain("--eval");
    const first = await slow;
    await expect(first).toExitWith(EXIT.clean);
    expect(first.stdout).toContain("slow-done");
  } finally {
    await r.close([a]);
  }
});

test("T17 — a wedged call is terminated at the session budget and the next call survives", async ({ plantedTree, runCli }) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("t17");
  try {
    await expect(await r.snap(["--session", a, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    const hung = await r.snap(["--session", a, "--eval", HANGING_EVAL, ...QUIET]);
    await expect(hung).toExitWith(EXIT.toolError);
    expect(hung.stdout).toContain("ORB-LOAD-KILL");
    expect(hung.stdout).toContain("session");
    expect(hung.stdout).toContain("--eval");
    const after = await r.snap(["--session", a, "--eval", "40 + 2", ...QUIET]);
    await expect(after).toExitWith(EXIT.clean);
    expect(evalValue(after.stdout)).toBe(42);
  } finally {
    await r.close([a]);
  }
});

test("F4 — a caller from ANOTHER checkout is refused naming the owner, pid and idle age; status and export answer the owner", async ({
  plantedTree,
  runCli,
  scratch,
  repoRoot,
}) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("f4");
  const foreign = join(scratch, "foreign-checkout");
  try {
    await expect(await r.snap(["--session", a, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    const row = rowOf(r.home, a);
    // A second git repo IS a second checkout to `repoRoot()` — the ownership check keys on it.
    mkdirSync(foreign, { recursive: true });
    execFixtureGit(foreign, ["init", "-q"]);
    const refused = await runCli("snap", ["--session", a, "--eval", "1", ...QUIET], { cwd: foreign, env: r.env, timeoutMs: CLI_BUDGET_MS });
    await expect(refused).toExitWith(EXIT.toolError);
    expect(refused.stdout).toContain("owned by ANOTHER checkout");
    expect(refused.stdout).toContain(String(row.daemonPid));
    expect(refused.stdout).toContain(`--session-close ${a} --force`);
    const foreignClose = await runCli("snap", ["--session-close", a], { cwd: foreign, env: r.env, timeoutMs: CLI_BUDGET_MS });
    await expect(foreignClose).toExitWith(EXIT.toolError);
    expect(pidAlive(row.daemonPid), "a refused close touches nothing").toBe(true);

    const status = await r.snap(["--session-status"]);
    await expect(status).toExitWith(EXIT.clean);
    expect(status.stdout).toContain(`${a}  LIVE`);
    expect(status.stdout).toContain("page 0  file://");
    expect(status.stdout).toContain("1 live");

    const exportBase = `${a}-custom-export`;
    const exported = await r.snap(["--session-export", a, "--out", exportBase]);
    await expect(exported).toExitWith(EXIT.clean);
    expect(exported.stdout).toContain("RESULT snap-session-export");
    expect(exported.stdout).toContain(`out=${exportBase}`);
    const consolePointer = join(repoRoot, "reports", "sessions", exportBase, "console.json");
    expect(readlinkSync(consolePointer)).toContain("runs/snap/");
    expect(JSON.parse(readFileSync(consolePointer, "utf8"))).toEqual([]);
    expect(existsSync(join(repoRoot, "reports", "sessions", exportBase, "session.har"))).toBe(true);
    expect(existsSync(join(repoRoot, "reports", "sessions", exportBase, "trace-000.zip"))).toBe(true);
    const exportIndexPath = /RESULT snap exit=\d+ index=(\S+)/u.exec(exported.stdout)?.[1];
    expect(exportIndexPath).toBeDefined();
    const exportIndex = JSON.parse(readFileSync(exportIndexPath as string, "utf8")) as {
      readonly artifacts?: readonly { readonly channel: string; readonly relativePath: string }[];
    };
    expect(exportIndex.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "har", relativePath: `sessions/${exportBase}/session.har` }),
        expect.objectContaining({ channel: "playwright-trace", relativePath: `sessions/${exportBase}/trace-000.zip` }),
      ]),
    );
    rmSync(join(repoRoot, "reports", "sessions", exportBase), { recursive: true, force: true });
  } finally {
    await r.close([a]);
  }
});

test("session evidence — enabled sessions retain and export a readable trace and HAR without closing the owner", async ({ plantedTree, runCli, repoRoot }) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("evidence");
  try {
    await expect(await r.snap(["--session", a, "--file", r.fixture, "--eval", "document.title", "--no-shot"])).toExitWith(EXIT.clean);
    const exported = await r.snap(["--session-export", a]);
    await expect(exported).toExitWith(EXIT.clean);
    expect(exported.stdout).toContain("files=10");
    const trace = join(repoRoot, "reports", "sessions", a, "trace-000.zip");
    const har = join(repoRoot, "reports", "sessions", a, "session.har");
    expect(readFileSync(trace).subarray(0, 2).toString("ascii")).toBe("PK");
    const parsed = JSON.parse(readFileSync(har, "utf8")) as { readonly log?: { readonly entries?: readonly unknown[] } };
    expect(parsed.log?.entries?.length).toBeGreaterThan(0);
    expect(existsSync(join(repoRoot, "reports", "sessions", a, "browser-retention.json"))).toBe(true);
    const row = rowOf(r.home, a);
    expect(existsSync(join(row.slotDir, "sessions", a, "trace-000.zip"))).toBe(true);
    expect(existsSync(join(row.slotDir, "sessions", a, "session.har"))).toBe(true);
    const after = await r.snap(["--session", a, "--eval", "document.title", "--no-shot"]);
    await expect(after).toExitWith(EXIT.clean);
    expect(after.stdout).toContain("fixture");
    rmSync(join(repoRoot, "reports", "sessions", a), { recursive: true, force: true });
  } finally {
    await r.close([a]);
  }
});

test("T8 — a --design-audit session call measures the session's DECLARED viewport, not the caller's default", async ({ plantedTree, runCli }) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("audit-viewport");
  try {
    // The promise #1321 made and the fold has to keep: the audit describes the environment the SESSION
    // was booted with. Before the fold this was a second CDP client attaching to the daemon's browser and
    // re-declaring the viewport; now the arm runs inside the daemon's own call, so the only way it can
    // measure 700x900 is if the daemon's page really is 700x900.
    await expect(await r.snap(["--session", a, "--viewport", "700x900", "--file", r.auditFixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    const audited = await r.snap(["--session", a, "--design-audit", ...QUIET]);
    expect(audited.stdout).toContain("viewport-actual=700x900");
    expect(audited.stdout).toContain("environment-fails=0");
    // A real verdict, not a refusal: the census denominator is non-zero and the population settled.
    expect(audited.stdout).toMatch(/census=[1-9]\d*/u);
    expect(audited.stdout).toContain("population-verdict=complete");
    await expect(audited).toExitWith(EXIT.clean);
  } finally {
    await r.close([a]);
  }
});

test("attach — attachProbeSession drives the owner's LIVE page over the session's endpoint and the owner survives the disconnect", async ({
  plantedTree,
  runCli,
}) => {
  const r = await rig(plantedTree, runCli);
  const a = uniq("attach");
  try {
    await expect(await r.snap(["--session", a, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    const row = rowOf(r.home, a);
    expect(row.cdpEndpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    const attached = await attachProbeSession(row.cdpEndpoint as string, {
      viewport: row.environment.viewport,
      device: row.environment.device,
      colorScheme: row.environment.colorScheme,
      reducedMotion: row.environment.reducedMotion,
      contrast: row.environment.contrast,
      reducedTransparency: row.environment.reducedTransparency,
    });
    try {
      expect(attached.contexts[0]?.owned).toBe(false);
      expect(await attached.page.evaluate("document.querySelector('main').textContent")).toBe("fixture");
      expect(await attached.page.evaluate("innerWidth")).toBe(1280);
    } finally {
      await closeProbeSession(attached);
    }
    // The owner's page is intact: the next session call drives it without booting or navigating.
    const after = await r.snap(["--session", a, "--eval", "document.querySelector('main').textContent", ...QUIET]);
    await expect(after).toExitWith(EXIT.clean);
    expect(after.stdout).toContain("fixture");
    expect(after.stdout).not.toContain("booting");
  } finally {
    await r.close([a]);
  }
});

// ── #2504: a daemon inside a marked run may not take the run down with it ───────────────────────────
// THE DEFECT, AT THE SEAM IT WAS REPORTED AT. `pnpm test:tooling` with `ORB_RUN_MARKER` set and its owner
// alive: `Killed`, exit 137, 11 files, NO summary. Unset, same tree, same command: 556 files and a
// published verdict. The killer was this suite's own daemons: reparented (so `selfAndAncestors` excludes
// nothing) and sweeping the marker they had INHERITED, which every sibling vitest worker and the top-level
// pnpm carried. This arm reproduces that exactly, with a marker of its own so the red costs one `sleep`
// instead of the battery, and it asserts BOTH directions in one run:
//   · the planted sibling — every worker's stand-in — must still be alive after the close, and
//   · the daemon's OWN browser must be gone, which is the arm that says the sweep still sweeps.
// The control between them is `markedPids(outer)`: the sibling and the browser are BOTH in range of the
// value the shutdown stopped using, so "nothing died" cannot be "nothing was there".
function chromiumPidsCarrying(marker: string): readonly number[] {
  return markedPids(marker).filter((pid) => {
    try {
      return /chrome|headless_shell/u.test(readFileSync(`/proc/${String(pid)}/cmdline`, "utf8"));
    } catch {
      // A pid that exits between the scan and the read is simply not counted: this is a census.
      return false;
    }
  });
}

test("T-scope — a daemon's shutdown reaps its own browser and leaves the RUN THAT CONTAINS IT standing (#2504)", async ({ plantedTree, runCli }) => {
  // FROZEN CLOCK (#1975): the minted-at segment is opaque — `MARKER_RE` matches it and nothing reads it —
  // so identity here is the pid plus the crypto nonce, never elapsed time.
  const outer = mintRunMarker(process.pid, FROZEN_AT_MS);
  const r = await rig(plantedTree, runCli, envOf([[RUN_MARKER_ENV, outer]]));
  const name = uniq("scope");
  // THE PLANTED VICTIM: a process carrying the outer marker exactly as a sibling vitest worker does.
  const sibling = spawn("sleep", ["120"], { env: inheritedProcessEnv(runMarkerEnv(outer)), detached: true, stdio: "ignore" });
  sibling.unref();
  const siblingPid = sibling.pid;
  expect(siblingPid, "the fixture, not the sweep, is broken if the planted sibling has no pid").toBeDefined();
  try {
    expect(await until(() => markedPids(outer).includes(siblingPid as number)), "the planted sibling must be IN RANGE of the outer marker").toBe(true);
    await expect(await r.snap(["--session", name, "--file", r.fixture, "--eval", "1", ...QUIET])).toExitWith(EXIT.clean);
    // #1848 IS PRESERVED: the daemon's browser carries the OUTER marker too, so that run's kill path still
    // reaches it. If this is zero the narrowing went too far and the orphan leak is back.
    expect(chromiumPidsCarrying(outer).length, "the session browser must still carry the outer run's marker").toBeGreaterThan(0);

    const close = await r.snap(["--session-close", name]);
    // The closing client carries the marker too — against the pre-fix daemon it is SIGKILLed mid-close.
    await expect(close).toExitWith(EXIT.clean);
    expect(pidAlive(siblingPid as number), "the daemon swept the run that contained it — this is the exit-137 battery kill").toBe(true);
    expect(await until(() => chromiumPidsCarrying(outer).length === 0), "the daemon's own browser must be gone — a scoped sweep still has to sweep").toBe(true);
  } finally {
    if (siblingPid !== undefined && pidAlive(siblingPid)) {
      process.kill(siblingPid, "SIGKILL");
    }
    await r.close([name]);
  }
});
