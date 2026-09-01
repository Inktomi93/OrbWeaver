// The PANEL-AXIS accounting (#148 item 2). Every RULE in this instrument now carries
// candidates/judged/withheld/excluded (#953/#987, lib/population.ts) — the SURFACE-STATE dimension a run
// measures had none: design-audit sees exactly ONE shell configuration per run (one mode per side panel,
// one focus flag) and every other configuration in that space goes completely unvisited, silently. This
// file gives that dimension the identical accounting shape so a clean verdict cannot stand in for "we
// never looked" one level up from the rule population it already guards.
//
// The mode/focus SPACES below are the full set of resolved values a panel/the focus flag can ever render
// as (`PanelMode`/`useShellLayout.ts`'s `focusMode`) — not a claim about which are reachable from the
// active section. EXCLUDED is reserved for a PROVEN inapplicability: no shell mounted at all
// (`__orb.shell()` itself already states it — `section: null`, `panels: []`, the landing/auth screen or a
// boot still in flight). A section's PER-PANE availability (`ShellLayout.listAvailable`/`contextAvailable`,
// `use-shell-layout.ts`) is NOT reachable from here — it lives in a React context this probe never reads —
// so every unvisited MODE on a MOUNTED shell is WITHHELD, never guessed into excluded.
import type { RelationalCensusAccountingInput } from "./samples-populations.ts";

/** The full resolved-mode space a side panel can render as (`PanelMode`, `#state`). `"overlay"` is a
 *  regime OUTCOME, not a writable request (see `panel-request.ts`'s own note), but it is still a mode a
 *  run can OBSERVE — so it stays a candidate here even though `__orb.nav.panel` can never request it. */
export const PANEL_MODE_SPACE = ["docked", "collapsed", "overlay"] as const;
export type PanelModeCandidate = (typeof PANEL_MODE_SPACE)[number];

/** The shell's one focus flag has exactly two resolved states. */
export const FOCUS_STATE_SPACE = ["on", "off"] as const;
export type FocusStateCandidate = (typeof FOCUS_STATE_SPACE)[number];

/** One census per surface-state axis — the same relational-census shape a rule's own denominator uses
 *  (`samples-populations.ts`), reused rather than re-spelled so `lib/population.ts`'s
 *  `assertCensusAccounting` settles this exactly as it settles every rule's. */
export interface SurfaceStateAccounting {
  readonly panelList: RelationalCensusAccountingInput;
  readonly panelContext: RelationalCensusAccountingInput;
  readonly focus: RelationalCensusAccountingInput;
}
