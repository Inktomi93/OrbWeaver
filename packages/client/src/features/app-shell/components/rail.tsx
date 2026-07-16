// Rail — the persistent nav. One component, two layouts chosen by shell.css @media: the desktop thin
// icon column (brand → section buttons → spacer → footer triggers → avatar), and the mobile bottom tab
// bar (a curated four: mobilePrimary sections + "You"). Both blocks are always in the DOM; shell.css
// shows exactly one per breakpoint. Pure registry render: a new section is a registered SectionDefinition.

import type { ReactElement, ReactNode } from "react";
import { WeaveGlyph } from "#lib";
import type { ModalSlotId, SectionId } from "#state";
import { SECTION_GROUPS, useModalRegistry, useSectionRegistry } from "#state";
import { RailButton } from "./rail-button";
import { RailTabButton } from "./rail-tab-button";

export interface RailProps {
  readonly activeSection: SectionId;
  readonly onSelectSection: (id: SectionId) => void;
  readonly onOpenModal: (id: ModalSlotId) => void;
  /** The route-composed rail-foot chip (`PersonaPanelSurface`) — the ONE renderer of the `avatar`
   *  placement; it owns the account-modal trigger itself, so Rail never derives an avatar button. */
  readonly railFoot?: ReactNode;
}

export function Rail({ activeSection, onSelectSection, onOpenModal, railFoot }: RailProps): ReactElement {
  // Pure registry render: sections derive from the section registry (order/grouping/mobile curation),
  // modal affordances derive from the modal registry via each def's `trigger.placement` — no parallel
  // maps. A new section is a registered SectionDefinition; a new rail modal a registered ModalDefinition.
  const sections = useSectionRegistry().list();
  const mobilePrimary = sections.filter((d) => d.rail.mobilePrimary === true);
  const modals = useModalRegistry().list();
  const footerModals = modals.filter((m) => m.trigger.placement === "rail-footer");
  const youModal = modals.find((m) => m.trigger.placement === "mobile-tab");
  return (
    <nav className="shell-rail" aria-label="Primary">
      <div className="shell-rail-desktop">
        <div className="shell-rail-brand" aria-hidden="true">
          <WeaveGlyph size={26} />
        </div>

        <div className="shell-rail-sections">
          {SECTION_GROUPS.map((group) => (
            <div className="shell-rail-group" key={group}>
              {sections
                .filter((d) => d.rail.group === group)
                .map((d) => (
                  <RailButton key={d.id} label={d.rail.label} icon={d.rail.icon} active={d.id === activeSection} onClick={(): void => onSelectSection(d.id)} />
                ))}
            </div>
          ))}
        </div>

        <div className="shell-rail-spacer" />

        <div className="shell-rail-actions">
          {footerModals.map((m) => (
            <RailButton key={m.id} label={m.trigger.label} icon={m.trigger.icon} onClick={(): void => onOpenModal(m.id)} />
          ))}
          <div className="shell-rail-avatar">{railFoot}</div>
        </div>
      </div>

      <div className="shell-rail-mobile">
        {mobilePrimary.map((d) => (
          <RailTabButton key={d.id} label={d.rail.label} icon={d.rail.icon} active={d.id === activeSection} onClick={(): void => onSelectSection(d.id)} />
        ))}
        {youModal === undefined ? null : (
          <RailTabButton label={youModal.trigger.label} icon={youModal.trigger.icon} onClick={(): void => onOpenModal(youModal.id)} />
        )}
      </div>
    </nav>
  );
}
