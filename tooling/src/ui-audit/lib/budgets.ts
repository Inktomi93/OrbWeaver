// The drive/settle wall-clock budgets — ceilings, not sleeps (a warm surface returns fast). Every CEILING
// is LOAD-SCALED at module load through the one policy (`@orb/tooling/_shared/load-budget`, #1232): the
// literal is the QUIET-BOX BASE and a contended box stretches it, so the CLI int suites stop exiting 2 on
// synthetic pages purely because five lanes were live (#1222). The observation WINDOW below is not a
// ceiling and is not scaled — see its own note.
import { budget } from "@orb/tooling/_shared/load-budget";

const NAV_BASE_MS = 15_000;
const WAIT_SELECTOR_BASE_MS = 10_000;
const CLICK_BASE_MS = 5000;
const CENSUS_OBSERVE_CEILING_BASE_MS = 5000;

export const NAV_TIMEOUT_MS = budget(NAV_BASE_MS);
export const WAIT_SELECTOR_TIMEOUT_MS = budget(WAIT_SELECTOR_BASE_MS);
export const CLICK_TIMEOUT_MS = budget(CLICK_BASE_MS);

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
 *  called a page settled at ~900ms that filled at 1500ms. NOT load-scaled: this is a floor the run always
 *  pays, not a ceiling — a settle is not a budget (#1232 §7.1). */
export const CENSUS_OBSERVE_MIN_MS = 2000;
/** The ceiling for a page that keeps CHANGING past the floor — a run still moving here is refused. Scaled,
 *  because it IS a ceiling: on a contended box a page legitimately keeps moving longer, and refusing it at
 *  the quiet-box number is a finding about the box. */
export const CENSUS_OBSERVE_CEILING_MS = budget(CENSUS_OBSERVE_CEILING_BASE_MS);
