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
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { closeProbeSession, launchProbeSession } from "@orb/tooling/_shared/browser";
import type { RunMarkerDeps } from "@orb/tooling/_shared/run-marker";
import { currentRunMarker, markedPids, mintRunMarker, processRunMarker, sweepAbandonedRunMarkersNow } from "@orb/tooling/_shared/run-marker";
import { chromium } from "@playwright/test";
import { afterAll, vi } from "vitest";
import { leakChromiumArgs } from "../../support/chromium-processes.ts";
import { FROZEN_AT_MS } from "../../support/clock.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// A real Chromium launch under a contended parallel lane — the same ceiling browser.int.test.ts sets.
vi.setConfig({ testTimeout: scaledBudget(60_000), hookTimeout: scaledBudget(60_000) });

const LEAK_TEMP = mkdtempSync(join(tmpdir(), "orb-run-marker-leak-"));

afterAll(() => {
  rmSync(LEAK_TEMP, { recursive: true, force: true });
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

function markedBrowserPids(): readonly number[] {
  return markedPids(currentRunMarker()).filter((pid) => /chrome|headless_shell/u.test(cmdlineOf(pid)));
}

test("a browser this process launches carries the run marker, so the sweep can reach it", async () => {
  const before = markedBrowserPids();
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 320, height: 240 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  try {
    const during = markedBrowserPids();
    expect(
      during.length,
      "no marked chromium appeared — a browser launched without the marker is invisible to every sweep, which is exactly how a killed run strands one",
    ).toBeGreaterThan(before.length);
  } finally {
    await closeProbeSession(session);
  }
  // The control: the arm can distinguish present from absent, so the assertion above measured something.
  expect(markedBrowserPids().length, "a closed session leaves no marked browser behind").toBeLessThanOrEqual(before.length);
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

/** A sweep scoped to exactly the pids this test planted — never the whole box (`listPids`/`markerOf` are
 *  injected, per `RunMarkerDeps`, precisely so a probe never risks a sibling lane's live fleet). */
function scopedDeps(pids: readonly number[]): RunMarkerDeps {
  return {
    listPids: () => pids,
    markerOf: (pid) => processRunMarker(pid),
    parentOf: () => null,
    selfPid: -1,
    alive: aliveNow,
  };
}

test("an UNMARKED reparented-leak chromium is invisible to the abandoned sweep — the fixture's own hole (#1926)", async () => {
  const pid = await spawnLeakChromium("unmarked", null);
  try {
    expect(processRunMarker(pid), "an unmarked chromium must never appear to carry a marker").toBeNull();
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
  const deadOwnerMarker = mintRunMarker(999_999, FROZEN_AT_MS);
  const liveOwnerMarker = mintRunMarker(process.pid, FROZEN_AT_MS);
  const abandonedPid = await spawnLeakChromium("marked-abandoned", deadOwnerMarker);
  const liveOwnedPid = await spawnLeakChromium("marked-live", liveOwnerMarker);
  try {
    expect(processRunMarker(abandonedPid), "the fixed fixture must stamp the marker, or it is the same hole").toBe(deadOwnerMarker);
    expect(processRunMarker(liveOwnedPid)).toBe(liveOwnerMarker);

    const deps = scopedDeps([abandonedPid, liveOwnedPid]);
    sweepAbandonedRunMarkersNow(deps);

    // SIGKILL delivery is not synchronous with the syscall — poll rather than sample once, the same
    // shape browser.int.test.ts's own reparenting pin uses for exactly this race.
    await expect
      .poll(() => aliveNow(abandonedPid), { timeout: scaledBudget(5000) })
      .toBe(false /* a marked leak whose owner is gone must be reaped — this is the fix */);
    expect(aliveNow(liveOwnedPid), "a marked leak whose owner is ALIVE must never be touched — the fix must not widen the sweep").toBe(true);
  } finally {
    for (const pid of [abandonedPid, liveOwnedPid]) {
      if (aliveNow(pid)) {
        process.kill(pid, "SIGKILL");
      }
    }
  }
});
