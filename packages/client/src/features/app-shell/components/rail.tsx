// Rail — the persistent nav (UI-Arch §4.1). ONE component, TWO layouts chosen by shell.css `@media`
// (§4b axis 2 — the reflow is CSS, not a second nav component): the DESKTOP thin icon column (`.shell-
// rail-desktop`) renders top-to-bottom the Weave brand → the section buttons (RAIL_SECTIONS) → a flex
// spacer → the footer modal triggers (theme · settings) → the avatar (account). The MOBILE bottom tab
// bar (`.shell-rail-mobile`, L6/J12 · D62 P3) renders a curated FOUR: the `mobilePrimary` sections
// (Chats · Characters · Corpus) + the "You" tab (`YOU_ACTION` → the `you` bottom sheet holding
// account/settings/theme + the overflow sections). Both blocks are always in the DOM; shell.css shows
// exactly one (`display:none` on the other per breakpoint) — no JS viewport branch, no duplicated nav.
// Pure registry render: a new section is a RAIL_SECTIONS row (rail-slots.ts), never bespoke JSX here.

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
      {/* DESKTOP — the thin icon column (shell.css hides this at the mobile breakpoint). */}
      <div className="shell-rail-desktop">
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
          {/* Avatar last — a `--spacing-row` top margin (shell.css) so it doesn't fuse with Settings.
              The persona switcher (route-composed via `railFoot`) OWNS this slot when present — a
              Discord-style account-switcher avatar+popover — replacing the static account button
              (FINAL-Persona §A.6). The `account` registry entry stays paired (reachable via the You
              sheet); undefined ⇒ the account button, so the shell degrades cleanly. */}
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

      {/* MOBILE — the curated bottom tab bar (shell.css hides this above the mobile breakpoint). The
          three `mobilePrimary` sections + "You"; theme/settings/avatar + the overflow sections all live
          in the You sheet (never the bar — 10 thumb targets is unusable, P3). */}
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
