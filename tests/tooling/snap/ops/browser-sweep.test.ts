// SNAP'S SHUTDOWN SWEEP IS SCOPED TO THE LEASE IT MINTED (#2504) — the door-level half of the fix whose
// mechanism is pinned in tests/tooling/_shared/run-marker.test.ts.
//
// THE DEFECT, MEASURED. `sweepOwnBrowsers()` took no argument and swept `currentRunMarker()`, which
// INHERITS: inside a marked run its subject was the OUTER run, not this daemon. A session daemon is spawned
// detached and outlives its launcher, so once reparented its ancestor chain is JUST ITSELF and
// `selfAndAncestors` excludes nothing — the sweep reached every sibling vitest worker and the top-level
// pnpm. `pnpm test:tooling` with `ORB_RUN_MARKER` set and its owner alive: `Killed`, exit 137, 11 files, no
// summary. The same command with the variable unset: 556 files and a published verdict. One variable.
//
// WHY A DOOR TEST AND NOT ONLY THE MECHANISM TEST: the bug was never in `sweepRunMarkerNow` — it was in
// WHICH VALUE this door handed it. A pin on the mechanism alone stays green while the door reads an ambient
// identity again, which is exactly how the drift survived #1848's own suite.

import type { RunMarkerDeps } from "@orb/tooling/_shared/run-marker";
import { markedPids, mintRunMarker } from "@orb/tooling/_shared/run-marker";
import { sweepOwnBrowsers } from "../../../../tooling/src/snap/ops/browser-sweep.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const OUTER = mintRunMarker(100, 1_700_000_000_000);
const LEASE = mintRunMarker(300, 1_700_000_000_001);
const BATTERY = [100, 101, 102] as const;
const DAEMON = 300;
const BROWSER = 301;

/** pnpm(100) → vitest(101) → a worker(102) all carry the OUTER marker, as every child of a marked run does.
 *  300 is the REPARENTED daemon (parent 1, so its ancestor chain excludes nothing) and 301 its browser;
 *  both carry the outer marker AND the daemon's lease, which is what the two-stamp launch door produces. */
function batteryUnderADaemon(): RunMarkerDeps & { readonly signalled: [number, NodeJS.Signals][] } {
  const identities = new Map<number, readonly string[]>([
    [100, [OUTER]],
    [101, [OUTER]],
    [102, [OUTER]],
    [DAEMON, [OUTER, LEASE]],
    [BROWSER, [OUTER, LEASE]],
  ]);
  const parents = new Map<number, number>([
    [100, 1],
    [101, 100],
    [102, 101],
    [DAEMON, 1],
    [BROWSER, 1],
  ]);
  const signalled: [number, NodeJS.Signals][] = [];
  return {
    signalled,
    selfPid: DAEMON,
    listPids: (): readonly number[] => [...identities.keys()],
    identitiesOf: (pid): readonly string[] => identities.get(pid) ?? [],
    parentOf: (pid): number | null => parents.get(pid) ?? null,
    alive: (pid): boolean => identities.has(pid),
    signal: (pid, signal): void => {
      signalled.push([pid, signal]);
    },
  };
}

test("a daemon's shutdown sweep signals its OWN browser and nothing else — with the wide sweep planted beside it (#2504)", () => {
  const deps = batteryUnderADaemon();
  // THE PLANTED CONTROL, in the same invocation: from this reparented daemon the INHERITED marker really
  // does name the whole battery. A narrowed sweep that reaps one pid proves nothing unless the value it
  // stopped using is shown to have reached the other four — this is the set that took exit 137.
  expect(markedPids(OUTER, deps), "the outer marker must still reach the battery, or this arm measures nothing").toEqual([...BATTERY, BROWSER]);

  const lines = sweepOwnBrowsers(LEASE, deps);
  expect(deps.signalled, "a shutdown may signal only what this daemon started").toEqual([[BROWSER, "SIGKILL"]]);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("swept 1 process(es)");
});

test("a clean shutdown reaps nothing and says nothing (#2504)", () => {
  // The silence half of the receipt contract: a daemon whose browser closed properly prints no line, so the
  // line an operator DOES see always means a real reap. Same tree, minus the escapee.
  const deps = batteryUnderADaemon();
  const closed: RunMarkerDeps = { ...deps, listPids: (): readonly number[] => [...BATTERY, DAEMON] };
  expect(sweepOwnBrowsers(LEASE, closed)).toEqual([]);
  expect(deps.signalled).toEqual([]);
});
