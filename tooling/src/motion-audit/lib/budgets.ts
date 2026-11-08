// Drive/settle wall-clock budgets + the throttle rate — ceilings, not sleeps. Every CEILING is LOAD-SCALED
// at module load through the one policy (`@orb/tooling/floor/host/load-budget`, #1232): the literal is the
// QUIET-BOX BASE. The settles and the throttle RATE are not clocks and are never scaled — and note that
// scaling a clock is the ONLY thing load may do to this instrument: its verdict is a measured RATE, which
// no budget can make honest, so the run WITHHOLDS instead (ops/run.ts's load gate).
import { budgets } from "@orb/tooling/floor/host/load-budget";

export const MOTION_CEILINGS_MS = budgets({ step: 5000 });
