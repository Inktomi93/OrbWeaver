// Drive/settle wall-clock budgets + the throttle rate — ceilings, not sleeps. Every CEILING is LOAD-SCALED
// at module load through the one policy (`@orb/tooling/_shared/load-budget`, #1232): the literal is the
// QUIET-BOX BASE. The settles and the throttle RATE are not clocks and are never scaled — and note that
// scaling a clock is the ONLY thing load may do to this instrument: its verdict is a measured RATE, which
// no budget can make honest, so the run WITHHOLDS instead (ops/run.ts's load gate).
import { budget } from "@orb/tooling/_shared/load-budget";

const STEP_BASE_MS = 5000;

export const STEP_TIMEOUT_MS = budget(STEP_BASE_MS);
