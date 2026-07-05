// Rail — the persistent thin nav column (UI-Arch §4.1 — the ~56px fixed RAIL). Renders, top to
// bottom: the Weave brand glyph → the section buttons (RAIL_SECTIONS) → a flex spacer → the footer
// modal triggers (theme · settings) → the avatar (account). Below the shell breakpoint it reflows
// to a TOP tab bar (shell.css `.shell-rail` + the one @media) — this component is layout-agnostic;
// the CSS owns the desktop-column ⇄ mobile-row axis. Pure registry render: a new section is a
// RAIL_SECTIONS row (rail-slots.ts), never bespoke JSX here.

import type { ReactElement } from "react";
import { WeaveGlyph } from "#lib";
import type { ModalSlotId, SectionId } from "#state";
import { ACCOUNT_ACTION, RAIL_ACTIONS, RAIL_SECTIONS, SECTION_GROUPS } from "../lib/rail-slots";
import { RailButton } from "./rail-button";

export interface RailProps {
  readonly activeSection: SectionId;
  readonly onSelectSection: (id: SectionId) => void;
  readonly onOpenModal: (id: ModalSlotId) => void;
}

export function Rail({ activeSection, onSelectSection, onOpenModal }: RailProps): ReactElement {
  return (
    <nav className="shell-rail" aria-label="Primary">
      {/* Brand: the Weave glyph ALONE — no active/hover box, muted color from shell.css (UIP-201). */}
      <div className="shell-rail-brand" aria-hidden="true">
        <WeaveGlyph size={26} />
      </div>

      {/* Sections grouped by SECTION_GROUPS (primary · authoring · insight) — the `--spacing-section`
          gap between groups is the divider (UIP-201 / §4.1); `--spacing-field` within a group. */}
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
        {/* Avatar last — a `--spacing-row` top margin (shell.css) so it doesn't fuse with Settings. */}
        <div className="shell-rail-avatar">
          <RailButton
            label={ACCOUNT_ACTION.label}
            icon={ACCOUNT_ACTION.icon}
            onClick={(): void => onOpenModal(ACCOUNT_ACTION.id)}
          />
        </div>
      </div>
    </nav>
  );
}
