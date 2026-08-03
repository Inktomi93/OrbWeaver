// Rail — the persistent nav. ONE component rendering ONE flat DOM list from the assembled chrome registry
// (shell-chrome-unification.md §C, the single-DOM cutover): the `rail.nav` section entries grouped by
// `group` (SECTION_GROUPS divider order) → the spacer → the `rail.end` footer-modal entries + the persona
// identity widget. shell.css reflows that one list — the desktop thin icon column and the mobile bottom tab
// bar are the SAME DOM under one `@media`, with `data-mobile="sheet"` entries hidden on the bar
// (`display:none`, which also removes them from the a11y tree) and the overflow "You" tab shown. Pure
// registry render: a new rail affordance is a registered chrome entry (section / modal trigger / widget),
// never new DOM here — the persona avatar is `personaChrome` (§E-6, the old `railFoot` prop is dead).

import { Button } from "@orb/ui/button";
import { FOCUS_RING_ON_SIDEBAR } from "@orb/ui/lib";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import { WeaveGlyph } from "#lib";
import type { ChromeEntry, ModalSlotId, SectionId } from "#state";
import { SECTION_GROUPS, useChromeRegistry, useModalRegistry } from "#state";
import { RailButton } from "./rail-button.tsx";

export interface RailProps {
  readonly activeSection: SectionId;
  readonly onSelectSection: (id: SectionId) => void;
  readonly onOpenModal: (id: ModalSlotId) => void;
}

/** One chrome entry as a rail affordance. A component (not a bare map body) so `useVisible` is a top-level
 *  hook over the door-frozen list (the topbar `TrailWidget` precedent). The behavior union dispatches:
 *  a `section` entry navigates + carries active state, a `modal` entry opens its modal, a `widget` entry
 *  renders its own `body("bar")` wrapped so its mobile curation (`data-mobile`) hides it off the bar the
 *  same way a section/modal button's does. `false` from `useVisible` ⇒ render NOTHING (no gap). */
function RailChromeEntry({
  entry,
  activeSection,
  onSelectSection,
  onOpenModal,
}: {
  readonly entry: ChromeEntry;
  readonly activeSection: SectionId;
  readonly onSelectSection: (id: SectionId) => void;
  readonly onOpenModal: (id: ModalSlotId) => void;
}): ReactNode {
  const visible = entry.useVisible?.() ?? true;
  if (!visible) {
    return null;
  }
  const behavior = entry.behavior;
  if (behavior.kind === "widget") {
    // A live widget (the persona avatar) renders its own DOM, so it can't carry `data-mobile` on a
    // RailButton — wrap it so the mobile `@media` hides a `mobile:"sheet"` widget off the bar (it
    // projects into the You sheet via `body("sheet")` instead).
    return (
      <div className="shell-rail-widget" data-mobile={entry.mobile ?? "sheet"}>
        {behavior.body("bar")}
      </div>
    );
  }
  // A section/modal rail entry always carries an icon (derived from `rail.icon` / `trigger.icon`); the
  // ChromeEntry type widens it to optional for the widget arm, so narrow it here before rendering a button.
  if (entry.icon === undefined) {
    return null;
  }
  const active = behavior.kind === "section" && behavior.sectionId === activeSection;
  const onClick = behavior.kind === "section" ? (): void => onSelectSection(behavior.sectionId) : (): void => onOpenModal(behavior.modalId);
  return <RailButton label={entry.label} icon={entry.icon} active={active} onClick={onClick} mobile={entry.mobile ?? "sheet"} />;
}

/** The BRAND cell as a real affordance (home-section-spec §4.1). The Weave glyph was a decorative
 *  `aria-hidden` div; when a section claims the `rail.brand` zone it becomes a named button that navigates
 *  there, active-skinned and `aria-current`-marked like every other rail button. AppShell still never
 *  spells a section id — it renders the entry the registry derived from that section's own `rail`
 *  declaration. `.shell-rail-brand` IS the button here, so the cell's chrome-row geometry (height, the
 *  shared bottom hairline, the elevation ramp) is unchanged and the active tint spans the full cell. */
function RailBrand({
  entry,
  active,
  onSelectSection,
}: {
  readonly entry: ChromeEntry;
  readonly active: boolean;
  readonly onSelectSection: (id: SectionId) => void;
}): ReactNode {
  const visible = entry.useVisible?.() ?? true;
  if (!visible || entry.behavior.kind !== "section") {
    return null;
  }
  const sectionId = entry.behavior.sectionId;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-current={active ? "page" : undefined}
            aria-label={entry.label}
            className={`shell-rail-brand shell-rail-brand-button ${FOCUS_RING_ON_SIDEBAR}`}
            data-active={active ? "" : undefined}
            intent="ghost"
            onClick={(): void => onSelectSection(sectionId)}
          >
            {/* The BUTTON carries the name (`aria-label`), so the glyph inside it is decoration — a nested
                role="img" would announce a second, competing name for one control. */}
            <WeaveGlyph decorative={true} size={BRAND_GLYPH_SIZE} />
          </Button>
        }
      />
      <TooltipPopup side="right">{entry.label}</TooltipPopup>
    </Tooltip>
  );
}

