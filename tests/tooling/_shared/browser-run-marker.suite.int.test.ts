// SNAP'S BROWSER IS REACHABLE BY THE RUN SWEEP (#1848) — the launch-door half of "orphaned chromiums are
// not acceptable" (owner, 2026-09-06).
//
// THE DEFECT. `_shared/browser.ts` launches through `chromium.launch` / `launchPersistentContext`, and
// Playwright starts each browser in its OWN session: a normal exit closes it, the session daemon handles
// SIGTERM — and any other death (SIGKILL, a stage timeout, a lane's worktree torn down under it) leaves a
// Chromium that no process-group kill can find. 72 of them, some 40 h old, were alive on this box.
//
// THE PROOF IS THE MECHANISM ITSELF: launch a real browser, then ask `/proc` — through the very function
// the sweep uses — whether a NEW process carrying this run's marker appeared. Against the pre-#1848
// launcher no such process exists, because the browser inherited no marker; that is the red. Closing the
// session must then take it away again, which is the control that says the arm can tell the two apart.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { closeProbeSession, launchProbeSession } from "@orb/tooling/_shared/browser";
import type { RunMarkerDeps } from "@orb/tooling/_shared/run-marker";
import {
  beginRunLease,
  currentRunMarker,
  markedPids,
  mintRunMarker,
  processRunIdentities,
  runLeaseArg,
  runMarkerArg,
  sweepAbandonedRunMarkersNow,
} from "@orb/tooling/_shared/run-marker";
import { chromium } from "@playwright/test";
import { afterAll, vi } from "vitest";
import { leakChromiumArgs } from "../../support/chromium-processes.ts";
import { FROZEN_AT_MS } from "../../support/clock.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// A real Chromium launch under a contended parallel lane — the same ceiling browser.int.test.ts sets.
vi.setConfig({ testTimeout: scaledBudget(60_000), hookTimeout: scaledBudget(60_000) });

const LEAK_TEMP = mkdtempSync(join(tmpdir(), "orb-run-marker-leak-"));
/** A SIGKILLed chromium keeps flushing its profile for a beat after the signal returns, so a bare remove
 *  of its `--user-data-dir` races it and throws ENOTEMPTY (measured under the marked battery). `force`
 *  does not cover a concurrent WRITER; retries do. */
const LEAK_TEMP_REMOVE_RETRIES = 5;
const LEAK_TEMP_RETRY_MS = 200;

afterAll(() => {
  rmSync(LEAK_TEMP, { recursive: true, force: true, maxRetries: LEAK_TEMP_REMOVE_RETRIES, retryDelay: LEAK_TEMP_RETRY_MS });
});

/** A pid's argv, or "" when it left between the scan and the read. */
function cmdlineOf(pid: number): string {
  // A pid that exits mid-read answers "" and is then simply not counted as a browser: this is a census over
  // a moving population, not an operation on one process.
  try {
    return readFileSync(`/proc/${String(pid)}/cmdline`, "utf8").replaceAll("\0", " ");
  } catch {
    return "";
  }
}

/** THIS FILE'S OWN LEASE (#2504). A census keyed on the RUN MARKER counts EVERY concurrently-running
 *  suite's chromium the moment the battery runs under one — measured: this arm's before/after delta read
 *  the box rather than the launch door and failed on a sibling's live browser. The lease is the narrow
 *  identity that answers "mine", and its owner is this worker, which stays alive — so no sweep anywhere on
 *  the box may act on it. Frozen mint for the same reason the #1926 arm states: the segment is opaque. */
const FILE_LEASE = beginRunLease(process.pid, FROZEN_AT_MS);

function ownBrowserPids(): readonly number[] {
  return markedPids(FILE_LEASE).filter((pid) => /chrome|headless_shell/u.test(cmdlineOf(pid)));
}

test("a browser this process launches carries BOTH identities, so either sweep can reach it (#1848, #2504)", async () => {
  const before = ownBrowserPids();
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 320, height: 240 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  try {
    const during = ownBrowserPids();
    expect(
      during.length,
      "no marked chromium appeared — a browser launched without the marker is invisible to every sweep, which is exactly how a killed run strands one",
    ).toBeGreaterThan(before.length);
    const fresh = during.find((pid) => !before.includes(pid));
    expect(fresh, "the census named no NEW browser, so nothing below is about the launch under test").toBeDefined();
    // #1848's half, unchanged by the narrowing: the OUTER run's kill path still reaches this browser. If
    // this ever reads the lease alone, a killed run strands the browser again and the ruling is reopened.
    expect(processRunIdentities(fresh as number), "a browser must carry the run marker AND this launcher's lease").toEqual([currentRunMarker(), FILE_LEASE]);
  } finally {
    await closeProbeSession(session);
  }
  // The control: the arm can distinguish present from absent, so the assertion above measured something.
  expect(ownBrowserPids().length, "a closed session leaves no marked browser behind").toBeLessThanOrEqual(before.length);
});

