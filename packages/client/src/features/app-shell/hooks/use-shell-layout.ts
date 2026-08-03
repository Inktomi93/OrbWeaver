// useShellLayout — the shell's view-model and panel-resolve merge point. Bundles narrow shell-store
// reads with derived bits (active section label, resolved per-panel modes, scrim) plus the
// toggle/focus/collapse callbacks. Resolution lives here (not the store): the store exposes only the raw
// per-panel override; this hook merges `override ?? the section's registry panelDefaults` then runs it
// through `resolvePanelMode` — the SAME algebra `useListDocked` uses (`#state`), so the two tiers can
// never drift (the M10 correction).
//
// In an overlay regime (mobile OR narrow-desktop auto-overlay) a panel is a transient slide-over, not a
// persisted dock: the resolve reads the store's `openOverlayPanel` instead of `panelOverrides`, and
// toggle/collapse write `setOpenOverlayPanel` instead of `setPanelMode`. Wide is untouched.

import { useEffect } from "react";
import type { ModalSlotId, PanelMode, PanelName, SectionId } from "#state";
import {
  resolvePanelMode,
  setFocusMode,
  setMobileViewport,
  setNarrowViewport,
  setOpenOverlayPanel,
  setPanelMode,
  useActiveSection,
  useFocusMode,
  useOpenModal,
  useOpenOverlayPanel,
  usePanelOverride,
  useSectionRegistry,
} from "#state";
import { useIsMobileViewport, useIsShellNarrowViewport } from "./use-is-mobile-viewport.ts";

export interface ShellLayout {
  readonly activeSection: SectionId;
  readonly activeSectionLabel: string;
  readonly listMode: PanelMode;
  /** Does the active section HAVE a LIST pane at all (`SectionDefinition.panels.list`)? `false` ⇒ the
   *  topbar renders NO list toggle and `listMode` is pinned `collapsed` (H3 / arm L-b) — the shell never
   *  offers a door onto a surface that does not exist. */
  readonly listAvailable: boolean;
  readonly contextMode: PanelMode;
  /** Does the active section HAVE a CONTEXT pane at all (`SectionDefinition.panels.context`)? The LIST
   *  twin: `false` ⇒ NO detail-panel toggle and `contextMode` pinned `collapsed`. */
  readonly contextAvailable: boolean;
  /** Does the section have ANY panel? `false` ⇒ focus mode is a control over nothing (the section has no
   *  panels to hide), so the toggle does not render at all. */
  readonly anyPanelAvailable: boolean;
  /** The shell's focus flag, straight from the store (`#state`'s `focusMode`) — the ONE truth the toggle's
   *  label/icon/pressed state reads. It is NOT re-derived from the resolved modes: that derivation is what
   *  let the narrow auto-collapse read as "already in focus" and produced the item-20 desync. */
  readonly focusMode: boolean;
  readonly openModalId: ModalSlotId | null;
  /** True when either panel is floating in overlay mode — the dismiss scrim shows behind it. */
  readonly scrimVisible: boolean;
  /** In an overlay regime (mobile OR narrow-desktop — neither can resolve a dock): flips `openOverlayPanel`
   *  ephemeral open/close. In the wide regime: flips the persisted override docked ⇄ collapsed. */
  readonly togglePanel: (panel: PanelName) => void;
  /** Force one panel closed. Overlay regime: close the slide-over if it's the one open. Wide regime:
   *  collapse the persisted override. */
  readonly collapsePanel: (panel: PanelName) => void;
  /** Flip the focus flag: ON hides every panel (and closes any open slide-over), OFF returns the section
   *  to its own saved layout — which is simply the `panelOverrides` map focus never touched. Regime-free:
   *  the same one flip in every viewport (at ≤64rem this is what replaced a toggle whose label never
   *  changed and whose second click did nothing at all). */
  readonly toggleFocus: () => void;
}

