// Rail — the persistent thin nav column (UI-Arch §4.1 — the ~56px fixed RAIL). Renders, top to
// bottom: the Weave brand glyph → the section buttons (RAIL_SECTIONS) → a flex spacer → the footer
// modal triggers (theme · settings) → the avatar (account). Below the shell breakpoint it reflows
// to a TOP tab bar (shell.css `.shell-rail` + the one @media) — this component is layout-agnostic;
// the CSS owns the desktop-column ⇄ mobile-row axis. Pure registry render: a new section is a
// RAIL_SECTIONS row (rail-slots.ts), never bespoke JSX here.

import type { ReactElement } from "react";
import type { ModalSlotId, SectionId } from "#state";
import { ACCOUNT_ACTION, RAIL_ACTIONS, RAIL_SECTIONS } from "../lib/rail-slots";
import { RailButton } from "./rail-button";
import { WeaveGlyph } from "./weave-glyph";

export interface RailProps {
  readonly activeSection: SectionId;
  readonly onSelectSection: (id: SectionId) => void;
  readonly onOpenModal: (id: ModalSlotId) => void;
}

export function Rail({ activeSection, onSelectSection, onOpenModal }: RailProps): ReactElement {
  return (
    <nav className="shell-rail" aria-label="Primary">
      <div className="shell-rail-brand" aria-hidden="true">
        <WeaveGlyph size={26} className="text-primary" />
      </div>

      <div className="shell-rail-sections">
        {RAIL_SECTIONS.map((s) => (
          <RailButton
            key={s.id}
            label={s.label}
            icon={s.icon}
            active={s.id === activeSection}
            onClick={(): void => onSelectSection(s.id)}
          />
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
        <RailButton
          label={ACCOUNT_ACTION.label}
          icon={ACCOUNT_ACTION.icon}
          onClick={(): void => onOpenModal(ACCOUNT_ACTION.id)}
        />
      </div>
    </nav>
  );
}
