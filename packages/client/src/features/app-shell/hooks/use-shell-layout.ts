// useShellLayout — the shell's view-model AND the panel-resolve merge point (UI-Arch §4.2 rules 2/3).
// It bundles the narrow shell-store reads with the derived bits app-shell.tsx renders (the active
// section's label, the RESOLVED per-panel modes, whether the layout is immersive, whether a dismiss
// scrim shows), plus the toggle/focus/collapse CALLBACKS — all of which need the resolved mode.
//
// WHY RESOLUTION LIVES HERE (not in the store): the initial value for an un-overridden (section, panel)
// is the SECTION_PANEL_DEFAULTS table, which lives in the app-shell feature (rail-slots.ts). The state
// store cannot import a feature (reverse cycle), so it exposes only the raw override (`usePanelOverride`
// → `PanelMode | undefined`); THIS feature-tier hook merges `override ?? default`. The toggle/focus
// derivations (collapsed→docked, immersive⇄command-center) read the resolved mode to compute the next
// state, so they are callbacks here that call the store's `setPanelMode` writer — the store keeps no
// toggle logic it couldn't resolve.
//
// THE MOBILE FORK (L6/J12 · D62 P3): on a mobile viewport (`useIsMobileViewport`, the JS twin of
// shell.css's `@media`) the panels are TRANSIENT SHEETS, not persisted docks — "docked" is a desktop
// concept a full-width sheet must never inherit. So on mobile the resolve reads the store's transient
// `mobileSheet` (which panel, if any, is open) → `overlay`/`collapsed`, and the toggle/collapse callbacks
// write `setMobileSheet` instead of the persisted `setPanelMode`. Desktop is UNTOUCHED — it keeps reading
// and writing `panelOverrides`. The one `@media`/breakpoint lives once (shell.css + the matchMedia twin);
// no feature branches on viewport.

import type { ModalSlotId, PanelMode, PanelName, SectionId } from "#state";
import {
  setMobileSheet,
  setPanelMode,
  useActiveSection,
  useMobileSheet,
  useOpenModal,
  usePanelOverride,
} from "#state";
import { RAIL_SECTIONS, SECTION_PANEL_DEFAULTS } from "../lib/rail-slots";
import { useIsMobileViewport } from "./use-is-mobile-viewport";

export interface ShellLayout {
  readonly activeSection: SectionId;
  readonly activeSectionLabel: string;
  /** The RESOLVED list-panel mode (mobile: the sheet state; desktop: override ?? section default). */
  readonly listMode: PanelMode;
  /** The RESOLVED context-panel mode (mobile: the sheet state; desktop: override ?? section default). */
  readonly contextMode: PanelMode;
  /** Both panels collapsed = immersive-ST (UI-Arch §4.1) — drives the focus-toggle affordance. */
  readonly immersive: boolean;
  readonly openModalId: ModalSlotId | null;
  /** True when either panel is floating in overlay mode — the dismiss scrim shows behind it (also the
   *  mobile sheet's scrim: a mobile-open panel resolves to `overlay`). */
  readonly scrimVisible: boolean;
  /** The panel-chrome toggle: collapsed → open, anything-open → collapsed (mobile: flips the sheet;
   *  desktop: collapsed ⇄ docked for the active section). */
  readonly togglePanel: (panel: PanelName) => void;
  /** Force one panel CLOSED (the scrim dismiss + the context-header collapse button). Mobile: close the
   *  sheet; desktop: collapse the persisted override. */
  readonly collapsePanel: (panel: PanelName) => void;
  /** The ONE focus toggle (UI-Arch §4.1): immersive-ST (both collapsed) ⇄ command-center (both docked).
   *  On mobile (already single-column) it just closes any open sheet. */
  readonly toggleFocus: () => void;
}

/** Resolve one panel's effective mode: the user's override if set, else the section's boot default. */
function resolveMode(
  override: PanelMode | undefined,
  section: SectionId,
  panel: PanelName,
): PanelMode {
  return override ?? SECTION_PANEL_DEFAULTS[section][panel];
}

export function useShellLayout(): ShellLayout {
  const activeSection = useActiveSection();
  const isMobile = useIsMobileViewport();
  const mobileSheet = useMobileSheet();
  const listOverride = usePanelOverride(activeSection, "list");
  const contextOverride = usePanelOverride(activeSection, "context");

  // MOBILE: the transient sheet state wins (open ⇒ overlay, closed ⇒ collapsed) — never a persisted dock.
  // DESKTOP: the persisted override ?? the section default (§4.2 rules 2/3). Helper keeps the ternary flat.
  const resolvePanel = (panel: PanelName, override: PanelMode | undefined): PanelMode => {
    if (isMobile) {
      return mobileSheet === panel ? "overlay" : "collapsed";
    }
    return resolveMode(override, activeSection, panel);
  };
  const listMode = resolvePanel("list", listOverride);
  const contextMode = resolvePanel("context", contextOverride);

  const openModalId = useOpenModal();
  const activeSectionLabel =
    RAIL_SECTIONS.find((s) => s.id === activeSection)?.label ?? activeSection;
  const immersive = listMode === "collapsed" && contextMode === "collapsed";
  const scrimVisible = listMode === "overlay" || contextMode === "overlay";

  const togglePanel = (panel: PanelName): void => {
    if (isMobile) {
      // Flip the sheet: open this panel (closing the other — one sheet at a time), or close it if open.
      setMobileSheet(mobileSheet === panel ? null : panel);
      return;
    }
    const current = panel === "list" ? listMode : contextMode;
    setPanelMode(panel, current === "collapsed" ? "docked" : "collapsed");
  };

  const collapsePanel = (panel: PanelName): void => {
    if (isMobile) {
      // Only close if THIS panel is the open sheet (leave a different open sheet alone).
      if (mobileSheet === panel) {
        setMobileSheet(null);
      }
      return;
    }
    setPanelMode(panel, "collapsed");
  };

  // If EITHER panel is open we go immersive (collapse both); only when both are already collapsed do we
  // restore both (command-center). Derived from the two resolved modes — no third source of truth. On
  // mobile there is no dock to restore to, so focus just closes any open sheet.
  const toggleFocus = (): void => {
    if (isMobile) {
      setMobileSheet(null);
      return;
    }
    const next: PanelMode = immersive ? "docked" : "collapsed";
    setPanelMode("list", next);
    setPanelMode("context", next);
  };

  return {
    activeSection,
    activeSectionLabel,
    listMode,
    contextMode,
    immersive,
    openModalId,
    scrimVisible,
    togglePanel,
    collapsePanel,
    toggleFocus,
  };
}
