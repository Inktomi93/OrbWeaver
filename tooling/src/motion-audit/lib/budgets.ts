// Drive/settle wall-clock budgets + the throttle rate — ceilings, not sleeps. Every CEILING is LOAD-SCALED
// at module load through the one policy (`@orb/tooling/_shared/load-budget`, #1232): the literal is the
// QUIET-BOX BASE. The settles and the throttle RATE are not clocks and are never scaled — and note that
// scaling a clock is the ONLY thing load may do to this instrument: its verdict is a measured RATE, which
// no budget can make honest, so the run WITHHOLDS instead (ops/run.ts's load gate).
import { budget } from "@orb/tooling/_shared/load-budget";

const NAV_BASE_MS = 20_000;
const READY_BASE_MS = 10_000;
const STEP_BASE_MS = 5000;

export const NAV_TIMEOUT_MS = budget(NAV_BASE_MS);
export const READY_TIMEOUT_MS = budget(READY_BASE_MS);
export const STEP_TIMEOUT_MS = budget(STEP_BASE_MS);
export const MOUNT_SETTLE_MS = 500;
// Per reach action: enough for the store write + the view transition the next action targets.
export const REACH_SETTLE_MS = 500;
// 4× CPU throttle so a frame budget is real — a dev machine's headroom masks jank that a user's phone won't.
export const CPU_THROTTLE_RATE = 4;
