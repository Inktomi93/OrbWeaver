// `__orb.nav.panel` — the write-side dev-nav bridge action for the shell's two side panels. Split out of
// `agent-nav/index.ts` when the file crossed the client component-size cap (component-size.ts, 450 lines) —
// the extraction precedent this gate's own `fix` names (state/section-ids.ts, state/settings-categories.ts):
// pull a self-contained VOCABULARY/behavior out, re-export from the original so every import path keeps
// resolving. `buildAgentNav` still composes ONE call (`resolvePanelRequest`); nothing about the arm's
// contract changed by moving files.

import type { PanelName } from "#state";
import { collapseListPanel, dockListPanel, hideContextPanel, revealContextPanel, setOpenOverlayPanel } from "#state";
import type { NavResult } from "../lib/agent-bridge.ts";
import { panelAvailability } from "../lib/agent-bridge.ts";
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

/** The panel's own `.shell-panel` aside — the ONE query both DOM reads below go through. */
function readPanelElement(panel: PanelName): Element | null {
  return document.querySelector(`.shell-panel[data-panel-side="${panel}"]`);
}

/** The panel's RENDERED mode, read the exact way `__orb.shell()` does (`agent-bridge.ts`'s DOM-derived
 *  `ShellSnapshot`) — `.shell-panel[data-panel-side]`'s `data-panel-mode` (`panel-chrome.tsx`). `null`
 *  means no shell is mounted at all (the landing/auth screen, or a boot still in flight). */
function readPanelDomMode(panel: PanelName): string | null {
  return readPanelElement(panel)?.getAttribute("data-panel-mode") ?? null;
}

/** Why a `"docked"` request failed to land, named from the SECTION'S OWN DECLARATION rather than guessed
 *  from the failure.
 *
 *  THE RULING SURVIVES — ITS INPUT CHANGED (#1149). The old wording ("the active section LIKELY declares no
 *  pane") was correct when it was written: a pane the section does not declare and a pane that is merely
 *  collapsed both render `data-panel-mode="collapsed"`, and the declaration itself lived only in a React
 *  context this module cannot reach. Since #1122 the shell PUBLISHES it (`data-panel-available`, the same
 *  attribute `__orb.shell()`'s panel rows carry), so the hedge is no longer honesty — it is a caller being
 *  told to go and check something the page already stated. It is kept for exactly the case it was minted
 *  for: `null`, a shell that published no declaration at all, where inference is still all there is.
 *
 *  The `true` arm is not a third spelling of the same sentence: a section that DOES declare the pane and
 *  still did not open it is a different defect (a write that reached no live channel), and naming it as
 *  "likely no pane" would send the reader to the one place the page has already ruled out. */
function panelOpenRefusal(panel: PanelName, declared: boolean | null, landed: string): string {
  if (declared === false) {
    return `panel "${panel}" did not open — the active section declares no "${panel}" pane`;
  }
  if (declared === null) {
    return `panel "${panel}" did not open — the active section likely declares no "${panel}" pane (it published no declaration to read)`;
  }
  return `panel "${panel}" did not open — the active section declares a "${panel}" pane, but its rendered mode stayed "${landed}"`;
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

/** Route the request to the EXACT store actions the real chrome calls — never a hand-rolled write.
 *
 *  LIST writes BOTH regime channels. `dockListPanel`/`collapseListPanel` write only the WIDE channel + the
 *  #383 carry; the overlay channel is written here too so the write reaches a mobile/narrow regime as well
 *  — the same dual-write idiom `revealContextPanel`/`hideContextPanel` already use for CONTEXT, applied to
 *  the one piece of LIST's regime this module cannot resolve without reaching into the section registry. */
function writePanelMode(panel: PanelName, wantsOpen: boolean): void {
  if (panel === "context") {
    (wantsOpen ? revealContextPanel : hideContextPanel)();
    return;
  }
  if (wantsOpen) {
    dockListPanel();
    setOpenOverlayPanel("list");
    return;
  }
  collapseListPanel();
  setOpenOverlayPanel("none");
}

/** THE PANEL ARM. Routes the write through {@link writePanelMode}, then VERIFIES the panel's rendered mode
 *  actually reached the request before reporting `ok:true` — the `contextTab` arm's contract (#656): a
 *  navigation step that cannot verify its landing must not report success.
 *
 *  Two write-time facts keep the check load-bearing rather than decorative: whether the active section even
 *  declares the pane (an unavailable pane pins `resolvePanelMode` to `collapsed` forever, so a docked
 *  request silently never lands), and — for CONTEXT only — which of the two regime channels is currently
 *  live (`hideContextPanel`'s own header). Neither is knowable BEFORE the write; the first is knowable
 *  AFTER it, off the shell's published declaration, which is what {@link panelOpenRefusal} names. */
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
  writePanelMode(panel, wantsOpen);
  const landed = await awaitPanelDomMode(panel, (m) => (wantsOpen ? m !== "collapsed" : m === "collapsed"), PANEL_LANDING_SETTLE_MS);
  if (wantsOpen && landed !== null && landed === "collapsed") {
    const element = readPanelElement(panel);
    return { ok: false, reason: panelOpenRefusal(panel, element === null ? null : panelAvailability(element), landed) };
  }
  if (landed === null) {
    return { ok: false, reason: `panel "${panel}" is not mounted` };
  }
  if (!wantsOpen && landed !== "collapsed") {
    return { ok: false, reason: `panel "${panel}" did not collapse — the rendered mode settled on "${landed}"` };
  }
  return { ok: true };
}
