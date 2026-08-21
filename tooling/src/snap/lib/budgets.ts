// The drive/settle wall-clock budgets — ceilings, not sleeps (a warm surface returns fast).
export const NAV_TIMEOUT_MS = 15_000;
export const WAIT_SELECTOR_TIMEOUT_MS = 10_000;
// A STAGE (`--isolated`/`--dirty`) is a vite dev server that may be transforming the module graph on demand:
// a freshly-booted one legitimately needs far longer than the shared dev stack's budget for its FIRST
// navigation (measured 2026-08-09: every cold stage blew the 15s goto). These are ceilings, not sleeps — a
// warm stage returns just as fast — so the wide budget costs nothing and buys a first call that isn't a lie.
export const STAGE_NAV_TIMEOUT_MS = 90_000;
export const STAGE_READY_TIMEOUT_MS = 60_000;
export const STEP_TIMEOUT_MS = 5000;
// Let transitions/queries settle between steps (drawer slides, panel drops).
export const STEP_SETTLE_MS = 400;
// After a --press hover: give group-hover reveals a beat before the forced click.
export const HOVER_REVEAL_MS = 150;
export const NETWORKIDLE_TIMEOUT_MS = 10_000;
// Default post-nav settle so onMount queries have a chance to fire.
export const MOUNT_SETTLE_MS = 500;