const BRAND_GLYPH_SIZE = 26;

export function Rail({ activeSection, onSelectSection, onOpenModal }: RailProps): ReactElement {
  const entries = useChromeRegistry().list();
  const navEntries = entries.filter((e) => e.zone === "rail.nav");
  const endEntries = entries.filter((e) => e.zone === "rail.end");
  // At most one section claims the brand cell; with none, the glyph stays the decoration it always was.
  const brandEntry = entries.find((e) => e.zone === "rail.brand");
  // The mobile-only "You" overflow tab (its projection is the You sheet, §E-5) — its trigger DERIVES from
  // the modal registry (no parallel id), the same mechanism the twin-DOM rail used.
  const youModal = useModalRegistry()
    .list()
    .find((m) => m.trigger.placement === "mobile-tab");
  // Does the ACTIVE section live in the You sheet rather than on the mobile bar (F-15)? `mobile` defaults
  // to `"sheet"` exactly as `RailChromeEntry` reads it, so the two can never disagree about a curation.
  const activeIsSheetSection = navEntries.some(
    (e) => e.behavior.kind === "section" && e.behavior.sectionId === activeSection && (e.mobile ?? "sheet") === "sheet",
  );
  return (
    <nav className="shell-rail" aria-label="Primary">
      {brandEntry === undefined ? (
        <div className="shell-rail-brand" aria-hidden="true">
          <WeaveGlyph size={BRAND_GLYPH_SIZE} />
        </div>
      ) : (
        <RailBrand
          active={brandEntry.behavior.kind === "section" && brandEntry.behavior.sectionId === activeSection}
          entry={brandEntry}
          onSelectSection={onSelectSection}
        />
      )}

      {/* The brand cell is `display:none` below 48rem, so the brand section rides the mobile bar as its
          FIRST tab instead (home-section-spec §4.3) — the `mobileOnly` mechanism the You tab already uses.
          Exactly one of the two is ever displayed, so there is no duplicate affordance in the a11y tree. */}
      {brandEntry?.icon === undefined || brandEntry.behavior.kind !== "section" ? null : (
        <RailButton
          active={brandEntry.behavior.sectionId === activeSection}
          icon={brandEntry.icon}
          label={brandEntry.label}
          mobile="tab"
          mobileOnly={true}
          onClick={(): void => {
            if (brandEntry.behavior.kind === "section") {
              onSelectSection(brandEntry.behavior.sectionId);
            }
          }}
        />
      )}

      <div className="shell-rail-sections">
        {SECTION_GROUPS.map((group) => (
          <div className="shell-rail-group" key={group}>
            {navEntries
              .filter((e) => e.group === group)
              .map((e) => (
                <RailChromeEntry key={e.id} entry={e} activeSection={activeSection} onSelectSection={onSelectSection} onOpenModal={onOpenModal} />
              ))}
          </div>
        ))}
      </div>

      <div className="shell-rail-spacer" />

      <div className="shell-rail-actions">
        {endEntries.map((e) => (
          <RailChromeEntry key={e.id} entry={e} activeSection={activeSection} onSelectSection={onSelectSection} onOpenModal={onOpenModal} />
        ))}
      </div>

      {/* THE YOU TAB CARRIES `aria-current` FOR ITS SECTIONS (side-eye F-15). Standing in a
          `mobile:"sheet"` section (Corpus · World Info · Presets · Refinery · Analytics), the mobile bar
          marked NOTHING current: the section's own rail button DOES carry `aria-current="page"` + the amber
          skin, but it is `display:none` on the bar (it is the desktop rail's copy), and the four visible
          tabs are all other sections. So a screen-reader user got a nav landmark with zero current markers
          and a sighted user saw four unlit tabs while standing in a fifth place (Nielsen #1).
          The You tab is that section's REPRESENTATIVE on the bar — its sheet is the only door to it — so
          it wears the state. Derived from the active section's OWN curation, never a hardcoded id list: a
          section that flips to `mobile:"tab"` stops feeding this the same day it starts feeding the bar. */}
      {youModal === undefined ? null : (
        <RailButton
          active={activeIsSheetSection}
          icon={youModal.trigger.icon}
          label={youModal.trigger.label}
          mobile="tab"
          mobileOnly={true}
          onClick={(): void => onOpenModal(youModal.id)}
        />
      )}
    </nav>
  );
}