// ── #1926: the reparented-leak FIXTURE's own hole, and the fix's must-not-widen control ────────────
// 11 four-day-old orphans (a full reparented chromium tree — root, two crashpad handlers, two zygotes, a
// gpu process, two utility processes, three renderers) were found alive on the box on 2026-09-11, all
// rooted at `browser.int.test.ts`'s "captured Chromium identities survive reparenting" fixture's
// `--user-data-dir=.../reparented-leak-profile`. That fixture deliberately launches a raw, UNMARKED,
// detached chromium (bypassing `_shared/browser.ts`'s launch doors entirely) and relies solely on its own
// `terminateChromiumIdentities` cleanup in a `finally` block — so if the test process that owns that
// `finally` is ever SIGKILLed, OOM-killed, or torn down with its worktree before reaching it, the browser
// is permanently unreapable: it carries the marker in NEITHER `run-marker.ts` channel, and no sweep, ever,
// asks "what is this process" — only "which dead run started it" (browser-sweep.ts's header). These two
// tests are the fixture-level pin: RED against the pre-fix (unmarked) shape, GREEN against the fixed one,
// and a control proving the fix never widens into reaping a LIVE owner's browser.
function aliveNow(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Launch a real, detached-but-not-reparented chromium (this test process stays its OS parent — reparenting
 *  itself is proven separately in browser.int.test.ts; what this pin needs is a real chromium root whose
 *  `/proc/<pid>/cmdline` the marker reader can be asked about) with the given leak args, and return its
 *  root pid. Killed unconditionally by the caller — a sweep that (correctly) never reaches an unmarked one
 *  cannot be relied on for cleanup. */
async function spawnLeakChromium(name: string, marker: string | null): Promise<number> {
  const dir = join(LEAK_TEMP, name);
  const child = spawn(chromium.executablePath(), [...leakChromiumArgs(dir, marker)], { detached: true, stdio: "ignore" });
  child.unref();
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("leak chromium did not report a pid");
  }
  // Let execve settle so /proc/<pid>/cmdline reflects the launched argv before it is read.
  await new Promise((resolve) => setTimeout(resolve, scaledBudget(300)));
  return pid;
}

/** A LIVE OWNER for a planted identity, and the reason both plants below need one: an identity whose owner
 *  pid is ALREADY gone is fair game for every abandoned sweep running anywhere on this box, so a
 *  concurrently-scheduled suite's stage teardown (`sweepStrandedBrowsers`, `--stage-sweep`, the CT runner's
 *  acquire) correctly reaps the plant in the window between spawn and read — which is how the arm below
 *  failed under the full battery with `expected null to be '999999-…'` while passing alone. Owning the
 *  identity with a real process closes that window: the plant is off-limits until {@link retireOwner}. */
function plantOwner(): ReturnType<typeof spawn> {
  const owner = spawn("sleep", ["120"], { detached: true, stdio: "ignore" });
  owner.unref();
  expect(owner.pid, "the fixture, not the sweep, is broken if the planted owner has no pid").toBeDefined();
  return owner;
}

/** Make the planted identity abandoned, for real. Awaiting `exit` rather than polling `kill(pid, 0)`: a
 *  SIGKILLed child stays a ZOMBIE — and answers "alive" — until its parent reaps it, and that is us. */
async function retireOwner(owner: ReturnType<typeof spawn>): Promise<void> {
  owner.kill("SIGKILL");
  await once(owner, "exit");
  expect(aliveNow(owner.pid as number), "the planted owner must really be gone before a sweep is asked").toBe(false);
}

/** A sweep scoped to exactly the pids this test planted — never the whole box (`listPids`/`identitiesOf` are
 *  injected, per `RunMarkerDeps`, precisely so a probe never risks a sibling lane's live fleet). */
function scopedDeps(pids: readonly number[]): RunMarkerDeps {
  return {
    listPids: () => pids,
    identitiesOf: (pid: number) => processRunIdentities(pid),
    parentOf: () => null,
    selfPid: -1,
    alive: aliveNow,
  };
}

test("an UNMARKED reparented-leak chromium is invisible to the abandoned sweep — the fixture's own hole (#1926)", async () => {
  const pid = await spawnLeakChromium("unmarked", null);
  try {
    expect(processRunIdentities(pid), "an unmarked chromium must never appear to carry an identity").toEqual([]);
    // Even with its (nonexistent) "owner" already gone, a sweep that only ever asks about a MARKER
    // finds nothing to reap here — proving this shape has no path back to life. This is the defect: the
    // fixture leaves such a process behind with NO recovery mechanism if its own cleanup fails.
    sweepAbandonedRunMarkersNow(scopedDeps([pid]));
    expect(aliveNow(pid), "the unmarked leak survives the abandoned sweep — nothing can ever reap it").toBe(true);
  } finally {
    if (aliveNow(pid)) {
      process.kill(pid, "SIGKILL");
    }
  }
});

