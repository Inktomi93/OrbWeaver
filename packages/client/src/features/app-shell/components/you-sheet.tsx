// YouSheet — the body of the mobile "You" bottom sheet, a BLIND PROJECTION over the SAME resolved chrome
// list the desktop rail and the mobile bar read (shell-chrome-unification.md §E-5 / §C). No second
// derivation: it reads `useChromeRegistry()` and projects each entry in its native sheet form —
//   · `rail.end` MODAL entries (theme) → a row that opens the modal in the shared slot;
//   · `rail.end` WIDGET entries (the persona identity) → its own `body("sheet")` lens inline (this is
//     where mobile persona switching + the Account strip live — §B);
//   · a `rail.end` SECTION (Settings, since the config revamp #866 S1 put the section in the foot) → a row
//     that routes + closes the sheet, exactly like an overflow section — shown only while its EFFECTIVE
//     curation is `"sheet"` (standing in it, it holds a bar slot and the row would be a duplicate door);
//   · `rail.nav` sections whose EFFECTIVE curation is `"sheet"` → a row that routes + closes the sheet
//     (effective, not declared: the bar swaps the current section in and the tab it displaces out, #484);
//   · `topbar.trail` entries curated `mobile:"sheet"` → split by KIND (#1789): a MODAL/SECTION trigger is a
//     ROW and joins the row group (the ⌘K palette, desktop-shaped and shed off a 320px row), a WIDGET
//     renders its `body("sheet")` LENS as its own block below it (the notifications inbox).
// Add a chrome entry once at the door → desktop rail, mobile bar, AND this sheet all pick it up. The sheet
// stays a REAL modal (the `you` Drawer slot — portal/focus-trap/scrim); CSS cannot fake that (§C).

import { Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Heading } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { ChromeEntry, MobileCuration } from "#state";
import { closeModal, mobileBarCuration, openModal, setActiveSection, sheetOverflowChrome, useActiveSection, useChromeRegistry } from "#state";

/** The overflow group's heading id — the group points its `aria-labelledby` at it, so the heading names the
 *  block once instead of the group restating the word. Static: this sheet renders exactly one. */
const MORE_HEADING_ID = "you-sheet-more-heading";

/** One `rail.end` chrome entry, projected into the sheet. A component (not a bare map body) so `useVisible`
 *  is a top-level hook over the door-frozen list (the rail's `RailChromeEntry` precedent). A widget renders
 *  its own `body("sheet")` lens; a modal entry renders a row that opens it; a SECTION entry renders the same
 *  routing row the "More" list renders — while its effective curation is `"sheet"` (#484: standing in it,
 *  it holds a bar slot instead). `false` ⇒ render NOTHING. */
function SheetChromeEntry({ entry, active, mobile }: { readonly entry: ChromeEntry; readonly active: boolean; readonly mobile: MobileCuration }): ReactNode {
  const visible = entry.useVisible?.() ?? true;
  if (!visible) {
    return null;
  }
  const behavior = entry.behavior;
  if (behavior.kind === "widget") {
    return behavior.body("sheet");
  }
  if (entry.icon === undefined) {
    return null;
  }
  if (behavior.kind === "section") {
    if (mobile !== "sheet") {
      return null;
    }
    return (
      <ListRow
        clickable={true}
        leading={<Icon icon={entry.icon} size="sm" />}
        onClick={(): void => {
          setActiveSection(behavior.sectionId);
          closeModal();
        }}
        selected={active}
        title={entry.label}
      />
    );
  }
  return <ListRow clickable={true} leading={<Icon icon={entry.icon} size="sm" />} onClick={(): void => openModal(behavior.modalId)} title={entry.label} />;
}

/** The You bottom-sheet body: the `rail.end` footer chrome (the theme modal, the Settings section, the
 *  persona identity widget's sheet lens), then the `mobile:"sheet"` overflow sections. */
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
  // …and the TOPBAR entries a phone's row cannot afford (the notifications inbox, the ⌘K palette). They
  // declare the same `mobile: "sheet"` curation the overflow sections do. The filter is SHARED
  // (`sheetOverflowChrome`, #state) because the mobile bar's You tab badges these same entries' `useBadge`
  // counts — the door and its contents may never disagree about which entries live here.
  //
  // THE SPLIT IS BY BEHAVIOR KIND, NEVER BY ID (#1789). A ROW-shaped entry (a modal or section trigger:
  // icon + label + tap) joins the row group above, beside the footer chrome it reads exactly like; a WIDGET
  // renders its own `body("sheet")` LENS, which is a panel (the inbox), and panels get their own block
  // below. Stating it as a kind rule is the difference between a projection and an escape path with a new
  // hat: the ⌘K row used to be a hardcoded `useModalRegistry()` lookup for the one `topbar.trail`-placed
  // modal, sitting beside a blind projection that could have listed the same modal a second time.
  const overflowChrome = sheetOverflowChrome(entries);
  const overflowRows = overflowChrome.filter((e) => e.behavior.kind !== "widget");
  const overflowLenses = overflowChrome.filter((e) => e.behavior.kind === "widget");

  return (
    <Stack data-slot="you-sheet" gap="section">
      <Stack gap="row" aria-label="Account and settings" role="group">
        {overflowRows.map((entry) => (
          <SheetChromeEntry active={false} entry={entry} key={entry.id} mobile="sheet" />
        ))}
        {footerEntries.map((entry) => (
          <SheetChromeEntry
            active={entry.behavior.kind === "section" && entry.behavior.sectionId === activeSection}
            entry={entry}
            key={entry.id}
            mobile={curation.get(entry.id) ?? "sheet"}
          />
        ))}
      </Stack>

      {overflowLenses.map((entry) => (
        <SheetChromeEntry active={false} entry={entry} key={entry.id} mobile={curation.get(entry.id) ?? "sheet"} />
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
