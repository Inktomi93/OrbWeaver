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
import { readFileSync } from "node:fs";
import { closeProbeSession, launchProbeSession } from "@orb/tooling/_shared/browser";
import { currentRunMarker, markedPids } from "@orb/tooling/_shared/run-marker";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// A real Chromium launch under a contended parallel lane — the same ceiling browser.int.test.ts sets.
vi.setConfig({ testTimeout: scaledBudget(60_000), hookTimeout: scaledBudget(60_000) });

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
