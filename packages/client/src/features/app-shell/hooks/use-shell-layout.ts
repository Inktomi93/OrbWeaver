// useShellLayout — the shell's view-model AND the panel-resolve merge point (UI-Arch §4.2 rules 2/3).
// It bundles the narrow shell-store reads with the derived bits app-shell.tsx renders (the active
// section's label, the RESOLVED per-panel modes, whether the layout is immersive, whether a dismiss
// scrim shows), plus the toggle/focus CALLBACKS — all of which need the resolved mode.
//
// WHY RESOLUTION LIVES HERE (not in the store): the initial value for an un-overridden (section, panel)
// is the SECTION_PANEL_DEFAULTS table, which lives in the app-shell feature (rail-slots.ts). The state
// store cannot import a feature (reverse cycle), so it exposes only the raw override (`usePanelOverride`
// → `PanelMode | undefined`); THIS feature-tier hook merges `override ?? default`. The toggle/focus
// derivations (collapsed→docked, immersive⇄command-center) read the resolved mode to compute the next
// state, so they are callbacks here that call the store's `setPanelMode` writer — the store keeps no
// toggle logic it couldn't resolve.

import type { ModalSlotId, PanelMode, PanelName, SectionId } from "#state";
import { setPanelMode, useActiveSection, useOpenModal, usePanelOverride } from "#state";
import { RAIL_SECTIONS, SECTION_PANEL_DEFAULTS } from "../lib/rail-slots";

export interface ShellLayout {
  readonly activeSection: SectionId;
  readonly activeSectionLabel: string;
  /** The RESOLVED list-panel mode (override ?? section default). */
  readonly listMode: PanelMode;
  /** The RESOLVED context-panel mode (override ?? section default). */
  readonly contextMode: PanelMode;
  /** Both panels collapsed = immersive-ST (UI-Arch §4.1) — drives the focus-toggle affordance. */
  readonly immersive: boolean;
  readonly openModalId: ModalSlotId | null;
  /** True when either panel is floating in overlay mode — the dismiss scrim shows behind it. */
  readonly scrimVisible: boolean;
  /** The panel-chrome toggle: collapsed → docked, anything-open → collapsed (for the active section). */
  readonly togglePanel: (panel: PanelName) => void;
  /** The ONE focus toggle (UI-Arch §4.1): immersive-ST (both collapsed) ⇄ command-center (both docked). */
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
  const listMode = resolveMode(usePanelOverride(activeSection, "list"), activeSection, "list");
  const contextMode = resolveMode(
    usePanelOverride(activeSection, "context"),
    activeSection,
    "context",
  );
  const openModalId = useOpenModal();
  const activeSectionLabel =
    RAIL_SECTIONS.find((s) => s.id === activeSection)?.label ?? activeSection;
  const immersive = listMode === "collapsed" && contextMode === "collapsed";
  const scrimVisible = listMode === "overlay" || contextMode === "overlay";

  const togglePanel = (panel: PanelName): void => {
    const current = panel === "list" ? listMode : contextMode;
    setPanelMode(panel, current === "collapsed" ? "docked" : "collapsed");
  };
  // If EITHER panel is open we go immersive (collapse both); only when both are already collapsed do we
  // restore both (command-center). Derived from the two resolved modes — no third source of truth.
  const toggleFocus = (): void => {
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
    toggleFocus,
  };
}
