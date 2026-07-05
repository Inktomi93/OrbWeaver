// useShellLayout — the shell's view-model: bundles the narrow shell-store reads + the derived bits
// app-shell.tsx renders (the active section's label, whether a dismiss scrim is showing) so the
// surface stays declarative. Each underlying read is its own store selector (narrow subscriptions —
// chrome re-renders only on the slice it uses).

import type { ModalSlotId, PanelMode, SectionId } from "#state";
import { useActiveSection, useIsImmersive, useOpenModal, usePanelMode } from "#state";
import { RAIL_SECTIONS } from "../lib/rail-slots";

export interface ShellLayout {
  readonly activeSection: SectionId;
  readonly activeSectionLabel: string;
  readonly listMode: PanelMode;
  readonly contextMode: PanelMode;
  /** Both panels collapsed = immersive-ST (UI-Arch §4.1) — drives the focus-toggle affordance. */
  readonly immersive: boolean;
  readonly openModalId: ModalSlotId | null;
  /** True when either panel is floating in overlay mode — the dismiss scrim shows behind it. */
  readonly scrimVisible: boolean;
}

export function useShellLayout(): ShellLayout {
  const activeSection = useActiveSection();
  const listMode = usePanelMode("list");
  const contextMode = usePanelMode("context");
  const immersive = useIsImmersive();
  const openModalId = useOpenModal();
  const activeSectionLabel =
    RAIL_SECTIONS.find((s) => s.id === activeSection)?.label ?? activeSection;
  const scrimVisible = listMode === "overlay" || contextMode === "overlay";
  return {
    activeSection,
    activeSectionLabel,
    listMode,
    contextMode,
    immersive,
    openModalId,
    scrimVisible,
  };
}
