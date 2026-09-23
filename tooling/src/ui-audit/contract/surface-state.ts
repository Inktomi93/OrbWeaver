// The PANEL-AXIS accounting (#148 item 2). Every RULE in this instrument now carries
// candidates/judged/withheld/excluded (#953/#987, lib/population.ts) — the SURFACE-STATE dimension a run
// measures had none: design-audit sees exactly ONE shell configuration per run (one mode per side panel,
// one focus flag) and every other configuration in that space goes completely unvisited, silently. This
// file gives that dimension the identical accounting shape so a clean verdict cannot stand in for "we
// never looked" one level up from the rule population it already guards.
//
// The mode/focus SPACES below are the full set of resolved values a panel/the focus flag can ever render
// as (`PanelMode`/`useShellLayout.ts`'s `focusMode`) — not a claim about which are reachable from the
// active section. EXCLUDED is reserved for a PROVEN inapplicability, never a guess.
//
// THE RULING SURVIVES — ITS INPUT CHANGED (#1122). The original ruling read: "A section's PER-PANE
// availability (`ShellLayout.listAvailable`/`contextAvailable`, `use-shell-layout.ts`) is NOT reachable
// from here — it lives in a React context this probe never reads — so every unvisited MODE on a MOUNTED
// shell is WITHHELD, never guessed into excluded." The MECHANISM (excluded requires proof) is untouched;
// what changed is that the proof now exists: the shell PUBLISHES the active section's declaration as
// `data-panel-available` (`panel-chrome.tsx`, fed by the same `layout.listAvailable`/`contextAvailable`
// the app-shell renders from), `__orb.shell()` carries it on every panel row, and an absent declaration
// is an exit-2 refusal (`ops/page-validate.ts`), not a default. So the two PROVEN exclusion arms are now:
//   • no shell mounted at all (`section: null`, `panels: []` — the landing/auth screen, or a boot in
//     flight) — the whole surface-state dimension is inapplicable;
//   • the ACTIVE SECTION declares the pane unavailable (`available: false`) — no mode in that pane's space
//     is reachable on this surface by any arm, which is exactly what `--panels both-docked` already
//     refused loudly about while this census called the same fact WITHHELD.
// FOCUS follows the panes: focus mode IS "hide every panel", and `fullscreen-chrome.tsx` does not render
// the toggle at all when `anyPanelAvailable` is false — so a section declaring BOTH panes unavailable
// excludes the focus axis too, while one available pane leaves it WITHHELD.
// Everything else on a mounted shell is still WITHHELD, never guessed into excluded.
import type { RelationalCensusAccountingInput } from "./samples-populations.ts";

/** The full resolved-mode space a side panel can render as (`PanelMode`, `#state`). `"overlay"` is a
 *  regime OUTCOME, not a writable request (see `panel-request.ts`'s own note), but it is still a mode a
 *  run can OBSERVE — so it stays a candidate here even though `__orb.nav.panel` can never request it. */
export const PANEL_MODE_SPACE = ["docked", "collapsed", "overlay"] as const;
export type PanelModeCandidate = (typeof PANEL_MODE_SPACE)[number];

/** The shell's one focus flag has exactly two resolved states. */
export const FOCUS_STATE_SPACE = ["on", "off"] as const;
export type FocusStateCandidate = (typeof FOCUS_STATE_SPACE)[number];

/** THE DRIVE AXIS (#1059). A surface has two measurable regimes and a run reaches exactly one: the REST
 *  state a visitor lands on, and the DRIVEN state an argv-ordered action queue puts it in. They are
 *  different populations, not a detail of one — Characters' library toolbar carries two toggles that are
 *  both OFF at rest, so `selection-idiom` has no selected twin to judge there and #987 withholds it
 *  (the settlement contract in `ops/walker/RULE-AUTHORING.md`), while ONE `--click` on "Select multiple"
 *  gives the same cohort its twin and the rule reaches a verdict. The owner's #1059 ruling keeps BOTH:
 *  the bare run still measures rest and still withholds, and the driven run is the twin's source.
 *  So the regime a run measured is DECLARED here, in the same accounting the panel/focus axes already
 *  use, rather than left for a reader to infer from `actions=` — a driven population and a rest
 *  population are not comparable, and a report that cannot say which one it holds is the same
 *  "we never looked" silence this file exists to end.
 *
 *  Unlike the panel/focus axes this one is never EXCLUDED: it is an argv fact, not a shell reading, so
 *  even an unmounted shell was reached in exactly one of these two regimes. */
export const DRIVE_STATE_SPACE = ["rest", "driven"] as const;
export type DriveStateCandidate = (typeof DRIVE_STATE_SPACE)[number];

/** One census per surface-state axis — the same relational-census shape a rule's own denominator uses
 *  (`samples-populations.ts`), reused rather than re-spelled so `lib/population.ts`'s
 *  `assertCensusAccounting` settles this exactly as it settles every rule's. */
export interface SurfaceStateAccounting {
  readonly panelList: RelationalCensusAccountingInput;
  readonly panelContext: RelationalCensusAccountingInput;
  readonly focus: RelationalCensusAccountingInput;
  readonly drive: RelationalCensusAccountingInput;
}
