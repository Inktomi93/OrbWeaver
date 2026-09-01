// The drive/settle wall-clock budgets — ceilings, not sleeps (a warm surface returns fast).
export const NAV_TIMEOUT_MS = 15_000;
export const WAIT_SELECTOR_TIMEOUT_MS = 10_000;
export const CLICK_TIMEOUT_MS = 5000;

// ── the CENSUS-STABILITY window (#808) ──────────────────────────────────────
// `data-app-ready` is a ONE-SHOT BOOT signal (packages/client/src/lib/app-ready-signal.ts resolves a
// single Promise), so it says nothing about a surface reached by a
// post-boot navigation or an `--actions` click: the flag is already up while the new route's reads are
// still in flight. The walk therefore has no signal telling it the surface is finished — it has to be
// MEASURED, by watching whether the page keeps growing after the census was taken.
/** How often the in-page pre-walk population/revision state is re-read. */
export const CENSUS_SETTLE_POLL_MS = 250;
/** The MINIMUM observation window, paid on every run. It is a floor rather than "stop at the first two
 *  equal readings" because a shell is PERFECTLY STABLE while its reads are in flight — the quiet before
 *  the content is exactly the state being hunted, so stopping at the first quiet reads the lie as proof.
 *  Measured against the fixture in tests/tooling/ui-audit/cli.int.test.ts: a 400ms two-equal-readings rule
 *  called a page settled at ~900ms that filled at 1500ms. */
export const CENSUS_OBSERVE_MIN_MS = 2000;
/** The ceiling for a page that keeps CHANGING past the floor — a run still moving here is refused. */
export const CENSUS_OBSERVE_CEILING_MS = 5000;
