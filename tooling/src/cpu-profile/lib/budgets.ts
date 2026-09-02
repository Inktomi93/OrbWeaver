// Drive/settle wall-clock budgets — ceilings, not sleeps. The two CEILINGS are LOAD-SCALED at module load
// through the one policy (`@orb/tooling/_shared/load-budget`, #1232): the literal is the QUIET-BOX BASE.
// The settles/pauses are sleeps the run always pays and are never scaled (a settle is not a budget).
import { budget } from "@orb/tooling/_shared/load-budget";

const STEP_BASE_MS = 5000;
const NAV_BASE_MS = 20_000;

export const DEFAULT_STEP_SETTLE_MS = 600;
export const TRAILING_SETTLE_MS = 800;
export const WHEEL_TICK_PAUSE_MS = 30;
export const STEP_TIMEOUT_MS = budget(STEP_BASE_MS);
export const NAV_TIMEOUT_MS = budget(NAV_BASE_MS);