export function useShellLayout(): ShellLayout {
  const registry = useSectionRegistry();
  const activeSection = useActiveSection();
  const isMobile = useIsMobileViewport();
  const isNarrow = useIsShellNarrowViewport();
  // Publishes both viewport regimes to #state so feature-tier projections (useListDocked) can branch on
  // them without importing these matchMedia-backed hooks (client-features-no-cross / no-raw-matchmedia).
  useEffect(() => {
    setMobileViewport(isMobile);
  }, [isMobile]);
  useEffect(() => {
    setNarrowViewport(isNarrow);
  }, [isNarrow]);
  const openOverlayPanel = useOpenOverlayPanel();
  const focusMode = useFocusMode();
  const listOverride = usePanelOverride(activeSection, "list");
  const contextOverride = usePanelOverride(activeSection, "context");

  // The raw override-or-default per panel, BEFORE the regime derivation — the input `resolvePanelMode`
  // takes (the resolve is the ONE place the regime is applied; nothing here second-guesses it).
  const activeDef = registry.get(activeSection);
  // A section that declares no LIST pane resolves `collapsed` UNCONDITIONALLY — a persisted override from
  // some other section's habit must never re-open a pane that does not exist (H3 / arm L-b).
  const listAvailable = activeDef.panels?.list !== "unavailable";
  const contextAvailable = activeDef.panels?.context !== "unavailable";
  const listDefault = listOverride ?? activeDef.panelDefaults.list;
  const contextDefault = contextOverride ?? activeDef.panelDefaults.context;
  // A panel is in an OVERLAY REGIME (ephemeral open/close via `openOverlayPanel`) whenever the viewport is
  // mobile or shell-narrow: `resolvePanelMode` cannot resolve "docked" in either, so a persisted dock flip
  // there writes a preference nothing can honour. It used to branch on the panel's raw default too, which is
  // exactly how the ≤64rem "Show detail panel" toggle went dead (2026-08-01): the `chats` CONTEXT pane
  // defaults `collapsed`, took the WIDE arm, wrote `docked`, and the resolve immediately re-collapsed it —
  // a visible control whose click produced nothing. The wide regime is untouched.
  const isOverlayRegime = (): boolean => isMobile || isNarrow;

  const listMode: PanelMode = listAvailable ? resolvePanelMode("list", listDefault, { isFocus: focusMode, isMobile, isNarrow, openOverlayPanel }) : "collapsed";
  const contextMode: PanelMode = contextAvailable
    ? resolvePanelMode("context", contextDefault, {
        isFocus: focusMode,
        isMobile,
        isNarrow,
        openOverlayPanel,
      })
    : "collapsed";

  const openModalId = useOpenModal();
  const activeSectionLabel = activeDef.rail.label;
  const anyPanelAvailable = listAvailable || contextAvailable;
  const scrimVisible = listMode === "overlay" || contextMode === "overlay";

  const togglePanel = (panel: PanelName): void => {
    if (isOverlayRegime()) {
      setOpenOverlayPanel(openOverlayPanel === panel ? null : panel);
      return;
    }
    const current = panel === "list" ? listMode : contextMode;
    setPanelMode(panel, current === "collapsed" ? "docked" : "collapsed");
  };

  const collapsePanel = (panel: PanelName): void => {
    if (isOverlayRegime()) {
      if (openOverlayPanel === panel) {
        setOpenOverlayPanel(null);
      }
      return;
    }
    setPanelMode(panel, "collapsed");
  };

  // One flip of the ONE flag — no panel writes in either direction, in any regime. Focus therefore cannot
  // clobber the section's saved dock preferences (entering used to write `collapsed` over them, and
  // exiting used to dock BOTH panels — re-opening a pane the user had collapsed before focus existed).
  const toggleFocus = (): void => {
    setFocusMode(!focusMode);
  };

  return {
    activeSection,
    activeSectionLabel,
    listMode,
    listAvailable,
    contextMode,
    contextAvailable,
    anyPanelAvailable,
    focusMode,
    openModalId,
    scrimVisible,
    togglePanel,
    collapsePanel,
    toggleFocus,
  };
}
