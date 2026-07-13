// useShellLayout — the shell's view-model and panel-resolve merge point. Bundles narrow shell-store
// reads with derived bits (active section label, resolved per-panel modes, immersive, scrim) plus the
// toggle/focus/collapse callbacks. Resolution lives here (not the store) because the state store can't
// import the app-shell feature's SECTION_PANEL_DEFAULTS (reverse cycle) — the store exposes only the raw
// override, this hook merges `override ?? default`.
//
// On mobile the panels are transient sheets, not persisted docks: the resolve reads the store's
// `mobileSheet` instead of `panelOverrides`, and toggle/collapse write `setMobileSheet` instead of
// `setPanelMode`. Desktop is untouched.

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
  readonly listMode: PanelMode;
  readonly contextMode: PanelMode;
  /** Both panels collapsed — drives the focus-toggle affordance. */
  readonly immersive: boolean;
  readonly openModalId: ModalSlotId | null;
  /** True when either panel is floating in overlay mode — the dismiss scrim shows behind it. */
  readonly scrimVisible: boolean;
  /** Collapsed → open, anything-open → collapsed (mobile: flips the sheet; desktop: collapsed ⇄ docked). */
  readonly togglePanel: (panel: PanelName) => void;
  /** Force one panel closed. Mobile: close the sheet; desktop: collapse the persisted override. */
  readonly collapsePanel: (panel: PanelName) => void;
  /** Immersive (both collapsed) ⇄ command-center (both docked); on mobile just closes any open sheet. */
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
      setMobileSheet(mobileSheet === panel ? null : panel);
      return;
    }
    const current = panel === "list" ? listMode : contextMode;
    setPanelMode(panel, current === "collapsed" ? "docked" : "collapsed");
  };

  const collapsePanel = (panel: PanelName): void => {
    if (isMobile) {
      if (mobileSheet === panel) {
        setMobileSheet(null);
      }
      return;
    }
    setPanelMode(panel, "collapsed");
  };

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
