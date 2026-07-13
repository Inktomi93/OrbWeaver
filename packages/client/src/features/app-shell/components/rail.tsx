// Rail — the persistent nav. One component, two layouts chosen by shell.css @media: the desktop thin
// icon column (brand → section buttons → spacer → footer triggers → avatar), and the mobile bottom tab
// bar (a curated four: mobilePrimary sections + "You"). Both blocks are always in the DOM; shell.css
// shows exactly one per breakpoint. Pure registry render: a new section is a RAIL_SECTIONS row.

import type { ReactElement, ReactNode } from "react";
import { WeaveGlyph } from "#lib";
import type { ModalSlotId, SectionId } from "#state";
import {
  ACCOUNT_ACTION,
  MOBILE_PRIMARY_SECTIONS,
  RAIL_ACTIONS,
  RAIL_SECTIONS,
  SECTION_GROUPS,
  YOU_ACTION,
} from "../lib/rail-slots";
import { RailButton } from "./rail-button";
import { RailTabButton } from "./rail-tab-button";

export interface RailProps {
  readonly activeSection: SectionId;
  readonly onSelectSection: (id: SectionId) => void;
  readonly onOpenModal: (id: ModalSlotId) => void;
  /** Route-composed rail-foot chip (the persona switcher). When supplied it replaces the static
   *  account avatar; undefined ⇒ the account modal button (backward-compatible). */
  readonly railFoot?: ReactNode;
}

export function Rail({
  activeSection,
  onSelectSection,
  onOpenModal,
  railFoot,
}: RailProps): ReactElement {
  return (
    <nav className="shell-rail" aria-label="Primary">
      <div className="shell-rail-desktop">
        <div className="shell-rail-brand" aria-hidden="true">
          <WeaveGlyph size={26} />
        </div>

        <div className="shell-rail-sections">
          {SECTION_GROUPS.map((group) => (
            <div className="shell-rail-group" key={group}>
              {RAIL_SECTIONS.filter((s) => s.group === group).map((s) => (
                <RailButton
                  key={s.id}
                  label={s.label}
                  icon={s.icon}
                  active={s.id === activeSection}
                  onClick={(): void => onSelectSection(s.id)}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="shell-rail-spacer" />

        <div className="shell-rail-actions">
          {RAIL_ACTIONS.map((a) => (
            <RailButton
              key={a.id}
              label={a.label}
              icon={a.icon}
              onClick={(): void => onOpenModal(a.id)}
            />
          ))}
          <div className="shell-rail-avatar">
            {railFoot ?? (
              <RailButton
                label={ACCOUNT_ACTION.label}
                icon={ACCOUNT_ACTION.icon}
                onClick={(): void => onOpenModal(ACCOUNT_ACTION.id)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="shell-rail-mobile">
        {MOBILE_PRIMARY_SECTIONS.map((s) => (
          <RailTabButton
            key={s.id}
            label={s.label}
            icon={s.icon}
            active={s.id === activeSection}
            onClick={(): void => onSelectSection(s.id)}
          />
        ))}
        <RailTabButton
          label={YOU_ACTION.label}
          icon={YOU_ACTION.icon}
          onClick={(): void => onOpenModal(YOU_ACTION.id)}
        />
      </div>
    </nav>
  );
}
