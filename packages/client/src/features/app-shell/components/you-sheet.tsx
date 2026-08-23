// YouSheet — the body of the mobile "You" bottom sheet, a BLIND PROJECTION over the SAME resolved chrome
// list the desktop rail and the mobile bar read (shell-chrome-unification.md §E-5 / §C). No second
// derivation: it reads `useChromeRegistry()` and projects each entry in its native sheet form —
//   · `rail.end` MODAL entries (theme, settings) → a row that opens the modal in the shared slot;
//   · `rail.end` WIDGET entries (the persona identity) → its own `body("sheet")` lens inline (this is
//     where mobile persona switching + the Account strip live — §B);
//   · `rail.nav` sections whose EFFECTIVE curation is `"sheet"` → a row that routes + closes the sheet
//     (effective, not declared: the bar swaps the current section in and the tab it displaces out, #484).
// Add a chrome entry once at the door → desktop rail, mobile bar, AND this sheet all pick it up. The sheet
// stays a REAL modal (the `you` Drawer slot — portal/focus-trap/scrim); CSS cannot fake that (§C).

import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Heading } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { ChromeEntry } from "#state";
import { closeModal, mobileBarCuration, openModal, setActiveSection, sheetOverflowChrome, useActiveSection, useChromeRegistry, useModalRegistry } from "#state";

/** The overflow group's heading id — the group points its `aria-labelledby` at it, so the heading names the
 *  block once instead of the group restating the word. Static: this sheet renders exactly one. */
const MORE_HEADING_ID = "you-sheet-more-heading";

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
  // The overflow list is the bar's EFFECTIVE curation, never the declared `mobile` field (#484): while you
  // stand in an overflow section it holds a bar slot and drops out of here, and the tab it displaced lands
  // here for the duration. ONE derivation shared with the bar (`mobileBarCuration`, #state) — the door and
  // its contents may not disagree about who is a tab, or a section becomes reachable from neither.
  const curation = mobileBarCuration(entries, activeSection);
  const overflowSections = entries.filter((e) => e.zone === "rail.nav" && curation.get(e.id) === "sheet");
  // …and the TOPBAR widgets a phone's row cannot afford (the notifications inbox). They declare the same
  // `mobile: "sheet"` curation the overflow sections do, and render their own sheet lens here. The filter
  // is SHARED (`sheetOverflowChrome`, #state) because the mobile bar's You tab badges these same entries'
  // `useBadge` counts — the door and its contents may never disagree about which widgets live here.
  const overflowChrome = sheetOverflowChrome(entries);
  // The ⌘K chip is desktop-shaped and sheds from the phone topbar (its row budget, side-eye P1) — so its
  // modal lands HERE, as a named row, DERIVED from the same `topbar.trail` trigger placement the chip reads.
  // Nothing is hardcoded and nothing becomes unreachable: the sheet is where every other overflow lives.
  const commandModal = useModalRegistry()
    .list()
    .find((m) => m.trigger.placement === "topbar.trail");

  return (
    <Stack data-slot="you-sheet" gap="section">
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

      {overflowChrome.map((entry) => (
        <SheetChromeEntry entry={entry} key={entry.id} />
      ))}

      {overflowSections.length === 0 ? null : (
        // "More" IS A HEADING (side-eye 2026-08-19 ARIA). It looked like one and announced as a paragraph, so
        // the sheet's overflow rows belonged to nothing a heading walk could find — the block above it is a
        // named `role="group"`, and this one had neither. `Heading` at the same four axes the band's own
        // micro-caps title uses, so the paint is unchanged; h3 because the drawer's Title is the h2.
        <Stack aria-labelledby={MORE_HEADING_ID} gap="row" role="group">
          <Heading id={MORE_HEADING_ID} level={3} voice="kicker">
            More
          </Heading>
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
