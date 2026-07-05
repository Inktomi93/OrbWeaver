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
// back to an honest <SectionPlaceholder>, never a fabricated surface. The `header`/`contextHeader`
// ReactNode slots (UIP-202/204) are route-composed too — the topbar identity + the CONTEXT detail
// header are domain data the ROUTE supplies; the shell only forwards the node (falls back to the
// section name / "Details").

import { Text } from "@orb/ui/text";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import type { ModalSlotId, SectionId } from "#state";
import { closeModal, openModal, setActiveSection, setPanelMode } from "#state";
import { RegionAnchor } from "../anchors/region-anchor";
import { ModalHost } from "../components/modal-host";
import { PanelChrome } from "../components/panel-chrome";
import { Rail } from "../components/rail";
import { SectionPlaceholder } from "../components/section-placeholder";
import { ShellTopbar } from "../components/shell-topbar";
import { useDensity } from "../hooks/use-density";
import { useShellLayout } from "../hooks/use-shell-layout";
import { SECTION_PLACEHOLDER_COPY } from "../lib/section-placeholder-copy";
import "./shell.css";

/** A section's content for the two slots it can fill: the LIST panel and the CONTENT hero. */
export interface SectionSlot {
  readonly list?: ReactNode;
  readonly content?: ReactNode;
}

export interface AppShellProps {
  /** Per-section slots. Only `chats.content` is wired today (the chat pane); the rest fall back. */
  readonly sections: Partial<Record<SectionId, SectionSlot>>;
  /** Route-composed topbar identity header (UIP-202) — the active chat's avatar + title. Undefined ⇒
   *  the topbar shows the active section name (the draft/none fallback). */
  readonly header?: ReactNode;
  /** The CONTEXT (right detail) panel body — undefined today (no entity-detail surface wired yet). */
  readonly contextPanel?: ReactNode;
  /** Route-composed CONTEXT panel header (UIP-204) — the active entity's detail header. Undefined ⇒
   *  the "Details" fallback. */
  readonly contextHeader?: ReactNode;
  /** Route-composed modal bodies (id-keyed), rendered over the `MODAL_SLOTS` placeholders. The shell
   *  stays domain-agnostic: it forwards a ReactNode slot, never importing a feature (§4.1). */
  readonly modals?: Partial<Record<ModalSlotId, ReactNode>>;
}

export function AppShell({
  sections,
  header,
  contextPanel,
  contextHeader,
  modals,
}: AppShellProps): ReactElement {
  const layout = useShellLayout();
  // The global density axis (§4) — stamped on the shell root; a compact override tightens spacing
  // tokens for the whole subtree (shell.css). Live-swappable via the appearance settings panel.
  const density = useDensity();
  const slot = sections[layout.activeSection];
  // The active section's distinct placeholder copy (J10 — one home in SECTION_PLACEHOLDER_COPY); the
  // Weave decoration marks it as the sanctioned teaching moment. Route-composed sections (chats/characters)
  // never fall through to these; the three unbuilt hubs (corpus/refinery/analytics) read distinct now.
  const placeholderCopy = SECTION_PLACEHOLDER_COPY[layout.activeSection];
  // Weave rides the CONTENT placeholder only (DESIGN.md: at most ONE Weave per screen) — the LIST
  // placeholder keeps the muted sparkle so a user-docked LIST never paints a second glyph.
  const listContent = slot?.list ?? <SectionPlaceholder title={`${placeholderCopy.title} list`} />;
  const content = slot?.content ?? (
    <SectionPlaceholder
      title={placeholderCopy.title}
      description={placeholderCopy.description}
      weave={true}
    />
  );

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

        {/* LIST panel — no PanelChrome header (UIP-202): the list surface owns its title, the topbar
            toggle owns the collapse. */}
        <PanelChrome panel="list" mode={layout.listMode}>
          <RegionAnchor region="list">{listContent}</RegionAnchor>
        </PanelChrome>

        <div className="shell-main">
          <ShellTopbar
            title={layout.activeSectionLabel}
            header={header}
            listMode={layout.listMode}
            contextMode={layout.contextMode}
            immersive={layout.immersive}
            onToggleList={(): void => layout.togglePanel("list")}
            onToggleContext={(): void => layout.togglePanel("context")}
            onToggleFocus={layout.toggleFocus}
            onOpenCommand={(): void => openModal("command")}
          />
          <div className="shell-content">
            <RegionAnchor region="content">{content}</RegionAnchor>
          </div>
        </div>

        <PanelChrome
          panel="context"
          header={
            contextHeader ?? (
              <Text size="label" weight="medium" tone="muted">
                Details
              </Text>
            )
          }
          collapseLabel="Collapse detail panel"
          mode={layout.contextMode}
          onCollapse={(): void => setPanelMode("context", "collapsed")}
        >
          <RegionAnchor region="context">
            {contextPanel ?? (
              <SectionPlaceholder
                title="Details"
                description="Select something to see its details here."
                weave={true}
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
