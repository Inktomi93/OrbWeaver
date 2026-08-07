// YouSheet — the body of the mobile "You" bottom sheet, a BLIND PROJECTION over the SAME resolved chrome
// list the desktop rail and the mobile bar read (shell-chrome-unification.md §E-5 / §C). No second
// derivation: it reads `useChromeRegistry()` and projects each entry in its native sheet form —
//   · `rail.end` MODAL entries (theme, settings) → a row that opens the modal in the shared slot;
//   · `rail.end` WIDGET entries (the persona identity) → its own `body("sheet")` lens inline (this is
//     where mobile persona switching + the Account strip live — §B);
//   · `rail.nav` sections curated `mobile:"sheet"` → a row that routes + closes the sheet.
// Add a chrome entry once at the door → desktop rail, mobile bar, AND this sheet all pick it up. The sheet
// stays a REAL modal (the `you` Drawer slot — portal/focus-trap/scrim); CSS cannot fake that (§C).

import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { ChromeEntry } from "#state";
import { closeModal, openModal, setActiveSection, useActiveSection, useChromeRegistry, useModalRegistry } from "#state";

/** One `rail.end` chrome entry, projected into the sheet. A component (not a bare map body) so `useVisible`
 *  is a top-level hook over the door-frozen list (the rail's `RailChromeEntry` precedent). A widget renders
 *  its own `body("sheet")` lens; a modal entry renders a row that opens it. `false` ⇒ render NOTHING. */
function SheetChromeEntry({ entry }: { readonly entry: ChromeEntry }): ReactNode {
  const visible = entry.useVisible?.() ?? true;
  if (!visible) {
    return null;
  }
  const behavior = entry.behavior;
  if (behavior.kind === "widget") {
    return behavior.body("sheet");
  }
  // A `rail.end` entry is a widget or a modal (sections never land here); a modal row opens the shared slot.
  if (behavior.kind !== "modal" || entry.icon === undefined) {
    return null;
  }
  return <ListRow clickable={true} leading={<Icon icon={entry.icon} size="sm" />} onClick={(): void => openModal(behavior.modalId)} title={entry.label} />;
}

/** The You bottom-sheet body: the `rail.end` footer chrome (theme/settings modals + the persona identity
 *  widget's sheet lens), then the `mobile:"sheet"` overflow sections. */
export function YouSheet(): ReactElement {
  const activeSection = useActiveSection();
  const entries = useChromeRegistry().list();
  const footerEntries = entries.filter((e) => e.zone === "rail.end");
  const overflowSections = entries.filter((e) => e.zone === "rail.nav" && e.mobile === "sheet");
  // The ⌘K chip is desktop-shaped and sheds from the phone topbar (its row budget, side-eye P1) — so its
  // modal lands HERE, as a named row, DERIVED from the same `topbar.trail` trigger placement the chip reads.
  // Nothing is hardcoded and nothing becomes unreachable: the sheet is where every other overflow lives.
  const commandModal = useModalRegistry()
    .list()
    .find((m) => m.trigger.placement === "topbar.trail");

  return (
    <Stack gap="section">
      <Stack gap="row" aria-label="Account and settings" role="group">
        {commandModal === undefined ? null : (
          <ListRow
            clickable={true}
            leading={<Icon icon={commandModal.trigger.icon} size="sm" />}
            onClick={(): void => openModal(commandModal.id)}
            title={commandModal.trigger.label}
          />
        )}
        {footerEntries.map((entry) => (
          <SheetChromeEntry key={entry.id} entry={entry} />
        ))}
      </Stack>

      {overflowSections.length === 0 ? null : (
        <Stack gap="row">
          <Text size="micro" weight="semibold" tone="muted" transform="caps">
            More
          </Text>
          {overflowSections.map((entry) => (
            <ListRow
              key={entry.id}
              clickable={true}
              leading={entry.icon === undefined ? undefined : <Icon icon={entry.icon} size="sm" />}
              onClick={(): void => {
                if (entry.behavior.kind === "section") {
                  setActiveSection(entry.behavior.sectionId);
                  closeModal();
                }
              }}
              selected={entry.behavior.kind === "section" && entry.behavior.sectionId === activeSection}
              title={entry.label}
            />
          ))}
        </Stack>
      )}

      {/* THE DEAD BAND AT THE FOOT (side-eye F-16). The drawer is `side="bottom"` — `inset-x-0 bottom-0` —
          so its LAST row sits flush against the viewport floor, which is exactly where the tab bar's `You`
          hit box (105×56, bottom-anchored) was. Opening the sheet therefore parked a nav row directly under
          the finger that had just tapped: a slightly long press or an accidental double-tap fired an
          unintended navigation, and the row painted its active fill while a different row carried the
          current-amber — two rows reading as selected at once.
          The band is exactly the bar's own height (`--dimension-rail`, which IS "the mobile bottom-tab-bar
          height" per the token's description), so it clears the tap point by construction rather than by a
          number somebody picked. `aria-hidden` + empty: it is a keep-out zone, not content. */}
      <div aria-hidden={true} className="h-(--dimension-rail) shrink-0" data-slot="you-sheet-tap-guard" />
    </Stack>
  );
}
