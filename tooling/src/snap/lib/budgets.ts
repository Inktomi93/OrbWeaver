// The drive/settle wall-clock budgets — ceilings, not sleeps (a warm surface returns fast).
export const NAV_TIMEOUT_MS = 15_000;
export const WAIT_SELECTOR_TIMEOUT_MS = 10_000;
// A STAGE (`--isolated`/`--dirty`) is a vite dev server that may be transforming the module graph on demand:
// a freshly-booted one legitimately needs far longer than the shared dev stack's budget for its FIRST
// navigation (measured 2026-08-09: every cold stage blew the 15s goto). These are ceilings, not sleeps — a
// warm stage returns just as fast — so the wide budget costs nothing and buys a first call that isn't a lie.
export const STAGE_NAV_TIMEOUT_MS = 90_000;
export const STAGE_READY_TIMEOUT_MS = 60_000;
// A LOAD-EMULATION ARM (`--cpu-throttle` / `--network`) MOVES THE WALL CLOCK IT IS MEASURED AGAINST
// (#836). The whole point of `--network slow-4g` is that bytes arrive at 180 KB/s behind 562ms of added
// latency; holding that run to the un-throttled 10s readiness budget makes the flag structurally
// unusable — measured: every `--mobile --network slow-4g --cpu-throttle 4` run on `/` came back
// `app never signalled data-app-ready` on BOTH the dev and the prod build, which reads as an app defect
// and is really the instrument refusing its own arm. These are ceilings, not sleeps: an un-throttled run
// never reaches them, and a throttled one that still misses them is a real finding.
export const THROTTLED_NAV_TIMEOUT_MS = 90_000;
export const THROTTLED_READY_TIMEOUT_MS = 60_000;
export const STEP_TIMEOUT_MS = 5000;
// Let transitions/queries settle between steps (drawer slides, panel drops).
export const STEP_SETTLE_MS = 400;
// After a --press hover: give group-hover reveals a beat before the forced click.
export const HOVER_REVEAL_MS = 150;
export const NETWORKIDLE_TIMEOUT_MS = 10_000;
// Default post-nav settle so onMount queries have a chance to fire.
export const MOUNT_SETTLE_MS = 500;
