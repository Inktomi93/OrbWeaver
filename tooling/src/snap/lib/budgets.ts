// The drive/settle wall-clock budgets — ceilings, not sleeps (a warm surface returns fast).
//
// Every CEILING here is `budget(<X>_BASE_MS)` (#1266, closing #1232's last four census rows): the literal
// is the QUIET-BOX value, and the one load policy (_shared/load-budget.ts) stretches it by the box's
// per-core contention. A quiet run is byte-identical to the old fixed number (factor 1); only a saturated
// one moves. The bases were NOT re-tuned in that conversion — a ceiling here is a VERDICT input (a step
// that overruns is a real finding), so widening one to be safe would weaken the finding it exists to make.
// That is the opposite trade from a leak guard, where generosity costs only a lingering handle.
//
// The `*_SETTLE_MS` / `*_REVEAL_MS` values below are deliberately NOT budgets and not scaled: they are
// SLEEPS the run always pays in full, so stretching them under load would spend real time to buy nothing.
import process from "node:process";
import { budget } from "../../_shared/load-budget.ts";

// The BASE consts are exported (not just their derived ceilings) so a load-scaling pin can drive the
// SAME numbers this module actually uses through an injected reader (T14/T15)
// instead of re-declaring them and risking drift.
export const NAV_BASE_MS = 15_000;
export const NAV_TIMEOUT_MS = budget(NAV_BASE_MS);
export const WAIT_SELECTOR_BASE_MS = 10_000;
export const WAIT_SELECTOR_TIMEOUT_MS = budget(WAIT_SELECTOR_BASE_MS);
// A STAGE (`--isolated`/`--dirty`) is a vite dev server that may be transforming the module graph on demand:
// a freshly-booted one legitimately needs far longer than the shared dev stack's budget for its FIRST
// navigation (measured 2026-08-09: every cold stage blew the 15s goto). These are ceilings, not sleeps — a
// warm stage returns just as fast — so the wide budget costs nothing and buys a first call that isn't a lie.
export const STAGE_NAV_BASE_MS = 90_000;
export const STAGE_NAV_TIMEOUT_MS = budget(STAGE_NAV_BASE_MS);
export const STAGE_READY_BASE_MS = 60_000;
export const STAGE_READY_TIMEOUT_MS = budget(STAGE_READY_BASE_MS);
// A LOAD-EMULATION ARM (`--cpu-throttle` / `--network`) MOVES THE WALL CLOCK IT IS MEASURED AGAINST
// (#836). The whole point of `--network slow-4g` is that bytes arrive at 180 KB/s behind 562ms of added
// latency; holding that run to the un-throttled 10s readiness budget makes the flag structurally
// unusable — measured: every `--mobile --network slow-4g --cpu-throttle 4` run on `/` came back
// `app never signalled data-app-ready` on BOTH the dev and the prod build, which reads as an app defect
// and is really the instrument refusing its own arm. These are ceilings, not sleeps: an un-throttled run
// never reaches them, and a throttled one that still misses them is a real finding.
export const THROTTLED_NAV_BASE_MS = 90_000;
export const THROTTLED_NAV_TIMEOUT_MS = budget(THROTTLED_NAV_BASE_MS);
export const THROTTLED_READY_BASE_MS = 60_000;
export const THROTTLED_READY_TIMEOUT_MS = budget(THROTTLED_READY_BASE_MS);
export const STEP_BASE_MS = 5000;
export const STEP_TIMEOUT_MS = budget(STEP_BASE_MS);
// Let transitions/queries settle between steps (drawer slides, panel drops).
export const STEP_SETTLE_MS = 400;
// After a --force-click hover: give group-hover reveals a beat before the forced click.
export const HOVER_REVEAL_MS = 150;
export const NETWORKIDLE_BASE_MS = 10_000;
export const NETWORKIDLE_TIMEOUT_MS = budget(NETWORKIDLE_BASE_MS);
// Default post-nav settle so onMount queries have a chance to fire.
export const MOUNT_SETTLE_MS = 500;
// How many DISTINCT emitted design-audit finding selectors are proven unique in Node (#1326). Each proof
// is a Playwright round trip, so the sweep is bounded and the remainder is published as UNPROVEN rather
// than counted as unique — an unasked question must never render like a clean answer. Comfortably above
// the worst real surface measured 2026-09-04 (13 distinct selectors on /corpus).
const DESIGN_AUDIT_SELECTOR_PROOF_CAP = 64;
/** The env override on that cap — a HARNESS knob, not an operator one (#1566). The cap's failure mode is
 *  a truncation that reads clean, and the only end-to-end proof of the truncation is a run that EXCEEDS
 *  it. Reaching 64 distinct emitted selectors on a real surface needs ~13 firing rules over a planted
 *  page: expensive to build, expensive to run, and fragile against every future rule change. Lowering the
 *  cap to 1 for one CLI invocation proves the same mechanism against the same code path.
 *
 *  ONE spelling, read ONCE at module load — every consumer is a fresh process (the snap CLI is spawned per
 *  run), so a caller sets it in the CHILD's environment, never mid-process. A non-numeric or non-positive
 *  value falls back to the shipped cap rather than silently disabling the proof. */
const SELECTOR_PROOF_CAP_ENV = "ORB_SNAP_SELECTOR_PROOF_CAP";
// biome-ignore lint/style/noProcessEnv: ORB_SNAP_SELECTOR_PROOF_CAP is an ambient TOOLING knob (the harness override that makes the proof cap's truncation reachable in a test), the same class as _shared/load-budget.ts's ORB_BUDGET_CEILING_MS — not app config, and the env door the rule points at (packages/server/src/foundation/env) sits ABOVE @orb/tooling in the cake, so it cannot be imported down here.
const SELECTOR_PROOF_CAP_OVERRIDE = Number(process.env[SELECTOR_PROOF_CAP_ENV]);

/** The proof cap in force for THIS process. */
export function designAuditSelectorProofCap(): number {
  return Number.isInteger(SELECTOR_PROOF_CAP_OVERRIDE) && SELECTOR_PROOF_CAP_OVERRIDE > 0 ? SELECTOR_PROOF_CAP_OVERRIDE : DESIGN_AUDIT_SELECTOR_PROOF_CAP;
}
// The daemon's outer watchdog base for a non-navigating `--session … --design-audit` call. The walk is a
// full-page census plus a pixel settle plus a forced-state pass; the shared load scaler is applied once
// by the daemon on top of this (contract/arms.ts sessionCallBaseMs).
export const DESIGN_AUDIT_SESSION_CALL_BASE_MS = 120_000;
