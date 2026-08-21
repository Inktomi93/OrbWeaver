// Drive/settle wall-clock budgets + the throttle rate — ceilings, not sleeps.
export const NAV_TIMEOUT_MS = 20_000;
export const READY_TIMEOUT_MS = 10_000;
export const STEP_TIMEOUT_MS = 5000;
export const MOUNT_SETTLE_MS = 500;
// Per reach action: enough for the store write + the view transition the next action targets.
export const REACH_SETTLE_MS = 500;
// 4× CPU throttle so a frame budget is real — a dev machine's headroom masks jank that a user's phone won't.
export const CPU_THROTTLE_RATE = 4;
