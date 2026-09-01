// Builds the panel-axis census (contract/surface-state.ts's header states the WHY) from one
// `__orb.shell()` read. Never re-derives the DOM query itself — the bridge's own `ShellSnapshot` reader
// (`packages/client/src/lib/agent-bridge.ts`) is the one home for what a panel's rendered mode is.
import type { RelationalCensusAccountingInput } from "../contract/samples-populations.ts";
import type { SurfaceStateAccounting } from "../contract/surface-state.ts";
import { FOCUS_STATE_SPACE, PANEL_MODE_SPACE } from "../contract/surface-state.ts";
import type { ShellStateSnapshot } from "../contract/types.ts";
import { assertCensusAccounting } from "./population.ts";

const NO_SHELL_REASON = "no-shell-mounted";
const MODE_UNRESOLVED_REASON = "mode-unresolved";
const PANEL_NOT_RENDERED_REASON = "panel-not-rendered";

/** One axis's census: `excludedReason` set ⇒ the WHOLE space is a proven inapplicability (no shell
 *  mounted at all); `observed` outside the space (or absent on a mounted shell) ⇒ the axis was never
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

/** One panel side's exclusion reason: `null` (no shell mounted) excludes it wholesale; a mounted shell
 *  missing that side's `.shell-panel` entirely (should not happen — `PanelChrome` renders both sides
 *  unconditionally, `app-shell.tsx`) excludes it under its OWN reason, so a genuine wiring regression
 *  there stays visible instead of folding into "withheld". */
function panelExcludedReason(noShell: boolean, panel: { readonly mode: string | null } | null): string | null {
  if (noShell) {
    return NO_SHELL_REASON;
  }
  return panel === null ? PANEL_NOT_RENDERED_REASON : null;
}

function focusObservedState(noShell: boolean, focus: boolean | undefined): string | null {
  if (noShell) {
    return null;
  }
  return focus === true ? "on" : "off";
}

/** `null` (or an unmounted shell — `section: null`/no panels at all) EXCLUDES every axis outright: that
 *  is a PROVEN fact about the route (the landing/auth screen, or a boot still in flight), not a guess. */
export function buildSurfaceStateAccounting(shell: ShellStateSnapshot | null): SurfaceStateAccounting {
  const noShell = shell === null || shell.section === null || shell.panels.length === 0;
  const listPanel = shell?.panels.find((p) => p.side === "list") ?? null;
  const contextPanel = shell?.panels.find((p) => p.side === "context") ?? null;
  const focusObserved = focusObservedState(noShell, shell?.focus);

  const panelList = censusOfSpace(PANEL_MODE_SPACE, noShell ? null : (listPanel?.mode ?? null), panelExcludedReason(noShell, listPanel));
  const panelContext = censusOfSpace(PANEL_MODE_SPACE, noShell ? null : (contextPanel?.mode ?? null), panelExcludedReason(noShell, contextPanel));
  const focus = censusOfSpace(FOCUS_STATE_SPACE, focusObserved, noShell ? NO_SHELL_REASON : null);

  assertCensusAccounting("panel-list", panelList);
  assertCensusAccounting("panel-context", panelContext);
  assertCensusAccounting("focus", focus);

  return { panelList, panelContext, focus };
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
