// The shell's PANEL-MODE algebra + its vocabulary — the pure half of the layout store, split out when
// `shell-store.ts` crossed the component-size cap. Pure by construction: no store handle, no React, no
// viewport read. `shell-store.ts` owns the STATE and the hooks that feed this function; every caller
// (the feature-tier `useShellLayout`, the `#state` projection `useListDocked`) resolves through THIS one
// function so the tiers can never drift (the M10 correction).

/** A panel's 3-state model: docked (in-flow) · overlay (floats over) · collapsed (zero width). */
export const PANEL_MODES = ["docked", "overlay", "collapsed"] as const;
export type PanelMode = (typeof PANEL_MODES)[number];

/** The two collapsible side panels (rail is fixed, content is fluid — neither is a panel). */
export type PanelName = "list" | "context";

/** The transient slide-over REQUEST — which panel the user asked to float open, or their explicit "nothing
 *  open", or no request at all.
 *
 *  `null` IS NOT "closed": it means *no explicit request*, so the regime's own default decides. That is what
 *  lets the mobile LIST-as-screen default (`resolvePanelMode`) exist without a second flag beside this one:
 *  every clear-the-selection / section-change / focus write already lands `null`, and `null` is exactly
 *  "show me whatever this regime shows by default". `"none"` is the user's own close — the topbar toggle
 *  dropping the roster screen to reach the section's no-selection CONTENT. Two states, one field, so the
 *  "is anything floating?" question can never be answered two ways.
 *
 *  `"none"` therefore SUPPRESSES a default, which is why closing the CONTEXT sheet releases to `null`
 *  instead (`useShellLayout`): a user dismissing a detail sheet on a phone did not ask for the roster
 *  behind it to disappear too. Only the LIST — the one panel with a regime default to suppress — writes it. */
export type OverlayPanelRequest = PanelName | "none" | null;

/** The ONE mode-resolution algebra — both `useShellLayout`'s `resolvePanel` (feature-tier hook, reads the
 *  section registry for `panelDefaults`) and `useListDocked` below (this tier) call this SAME function so
 *  they can never drift (the M10 correction: a hand-copied mirror read only `mobileViewport` and
 *  disagreed with `resolvePanel` in the 48–64rem regime). Precedence isFocus → isMobile → narrow → wide.
 *
 *  FOCUS WINS OVER EVERYTHING (item 20): focus mode is "no side panel is showing", in every regime, with
 *  ZERO writes to `panelOverrides` — which is what makes the flag, the label and the pixels one truth and
 *  leaves the pre-focus layout intact for the exit (the untouched override map IS the saved state).
 *  Then, as before: mobile never resolves "docked" (a transient sheet, open only when `openOverlayPanel` names it); a
 *  narrow-desktop `docked` DEFAULT auto-downgrades to a CLOSED slide-over (`collapsed`), opening to
 *  `overlay` only when `openOverlayPanel` names it (§4.1: overlay is zero-width closed by default, slides
 *  over on demand); wide resolves the raw override-or-default untouched.
 *
 *  BEING NAMED BY `openOverlayPanel` WINS OVER A STORED `collapsed` in the narrow regime (2026-08-01 fix).
 *  It read as a dead control: `chats` defaults its CONTEXT pane `collapsed`, so at ≤64rem the toggle wrote a
 *  `docked` override that this function immediately re-collapsed — the user's click produced no pixel, and
 *  only a SECOND click (now on a `docked` default) reached the overlay arm. A persisted collapse is a WIDE
 *  dock preference; it cannot outvote a live "open it now" in a regime where docking is impossible.
 *
 *  THE MOBILE ONE-SHELL RULE (owner-ruled 2026-08-03, `regime.listIsScreen`): on a phone, a section that
 *  DECLARES a list and has NOTHING selected resolves its LIST `docked` — the roster IS the screen, in flow,
 *  with no scrim and nothing floating over anything (`mobile.html` frame 2: "nothing selected ⇒ the roster
 *  IS the screen"; showing the welcome first puts a teaching card between the user and the rows they came
 *  for). A selection pushes CONTENT over it and the shell's topbar carries the way BACK. It is ONE rule in
 *  the shell for every list-bearing section — measured 2026-08-06 at 320px, all SEVEN of them (chats ·
 *  characters · corpus · config · databank · presets · analytics) landed on the welcome with the list
 *  translated off-screen, so this removes seven deviations rather than two. The user's own `"none"` still
 *  wins over the default: that is the topbar toggle dropping the roster to reach a section's no-selection
 *  CONTENT (the corpus/analytics dashboards), so the control is never dead in this arm either. */
export function resolvePanelMode(
  panel: PanelName,
  resolved: PanelMode,
  regime: {
    readonly isFocus: boolean;
    readonly isMobile: boolean;
    readonly isNarrow: boolean;
    readonly openOverlayPanel: OverlayPanelRequest;
    /** MOBILE only: does the active section declare a list with NOTHING selected (the list-as-screen arm)? */
    readonly listIsScreen: boolean;
  },
): PanelMode {
  if (regime.isFocus) {
    return "collapsed";
  }
  if (regime.isMobile) {
    if (panel === "list" && regime.listIsScreen) {
      return regime.openOverlayPanel === "none" ? "collapsed" : "docked";
    }
    return regime.openOverlayPanel === panel ? "overlay" : "collapsed";
  }
  if (regime.isNarrow) {
    if (regime.openOverlayPanel === panel) {
      return "overlay";
    }
    return resolved === "docked" ? "collapsed" : resolved;
  }
  return resolved;
}
