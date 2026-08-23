// The isolated-stage flag family, spread into ops/flags.ts's one dispatch table. Split out when that
// table crossed the tooling line cap (docs/design/tooling-package.md §4.3) — one ops/ file per command
// family, and these seven flags are all about ONE subsystem: which source the stage serves
// (--isolated/--ref/--fresh/--dirty) and the three admin modes that print and exit
// (--stage-status/--stage-down/--stage-sweep, mutually exclusive — enforced in ops/parse.ts).

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// Narrower than ops/flags.ts's own handler type on purpose: no stage flag is page-targeted (`@N` is a
// per-tab concern and a stage is one process), so none of them takes the page index.
type StageFlagHandler = (args: Args, rest: string[]) => void;

/** Every source flag implies --isolated: naming a ref, forcing a rebuild or staging the working tree is
 *  meaningless against the live dev stack, and requiring both flags is a papercut with no upside. */
export const STAGE_FLAG_HANDLERS: Record<string, StageFlagHandler> = {
  "--isolated": (a) => {
    a.isolated = true;
  },
  "--ref": (a, rest) => {
    a.ref = rest.shift() ?? null;
    a.isolated = true;
  },
  "--fresh": (a) => {
    a.fresh = true;
    a.isolated = true;
  },
  "--dirty": (a) => {
    a.dirty = true;
    a.isolated = true;
  },
  "--stage-down": (a) => {
    a.stageDown = true;
  },
  "--stage-status": (a) => {
    a.stageStatus = true;
  },
  "--stage-sweep": (a) => {
    a.stageSweep = true;
  },
  "--force": (a) => {
    a.force = true;
  },
};
