// Builds the panel-axis census (contract/surface-state.ts's header states the WHY) from one
// `__orb.shell()` read. Never re-derives the DOM query itself — the bridge's own `ShellSnapshot` reader
// (`packages/client/src/lib/agent-bridge.ts`) is the one home for what a panel's rendered mode is.
import type { RelationalCensusAccountingInput } from "../contract/samples-populations.ts";
import type { DriveStateCandidate, SurfaceStateAccounting } from "../contract/surface-state.ts";
import { DRIVE_STATE_SPACE, PANEL_MODE_SPACE } from "../contract/surface-state.ts";
import type { ShellStateSnapshot } from "../contract/types.ts";
import { assertCensusAccounting } from "./population.ts";

const NO_SHELL_REASON = "no-shell-mounted";
const MODE_UNRESOLVED_REASON = "mode-unresolved";
const PANEL_NOT_RENDERED_REASON = "panel-not-rendered";
/** The #1122 exclusion: the ACTIVE SECTION declares it has no such pane, so no mode in the space is
 *  reachable on this surface by any arm. Spelled in the rule-population reason vocabulary (camelCase,
 *  like `srOnly`/`flatBackdrop`) because it is a MEASURED FACT ABOUT THE SUBJECT, not a fact about the
 *  probe's own reach — which is what the three kebab reasons above all are. */
const SECTION_DECLARES_NO_PANE_REASON = "sectionDeclaresNoPane";
/** One axis's census: `excludedReason` set ⇒ the WHOLE space is a proven inapplicability (no shell
 *  mounted at all, or a section that declares it has no such pane — see `panelExcludedReason`);
 *  `observed` outside the space (or absent on a mounted shell) ⇒ the axis was never
 *  resolved and every candidate is WITHHELD under a stated reason rather than silently zeroed; otherwise
 *  exactly the observed candidate is judged and the rest of the space is withheld by name — the one
 *  configuration this run saw, and the ones it structurally could not. */
function censusOfSpace(space: readonly string[], observed: string | null, excludedReason: string | null): RelationalCensusAccountingInput {
  if (excludedReason !== null) {
    return { candidates: space.length, judged: 0, withheld: {}, excluded: { [excludedReason]: space.length } };
  }
  if (observed === null || !space.includes(observed)) {
    return { candidates: space.length, judged: 0, withheld: { [MODE_UNRESOLVED_REASON]: space.length }, excluded: {} };
  }
  const withheld: Record<string, number> = {};
  for (const candidate of space) {
    if (candidate !== observed) {
      withheld[candidate] = 1;
    }
  }
  return { candidates: space.length, judged: 1, withheld, excluded: {} };
}

/** One panel side's exclusion reason, in precedence order: `null` (no shell mounted) excludes it
 *  wholesale; a mounted shell missing that side's `.shell-panel` entirely (should not happen —
 *  `PanelChrome` renders both sides unconditionally, `app-shell.tsx`) excludes it under its OWN reason, so
 *  a genuine wiring regression there stays visible instead of folding into "withheld"; and a rendered pane
 *  the ACTIVE SECTION DECLARES IT DOES NOT HAVE excludes it under #1122's reason.
 *
 *  `available === null` deliberately does NOT exclude: an unpublished declaration is a broken publish, not
 *  an inapplicability, and it keeps the pre-#1122 conservative WITHHELD arm. The loud refusal for it lives
 *  at the seam that reads the bridge (`ops/page-validate.ts`), so this pure builder stays total. */
function panelExcludedReason(noShell: boolean, panel: { readonly mode: string | null; readonly available: boolean | null } | null): string | null {
  if (noShell) {
    return NO_SHELL_REASON;
  }
  if (panel === null) {
    return PANEL_NOT_RENDERED_REASON;
  }
  return panel.available === false ? SECTION_DECLARES_NO_PANE_REASON : null;
}

/** `null` (or an unmounted shell — `section: null`/no panels at all) EXCLUDES every SHELL axis outright:
 *  that is a PROVEN fact about the route (the landing/auth screen, or a boot still in flight), not a
 *  guess. The SECOND proven arm (#1122) is per-pane: a section that DECLARES a pane unavailable excludes
 *  that pane's whole mode space.
 *  The DRIVE axis is exempt from every exclusion arm on purpose (contract/surface-state.ts states why): the
 *  regime is an argv fact this run always knows, so it is judged even when no shell mounted. */
export function buildSurfaceStateAccounting(shell: ShellStateSnapshot | null, drive: DriveStateCandidate): SurfaceStateAccounting {
  const noShell = shell === null || shell.section === null || shell.panels.length === 0;
  const listPanel = shell?.panels.find((p) => p.side === "list") ?? null;
  const contextPanel = shell?.panels.find((p) => p.side === "context") ?? null;
  const panelList = censusOfSpace(PANEL_MODE_SPACE, noShell ? null : (listPanel?.mode ?? null), panelExcludedReason(noShell, listPanel));
  const panelContext = censusOfSpace(PANEL_MODE_SPACE, noShell ? null : (contextPanel?.mode ?? null), panelExcludedReason(noShell, contextPanel));
  const driveCensus = censusOfSpace(DRIVE_STATE_SPACE, drive, null);

  assertCensusAccounting("panel-list", panelList);
  assertCensusAccounting("panel-context", panelContext);
  assertCensusAccounting("drive", driveCensus);

  return { panelList, panelContext, drive: driveCensus };
}

/** One axis's summary label for the RESULT line — `"complete"` is the space this run genuinely reached
 *  in full (never yet, for a single-pass probe; reserved so a future multi-config run can say so
 *  honestly), `"excluded"` means the whole axis was proven inapplicable, `"withheld"` is the normal
 *  single-run case: exactly one configuration judged, the rest of the space unvisited. */
export function surfaceStateAxisLabel(census: RelationalCensusAccountingInput): "complete" | "excluded" | "withheld" {
  if (census.judged >= census.candidates) {
    return "complete";
  }
  const withheldTotal = Object.values(census.withheld).reduce((a, b) => a + b, 0);
  return withheldTotal === 0 ? "excluded" : "withheld";
}