test("a MARKED reparented-leak chromium is reaped once its owner is gone, and left alone while its owner is alive (#1926)", async () => {
  // THE FROZEN CLOCK, NOT A WAIVER (#1975). `mintRunMarker`'s second argument is an OPAQUE segment of the
  // marker string: `MARKER_RE` (tooling/src/_shared/run-marker.ts:48) matches it as `[1-9]\d*` and nothing
  // ever reads the value — `runMarkerOwnerPid` reads only the pid, and the sweep decides on pid plus
  // liveness. What separates these two markers is the PID and the crypto nonce, so the subject here is
  // identity, never elapsed time, and a `test-determinism` waiver would have recorded a false reason.
  const owner = plantOwner();
  const retiringOwnerMarker = mintRunMarker(owner.pid as number, FROZEN_AT_MS);
  const liveOwnerMarker = mintRunMarker(process.pid, FROZEN_AT_MS);
  const abandonedPid = await spawnLeakChromium("marked-abandoned", retiringOwnerMarker);
  const liveOwnedPid = await spawnLeakChromium("marked-live", liveOwnerMarker);
  try {
    expect(processRunIdentities(abandonedPid), "the fixed fixture must stamp the marker, or it is the same hole").toEqual([retiringOwnerMarker]);
    expect(processRunIdentities(liveOwnedPid)).toEqual([liveOwnerMarker]);
    await retireOwner(owner);

    const deps = scopedDeps([abandonedPid, liveOwnedPid]);
    sweepAbandonedRunMarkersNow(deps);

    // SIGKILL delivery is not synchronous with the syscall — poll rather than sample once, the same
    // shape browser.int.test.ts's own reparenting pin uses for exactly this race.
    await expect
      .poll(() => aliveNow(abandonedPid), { timeout: scaledBudget(5000) })
      .toBe(false /* a marked leak whose owner is gone must be reaped — this is the fix */);
    expect(aliveNow(liveOwnedPid), "a marked leak whose owner is ALIVE must never be touched — the fix must not widen the sweep").toBe(true);
  } finally {
    if (owner.pid !== undefined && aliveNow(owner.pid)) {
      process.kill(owner.pid, "SIGKILL");
    }
    for (const pid of [abandonedPid, liveOwnedPid]) {
      if (aliveNow(pid)) {
        process.kill(pid, "SIGKILL");
      }
    }
  }
});

// ── #2504: the LEASE channel, against a REAL chromium ──────────────────────────────────────────────
// "Orphaned chromiums are not acceptable" was closed by a sweep keyed on the OUTER run marker, so narrowing
// a teardown's subject to its own lease could only have reopened it. It did not, and this arm is why: a
// lease is a COMPLETE identity on its own, so a browser whose LEASE OWNER is gone is reaped even while the
// run containing it is alive and still legitimately holds the marker — a window that previously stayed open
// for the whole outer run. Both directions are planted, against a real chromium's real /proc.
async function spawnLeasedChromium(name: string, marker: string, lease: string): Promise<number> {
  const dir = join(LEAK_TEMP, name);
  const args = ["--headless", "--no-sandbox", "--disable-gpu", `--user-data-dir=${dir}`, runMarkerArg(marker), runLeaseArg(lease), "about:blank"];
  const child = spawn(chromium.executablePath(), args, { detached: true, stdio: "ignore" });
  child.unref();
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("leased leak chromium did not report a pid");
  }
  // Let execve settle so /proc/<pid>/cmdline reflects the launched argv before it is read.
  await new Promise((resolve) => setTimeout(resolve, scaledBudget(300)));
  return pid;
}

test("a chromium whose LEASE owner is gone is reaped even while its outer run lives — and one with a live lease is not (#2504)", async () => {
  // FROZEN CLOCK, same reason the arm above states: the minted-at segment is opaque and nothing reads it.
  const liveOuter = mintRunMarker(process.pid, FROZEN_AT_MS);
  const liveLease = mintRunMarker(process.pid, FROZEN_AT_MS);
  const owner = plantOwner();
  const ownedLease = mintRunMarker(owner.pid as number, FROZEN_AT_MS);
  const abandoned = await spawnLeasedChromium("lease-abandoned", liveOuter, ownedLease);
  const held = await spawnLeasedChromium("lease-held", liveOuter, liveLease);
  try {
    // Both switches arrive through the ARGV channel, because a chromium erases its own environ.
    expect(processRunIdentities(abandoned), "a leased chromium must answer with BOTH identities").toEqual([liveOuter, ownedLease]);
    expect(processRunIdentities(held)).toEqual([liveOuter, liveLease]);

    // NOW the lease is abandoned, and only now.
    await retireOwner(owner);

    const deps = scopedDeps([abandoned, held]);
    sweepAbandonedRunMarkersNow(deps);

    await expect
      .poll(() => aliveNow(abandoned), { timeout: scaledBudget(5000) })
      .toBe(false /* the lease's owner is gone, so nothing is waiting on this browser — the ruling, earlier */);
    expect(aliveNow(held), "a browser whose lease owner is ALIVE must never be touched — the narrowing must not widen").toBe(true);
  } finally {
    if (owner.pid !== undefined && aliveNow(owner.pid)) {
      process.kill(owner.pid, "SIGKILL");
    }
    for (const pid of [abandoned, held]) {
      if (aliveNow(pid)) {
        process.kill(pid, "SIGKILL");
      }
    }
  }
});
