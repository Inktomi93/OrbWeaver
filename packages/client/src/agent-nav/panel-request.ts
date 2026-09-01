// `__orb.nav.panel` — the write-side dev-nav bridge action for the shell's two side panels. Split out of
// `agent-nav/index.ts` when the file crossed the client component-size cap (component-size.ts, 450 lines) —
// the extraction precedent this gate's own `fix` names (state/section-ids.ts, state/settings-categories.ts):
// pull a self-contained VOCABULARY/behavior out, re-export from the original so every import path keeps
// resolving. `buildAgentNav` still composes ONE call (`resolvePanelRequest`); nothing about the arm's
// contract changed by moving files.

import type { PanelName } from "#state";
import { collapseListPanel, dockListPanel, hideContextPanel, revealContextPanel, setOpenOverlayPanel } from "#state";
import type { NavResult } from "../lib/agent-bridge.ts";
import { markAgentNavigation } from "../lib/motion-stats.ts";

/** The full `__orb.nav.panel` name vocabulary (`PanelName` has no runtime tuple of its own — it is a
 *  two-member literal union, not a registry-backed axis). */
const PANEL_NAMES: readonly PanelName[] = ["list", "context"];
/** The two panel modes a caller may REQUEST. `"overlay"` is deliberately excluded: it is `resolvePanelMode`'s
 *  OWN resolved outcome for a docked/collapsed request in an overlay regime, never a value a real UI control
 *  writes directly (`panel-resolve.ts`). */
const PANEL_WRITABLE_MODES = ["docked", "collapsed"] as const;
type PanelWritableMode = (typeof PANEL_WRITABLE_MODES)[number];

// How long `panel` waits for the shell's RENDERED `data-panel-mode` to reflect the write before reporting a
// no-op (the same defect class as #656's contextTab arm: a store write can land in a channel the current
// regime does not read, or the active section can declare no such pane at all — `resolvePanelMode` then pins
// the resolved mode `collapsed` forever regardless of what was written). A React commit after a zustand
// `setState` is a task away at most, not a mount-dependent publish, so this is far shorter than
// `agent-nav/index.ts`'s `CONTEXT_TAB_SETTLE_MS` while staying well clear of a single dropped frame under load.
const PANEL_LANDING_SETTLE_MS = 500;

/** The panel's RENDERED mode, read the exact way `__orb.shell()` does (`agent-bridge.ts`'s DOM-derived
 *  `ShellSnapshot`) — `.shell-panel[data-panel-side]`'s `data-panel-mode` (`panel-chrome.tsx`). This is the
 *  ONLY place outside React the panel's true resolved mode is knowable: whether the active section even
 *  DECLARES the pane lives in the section registry (a React context, unreachable from this module —
 *  `list-flip-carry.ts`'s own header states the same constraint for the auto-overlay content-read), so an
 *  unavailable pane can only be told apart from an available-but-hidden one by what actually painted. `null`
 *  means no shell is mounted at all (the landing/auth screen, or a boot still in flight). */
function readPanelDomMode(panel: PanelName): string | null {
  return document.querySelector(`.shell-panel[data-panel-side="${panel}"]`)?.getAttribute("data-panel-mode") ?? null;
}

/** Poll the panel's rendered mode, rAF-driven rather than a store subscription: `data-panel-mode` is a
 *  React-COMMIT fact, and the shell store's own change signal (`subscribeShellState`) fires synchronously on
 *  `setState`, BEFORE React has painted the write — reading DOM off that signal would read stale, pre-commit
 *  markup. Bounded at `PANEL_LANDING_SETTLE_MS`; returns whatever the last read was on timeout so the caller
 *  can name it in the refusal. */
async function awaitPanelDomMode(panel: PanelName, landed: (mode: string | null) => boolean, deadlineMs: number): Promise<string | null> {
  let mode = readPanelDomMode(panel);
  const deadline = performance.now() + deadlineMs;
  while (!landed(mode) && performance.now() < deadline) {
    await new Promise<void>((resolve) => requestAnimationFrame((): void => resolve()));
    mode = readPanelDomMode(panel);
  }
  return mode;
}

/** THE PANEL ARM. Routes to the EXACT store actions the real chrome calls (`dockListPanel`/
 *  `collapseListPanel` for LIST, `revealContextPanel`/`hideContextPanel` for CONTEXT — never a hand-rolled
 *  write), then VERIFIES the panel's rendered mode actually reached the request before reporting `ok:true` —
 *  the `contextTab` arm's contract (#656): a navigation step that cannot verify its landing must not report
 *  success. Two write-time facts this module cannot see from outside React make the check load-bearing
 *  rather than decorative: whether the active section even declares the pane (an unavailable pane pins
 *  `resolvePanelMode` to `collapsed` forever, so a docked request silently never lands), and — for CONTEXT
 *  only — which of the two regime channels is currently live (`hideContextPanel`'s own header). LIST's own
 *  overlay-ness IS fully known (mobile/narrow), but `dockListPanel`/`collapseListPanel` write only the WIDE
 *  channel + the #383 carry; the overlay channel is written here too so the write reaches a mobile/narrow
 *  regime as well — the same dual-write idiom `revealContextPanel`/`hideContextPanel` already use for
 *  CONTEXT, applied to the one piece of LIST's regime this module cannot resolve any other way without
 *  reaching into the section registry. */
export async function resolvePanelRequest(name: string, mode: string): Promise<NavResult> {
  if (!PANEL_NAMES.includes(name as PanelName)) {
    return { ok: false, reason: `unknown panel "${name}" — expected one of: ${PANEL_NAMES.join(", ")}` };
  }
  const panel = name as PanelName;
  if (!(PANEL_WRITABLE_MODES as readonly string[]).includes(mode)) {
    return {
      ok: false,
      reason: `unknown panel mode "${mode}" — expected one of: ${PANEL_WRITABLE_MODES.join(", ")} ("overlay" is a resolved regime outcome, never a writable request)`,
    };
  }
  const wantsOpen = (mode as PanelWritableMode) === "docked";
  if (document.querySelector(".shell-grid") === null) {
    return { ok: false, reason: "no shell is mounted — navigate into an authenticated section before driving a panel" };
  }
  markAgentNavigation();
  if (panel === "list") {
    if (wantsOpen) {
      dockListPanel();
      setOpenOverlayPanel("list");
    } else {
      collapseListPanel();
      setOpenOverlayPanel("none");
    }
  } else if (wantsOpen) {
    revealContextPanel();
  } else {
    hideContextPanel();
  }
  const landed = await awaitPanelDomMode(panel, (m) => (wantsOpen ? m !== "collapsed" : m === "collapsed"), PANEL_LANDING_SETTLE_MS);
  if (wantsOpen && landed !== null && landed === "collapsed") {
    return { ok: false, reason: `panel "${panel}" did not open — the active section likely declares no "${panel}" pane` };
  }
  if (landed === null) {
    return { ok: false, reason: `panel "${panel}" is not mounted` };
  }
  if (!wantsOpen && landed !== "collapsed") {
    return { ok: false, reason: `panel "${panel}" did not collapse — the rendered mode settled on "${landed}"` };
  }
  return { ok: true };
}
