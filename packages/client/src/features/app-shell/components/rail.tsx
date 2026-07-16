// Rail — the persistent nav. ONE component rendering ONE flat DOM list from the assembled chrome registry
// (shell-chrome-unification.md §C, the single-DOM cutover): the `rail.nav` section entries grouped by
// `group` (SECTION_GROUPS divider order) → the spacer → the `rail.end` footer-modal entries + the persona
// identity widget. shell.css reflows that one list — the desktop thin icon column and the mobile bottom tab
// bar are the SAME DOM under one `@media`, with `data-mobile="sheet"` entries hidden on the bar
// (`display:none`, which also removes them from the a11y tree) and the overflow "You" tab shown. Pure
// registry render: a new rail affordance is a registered chrome entry (section / modal trigger / widget),
// never new DOM here — the persona avatar is `personaChrome` (§E-6, the old `railFoot` prop is dead).

import type { ReactElement, ReactNode } from "react";
import { WeaveGlyph } from "#lib";
import type { ChromeEntry, ModalSlotId, SectionId } from "#state";
import { SECTION_GROUPS, useChromeRegistry, useModalRegistry } from "#state";
import { RailButton } from "./rail-button";

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

export function Rail({ activeSection, onSelectSection, onOpenModal }: RailProps): ReactElement {
  const entries = useChromeRegistry().list();
  const navEntries = entries.filter((e) => e.zone === "rail.nav");
  const endEntries = entries.filter((e) => e.zone === "rail.end");
  // The mobile-only "You" overflow tab (its projection is the You sheet, §E-5) — its trigger DERIVES from
  // the modal registry (no parallel id), the same mechanism the twin-DOM rail used.
  const youModal = useModalRegistry()
    .list()
    .find((m) => m.trigger.placement === "mobile-tab");
  return (
    <nav className="shell-rail" aria-label="Primary">
      <div className="shell-rail-brand" aria-hidden="true">
        <WeaveGlyph size={26} />
      </div>

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

      {youModal === undefined ? null : (
        <RailButton label={youModal.trigger.label} icon={youModal.trigger.icon} mobile="tab" mobileOnly={true} onClick={(): void => onOpenModal(youModal.id)} />
      )}
    </nav>
  );
}
