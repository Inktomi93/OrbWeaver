// AppShell — the four-region rail frame (UI-Arch §4.1): RAIL | LIST | CONTENT | CONTEXT. The shell
// tier — the ONE viewport-@media site (§4b axis 2) and the ONE compose-only-exempt painter (it paints
// the FRAME: raw grid/panel elements + token utilities are legal HERE, per §11.0). All the layout
// MECHANICS live in shell.css: the CSS-grid tracks, the §11.1 clamp-overlay (a panel's data-panel-mode
// drives docked/overlay/collapsed — a collapsed panel is `-translate-x-full`, zero width, no reflow),
// and the one @media (desktop columns ⇄ mobile top-bar + sheets). This file wires store → data attrs.
//
// DOMAIN-AGNOSTIC (the seam): AppShell knows RAIL/LIST/CONTENT/CONTEXT, never `Chat`/`Character`. It
// accepts a `sections` slot map keyed by SectionId; the ROUTE (home-page.tsx) composes the chat into
// the `chats` CONTENT slot (route→feature is legal; feature→feature is not). An unwired section falls
// back to an honest <SectionPlaceholder>, never a fabricated surface.

import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import type { ModalSlotId, SectionId } from "#state";
import {
  closeModal,
  openModal,
  setActiveSection,
  setPanelMode,
  toggleFocus,
  togglePanel,
} from "#state";
import { RegionAnchor } from "../anchors/region-anchor";
import { ModalHost } from "../components/modal-host";
import { PanelChrome } from "../components/panel-chrome";
import { Rail } from "../components/rail";
import { SectionPlaceholder } from "../components/section-placeholder";
import { ShellTopbar } from "../components/shell-topbar";
import { useDensity } from "../hooks/use-density";
import { useShellLayout } from "../hooks/use-shell-layout";
import "./shell.css";

/** A section's content for the two slots it can fill: the LIST panel and the CONTENT hero. */
export interface SectionSlot {
  readonly list?: ReactNode;
  readonly content?: ReactNode;
}

export interface AppShellProps {
  /** Per-section slots. Only `chats.content` is wired today (the chat pane); the rest fall back. */
  readonly sections: Partial<Record<SectionId, SectionSlot>>;
  /** The CONTEXT (right detail) panel body — undefined today (no entity-detail surface wired yet). */
  readonly contextPanel?: ReactNode;
  /** Route-composed modal bodies (id-keyed), rendered over the `MODAL_SLOTS` placeholders. The shell
   *  stays domain-agnostic: it forwards a ReactNode slot, never importing a feature (§4.1). */
  readonly modals?: Partial<Record<ModalSlotId, ReactNode>>;
}

export function AppShell({ sections, contextPanel, modals }: AppShellProps): ReactElement {
  const layout = useShellLayout();
  // The global density axis (§4) — stamped on the shell root; a compact override tightens spacing
  // tokens for the whole subtree (shell.css). Live-swappable via the appearance settings panel.
  const density = useDensity();
  const slot = sections[layout.activeSection];
  const listContent = slot?.list ?? (
    <SectionPlaceholder title={`${layout.activeSectionLabel} list`} />
  );
  const content = slot?.content ?? <SectionPlaceholder title={layout.activeSectionLabel} />;

  const dismissOverlays = (): void => {
    if (layout.listMode === "overlay") {
      setPanelMode("list", "collapsed");
    }
    if (layout.contextMode === "overlay") {
      setPanelMode("context", "collapsed");
    }
  };

  return (
    <TooltipProvider>
      <div
        className="shell-grid"
        data-list-mode={layout.listMode}
        data-context-mode={layout.contextMode}
        data-density={density}
      >
        <Rail
          activeSection={layout.activeSection}
          onSelectSection={setActiveSection}
          onOpenModal={openModal}
        />

        <PanelChrome
          panel="list"
          title={layout.activeSectionLabel}
          mode={layout.listMode}
          onCollapse={(): void => setPanelMode("list", "collapsed")}
        >
          <RegionAnchor region="list">{listContent}</RegionAnchor>
        </PanelChrome>

        <div className="shell-main">
          <ShellTopbar
            title={layout.activeSectionLabel}
            listMode={layout.listMode}
            contextMode={layout.contextMode}
            immersive={layout.immersive}
            onToggleList={(): void => togglePanel("list")}
            onToggleContext={(): void => togglePanel("context")}
            onToggleFocus={(): void => toggleFocus()}
            onOpenCommand={(): void => openModal("command")}
          />
          <div className="shell-content">
            <RegionAnchor region="content">{content}</RegionAnchor>
          </div>
        </div>

        <PanelChrome
          panel="context"
          title="Details"
          mode={layout.contextMode}
          onCollapse={(): void => setPanelMode("context", "collapsed")}
        >
          <RegionAnchor region="context">
            {contextPanel ?? (
              <SectionPlaceholder
                title="Details"
                description="Select something to see its details here."
              />
            )}
          </RegionAnchor>
        </PanelChrome>

        {layout.scrimVisible ? (
          <button
            type="button"
            className="shell-scrim"
            aria-label="Dismiss panel"
            onClick={dismissOverlays}
          />
        ) : null}

        <ModalHost openModal={layout.openModalId} modals={modals} onClose={closeModal} />
      </div>
    </TooltipProvider>
  );
}
