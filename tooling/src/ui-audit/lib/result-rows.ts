/** The RESULT-line row formatters `ops/run.ts` prints — pure shapes over the run's inputs, homed here so the
 *  runner stays under the tooling-size cap (Core-Tooling-Law §4.3): surface-state DECLARE + ACCOUNT rows
 *  (#148 item 2, the drive axis #1059) and the reach rows (#653/#797). */

import type { CensusReachInput } from "../contract/samples.ts";
import type { RelationalCensusAccountingInput } from "../contract/samples-populations.ts";
import type { DriveStateCandidate, SurfaceStateAccounting } from "../contract/surface-state.ts";
import type { ShellStateSnapshot } from "../contract/types.ts";
import { surfaceStateAxisLabel } from "./surface-state.ts";

/** THE PANEL-AXIS DECLARE + ACCOUNT rows (#148 item 2): the shell config `__orb.shell()` read for THIS
 *  run, and — same law as `tap-*`'s own candidates/judged/withheld/populations rows below — an axis
 *  label for every configuration this run did NOT visit, named rather than folded into a clean-looking
 *  silence. `NO-VERDICT` mirrors `population-verdict`'s own hyphenated single-token spelling.
 *
 *  ONLY `withheld` IS `NO-VERDICT` (#1122). EXCLUDED is a REACHED verdict — "measured facts prove the
 *  space inapplicable" — and printing it as NO-VERDICT was the polarity that put three unclosable
 *  `NO-VERDICT` axes beside `population-verdict=complete` on every Home run. It is not folded into
 *  `complete` either: `complete` claims this run REACHED every configuration in the space, and on an
 *  excluded axis it reached none because none exist. Three labels, three different facts. */
export function surfaceStateRows(shellState: ShellStateSnapshot | null, accounting: SurfaceStateAccounting, drive: DriveStateCandidate): [string, string][] {
  const axisVerdict = (census: RelationalCensusAccountingInput): string => {
    const label = surfaceStateAxisLabel(census);
    return label === "withheld" ? "NO-VERDICT" : label;
  };
  const focusLabel = shellState === null ? "unmounted" : shellFocusOnOff(shellState.focus);
  return [
    ["section", shellState?.section ?? "unmounted"],
    ["panel-list-mode", shellState?.panels.find((p) => p.side === "list")?.mode ?? "unmounted"],
    ["panel-list-axis", axisVerdict(accounting.panelList)],
    ["panel-context-mode", shellState?.panels.find((p) => p.side === "context")?.mode ?? "unmounted"],
    ["panel-context-axis", axisVerdict(accounting.panelContext)],
    ["focus-state", focusLabel],
    ["focus-axis", axisVerdict(accounting.focus)],
    // THE DRIVE AXIS (#1059): which REGIME this run measured. A driven population and a rest population
    // are not comparable, so the machine line states it rather than leaving it to be inferred from
    // `actions=` — contract/surface-state.ts carries the why.
    ["drive-state", drive],
    ["drive-axis", axisVerdict(accounting.drive)],
  ];
}

function shellFocusOnOff(focus: boolean): "on" | "off" {
  return focus ? "on" : "off";
}

/** The reach rows of the RESULT line. `-1` is the absent-counters arm (a pinned pre-#653 sample set) —
 *  a refusal to state, never a zero that reads as "nothing was skipped". */
export function reachRows(reach: CensusReachInput | undefined): [string, number | string][] {
  if (reach === undefined) {
    return [
      ["reached", -1],
      ["skipped-offviewport", -1],
      ["no-probe-frame", -1],
      ["reveal-budget", "unreported"],
    ];
  }
  return [
    ["reached", reach.onScreen + reach.revealed],
    ["skipped-offviewport", reach.skippedOffViewport],
    // #797: measured-but-unframed is its OWN number. Folding it into `reached` would say a control was
    // judged when its target size was refused, which is the shape of every false clean this file guards.
    ["no-probe-frame", reach.frameTruncated],
    ["reveal-budget", reach.budgetExhausted ? "EXHAUSTED" : "ok"],
  ];
}
