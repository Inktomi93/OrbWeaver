// SNAP'S ONE BROWSER SWEEP ENTRY (#1848) — every path that ends a snap workload comes through here, so a
// Chromium can never outlive the run that launched it.
//
// THE DEFECT. `_shared/browser.ts` launches through `chromium.launch` / `launchPersistentContext`, and
// Playwright gives each browser its OWN session: a normal exit closes it (`closeProbeSession`) and the
// session daemon handles SIGTERM, but a snap killed any other way — SIGKILL, a stage timeout, a lane's
// worktree torn down under it — leaves the browser running with nothing pointing at it. That is the same
// leak the CT runner had, and it is how 72 `chrome-headless-shell` processes (some 40 h old) were alive on
// this box on 2026-09-06. The owner's ruling: "orphaned chromiums are not acceptable."
//
// WHAT IT MAY KILL, AND WHY THAT IS SAFE. Only a process whose `/proc/<pid>/environ` carries a RUN MARKER
// whose OWNER PID IS GONE (`_shared/run-marker.ts`). A live sibling lane's fleet has a live owner and is
// never touched; a process this run started is reaped by its own exit path. Killing "every
// chrome-headless" by name is precisely the harm this closes, so the sweep never asks what a process IS —
// only which dead run started it.
//
// SYNCHRONOUS ON PURPOSE. Its three callers are teardown paths that cannot await one: snap's stage
// teardown (`ops/stage-teardown.ts`, which the idle keeper, `--stage-down` and the boot-dead arm all run
// through), `--stage-sweep`, and the session daemon's shutdown. The processes it reaches have already
// outlived everything that could be waiting on them, so a TERM grace would buy nothing.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { RunMarkerDeps } from "../../_shared/run-marker.ts";
import { describeRunMarkerSweep, sweepAbandonedRunMarkersNow, sweepRunMarkerNow } from "../../_shared/run-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Reap every browser (and any other child) left behind by a snap run that is GONE. Returns one line per
 *  reaped run for the caller's transcript, or `[]` when the box is clean — which is the ordinary case and
 *  must stay silent, so the line an operator DOES see means something. */
export function sweepStrandedBrowsers(deps: RunMarkerDeps = {}): readonly string[] {
  return sweepAbandonedRunMarkersNow(deps)
    .map((sweep) => describeRunMarkerSweep(sweep))
    .filter((line): line is string => line !== null);
}

/** The daemon's own half: at ITS shutdown, anything still carrying the LEASE THIS DAEMON MINTED outlived the
 *  browser close that was supposed to end it. Reported the same way — silence when there was nothing.
 *
 *  THE LEASE IS A REQUIRED ARGUMENT, AND THAT IS THE FIX (#2504). This door used to sweep
 *  `currentRunMarker()`, which INHERITS — so inside a marked run its subject was the OUTER run, and a
 *  session daemon (reparented, therefore with an ancestor chain too short to exclude anything) SIGKILLed the
 *  battery that contained it: `tests:tooling` under a marker died at 11 files with exit 137 and no summary,
 *  and the same command unmarked published 556 files. Nothing here may read an ambient identity: the caller
 *  passes the value it minted with `beginRunLease`, and the OUTER run's marker stays the outer run's to
 *  sweep. The browser still carries BOTH stamps, so the outer run's own kill path loses nothing. */
export function sweepOwnBrowsers(lease: string, deps: RunMarkerDeps = {}): readonly string[] {
  const line = describeRunMarkerSweep(sweepRunMarkerNow(lease, deps));
  return line === null ? [] : [line];
}
