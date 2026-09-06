// Rail — the persistent nav. ONE component rendering ONE flat DOM list from the assembled chrome registry
// (shell-chrome-unification.md §C, the single-DOM cutover): the `rail.nav` section entries grouped by
// `group` (SECTION_GROUPS divider order) → the spacer → the `rail.end` footer-modal entries + the persona
// identity widget. shell.css reflows that one list — the desktop thin icon column and the mobile bottom tab
// bar are the SAME DOM under one `@media`, with `data-mobile="sheet"` entries hidden on the bar
// (`display:none`, which also removes them from the a11y tree) and the overflow "You" tab shown. Pure
// registry render: a new rail affordance is a registered chrome entry (section / modal trigger / widget),
// never new DOM here — the persona avatar is `personaChrome` (§E-6, the old `railFoot` prop is dead).
// The bar's curation is EFFECTIVE, not declared (`mobileBarCuration`, #state, #484): standing in an
// overflow section swaps it into the last standing tab's slot, so exactly one VISIBLE tab is ever current.
//
// ONE NAMED EXCEPTION TO "SAME DOM" — the brand/Home affordance (#1790, see the block comment at its
// second render site below for the receipts): it is two DOM nodes (`RailBrand` desktop, `RailButton`
// mobile), CSS-toggled so exactly one is ever exposed at a given width. Every other rail entry reflows a
// single node; brand does not, because its two presentations are genuinely different chrome-row contracts
// (see below) rather than one control resized.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { FOCUS_RING_ON_SIDEBAR } from "@orb/ui/lib";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import { WeaveGlyph } from "#lib";
import type { ChromeEntry, MobileCuration, ModalSlotId, SectionId } from "#state";
import { mobileBarCuration, SECTION_GROUPS, sheetOverflowChrome, useChromeRegistry, useModalRegistry } from "#state";
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
  mobile,
  onSelectSection,
  onOpenModal,
}: {
  readonly entry: ChromeEntry;
  readonly activeSection: SectionId;
  /** The entry's EFFECTIVE phone fate for the current section — `mobileBarCuration`'s verdict, never the
   *  declared `entry.mobile`: standing in an overflow section swaps it onto the bar and folds the tab it
   *  displaces into the You sheet (#484). */
  readonly mobile: MobileCuration;
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
      <div className="shell-rail-widget" data-mobile={mobile}>
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
  const modalIdProp = behavior.kind === "modal" ? { modalId: behavior.modalId } : {};
  return <RailButton active={active} icon={entry.icon} label={entry.label} mobile={mobile} {...modalIdProp} onClick={onClick} />;
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

/** The id of ONE sheet-hosted entry's spoken count. The You tab `aria-describedby`s every one of them: an id
 *  REFERENCE is what lets the tab say the count without the count ever leaving its per-entry hook (see
 *  `SheetBadgeCount`). An id whose node is absent — a gated entry, or a zero count — is ignored by the name
 *  computation, so the description is exactly the counts that exist. */
function sheetBadgeId(entryId: string): string {
  return `shell-rail-sheet-badge-${entryId}`;
}

/**
 * ONE sheet-hosted widget's waiting-count, projected onto the You TAB (side-eye home re-score 2026-08-18,
 * #214 residue). A widget curated `mobile: "sheet"` leaves the phone's chrome for the sheet — which gave
 * the notifications inbox room and cost it its only phone-side tell: the desktop bell badges its unread
 * count, and a phone showed NOTHING anywhere, so a user was never told there was something to look at.
 *
 * A COMPONENT PER ENTRY, never a scalar folded at the call site: `useVisible`/`useBadge` are hooks over the
 * door-frozen list, which is legal exactly once per entry at a component top level (the `RailChromeEntry`
 * precedent). That is also why the count does not reach the tab's `aria-label` — a name is a string the
 * parent must hold — so the badge carries its own live announcement instead: `role="status"` speaks
 * "N unread" the moment the read lands, which is the AT equivalent of a badge appearing, and the sheet's
 * own inbox heading ("Notifications (N unread)") names the count for anyone who opens it.
 *
 * THE NAME HALF OF THAT RULING SURVIVES — ITS INPUT CHANGED (#1129). A name is still a string the parent
 * must hold, and the count still never leaves the hook that owns it. What changed is that being spoken does
 * not require being a name: the tab `aria-describedby`s this node by ID, so the count is durable in the a11y
 * tree instead of living only in the instant the live region fired. It had to be, because `aria-label`
 * overrides the button's whole subtree — a reader who focused the door after the read settled heard "You"
 * and nothing else, and on a phone this is the inbox's ONLY rest-state signal.
 */
function SheetBadge({ entry }: { readonly entry: ChromeEntry }): ReactNode {
  const visible = entry.useVisible?.() ?? true;
  if (!visible || entry.useBadge === undefined) {
    return null;
  }
  return <SheetBadgeCount entryId={entry.id} label={entry.label} useBadge={entry.useBadge} />;
}

function SheetBadgeCount({ entryId, label, useBadge }: { readonly entryId: string; readonly label: string; readonly useBadge: () => number }): ReactNode {
  const count = useBadge();
  if (count === 0) {
    return null;
  }
  return (
    <>
      {/* A DOT, NOT A NUMBER (#1815, owner ruling — the phone mirrors the bell). The desktop trigger dropped
          its counted pill at #1798 ("ugly as fuck" on a 16px glyph); this is the same mark on the same
          signal, so the app has ONE notification affordance rather than a dot in the topbar and a number on
          the tab. What the count MEANT also widened with it (`useBadge` is `unread || actionable` now, not
          unread) — which is a second reason the visible number had to go: "3" beside a door whose sheet
          marks everything read on open is a figure a reader can watch change for reasons they did not cause.
          The COUNT SURVIVES IN THE SPOKEN DESCRIPTION below; see its note for why that is not a mismatch. */}
      <Badge intent="primary" size="dot" aria-hidden={true} />
      {/* THE SPOKEN COUNT IS BOTH AN ANNOUNCEMENT AND A DURABLE FACT (#1129). `role="status"` says it the
          moment it lands; the tab's `aria-describedby` (RailButton) points HERE, so a reader who focuses the
          door a second later — or arrives after the read settled — still hears it. Before that, `aria-label`
          overrode the button's whole subtree for name computation and this node was reachable only in the
          instant it appeared: the phone's ONLY rest-state signal for a sheet-hosted inbox was sighted-only.
          It names WHAT it counts with the ENTRY'S OWN label (the registry's string, never a feature read —
          app-shell may not import a feature), so "3 waiting" is no longer an unattributed number.

          THE COUNT STAYS SPOKEN WHILE THE VISIBLE MARK IS A DOT (#1815), and the asymmetry is the point
          rather than a drift. A sighted reader resolves "there is a dot" by opening the sheet, which is one
          tap away and shows the rows themselves; for a screen-reader user this description IS the rest-state
          signal, and "Notifications: 3 waiting" is the difference between deciding to make that trip and
          not. Dropping the number here to match the pixels would have been a pure a11y loss with no product
          gain — the owner's ruling is about an ugly pill in the chrome, not about withholding the figure.

          THE WORD IS "WAITING", NOT "UNREAD", and it had to move with `useBadge` (#1815): the count is
          `unread || actionable` now, so a row that has been READ and still wants a decision is in it —
          "unread" would have been a false sentence spoken to the one reader who cannot see the rows. It is
          also the registry contract's own word (`ChromeEntry.useBadge`: "how many items this entry has
          WAITING for the user"), so the projection and its declaration now say the same thing. */}
      <span className="sr-only" id={sheetBadgeId(entryId)} role="status">
        {label}: {count} waiting
      </span>
    </>
  );
}

export function Rail({ activeSection, onSelectSection, onOpenModal }: RailProps): ReactElement {
  const entries = useChromeRegistry().list();
  const navEntries = entries.filter((e) => e.zone === "rail.nav");
  const endEntries = entries.filter((e) => e.zone === "rail.end");
  // At most one section claims the brand cell; with none, the glyph stays the decoration it always was.
  const brandEntry = entries.find((e) => e.zone === "rail.brand");
  // The mobile-only "You" overflow tab (its projection is the You sheet, §E-5) — its trigger DERIVES from
  // the modal registry (no parallel id), the same mechanism the twin-DOM rail used.
  //
  // THIS LOOKUP IS NOT AN ESCAPE PATH, AND A CENSUS OF `useModalRegistry()` CALLERS MUST NOT RE-FILE IT AS
  // ONE (owner ruling 2026-09-06, #1789). The You button is the INTRINSIC DOOR to the mobile projection of
  // the chrome registry, exactly as a panel toggle is the intrinsic door to its panel — D73 keeps the
  // frame's own grammar intrinsic, and making the projection's own door an entry INSIDE that projection
  // would be circular (it would list itself, and the sheet would offer a row that opens the sheet). So
  // `mobile-tab` stays unmapped in `assemble-chrome.ts` while `topbar.trail` (the ⌘K palette) became a real
  // chrome entry in the same change, and this reads its own target the only place that target is declared.
  const youModal = useModalRegistry()
    .list()
    .find((m) => m.trigger.placement === "mobile-tab");
  // THE BAR'S EFFECTIVE CURATION for where we are standing (#484): an overflow section takes the last
  // standing tab's slot for the duration, and that tab folds into the You sheet. One derivation, shared with
  // the sheet (`mobileBarCuration`, #state), so the door and its contents can never disagree about who is a
  // tab right now. Desktop is untouched — the rail column renders every entry regardless of `data-mobile`.
  const curation = mobileBarCuration(entries, activeSection);
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
          Exactly one of the two is ever displayed, so there is no duplicate affordance in the a11y tree
          (pinned: rail.ct.tsx "exactly one Home affordance at each width", #1790).

          RECORDED EXCEPTION, NOT AN OVERSIGHT (#1790): every other rail entry reflows ONE `RailButton`
          node across the `@media` (icon+label always in the DOM, CSS moves/hides the label); brand is
          the one entry that does not, because its two presentations are not one control resized — they
          are different chrome-row CONTRACTS. Desktop's `RailBrand` is a full-bleed header CELL (the
          wrapper `.shell-rail-brand` owns the chrome-row height, the shared bottom hairline, and
          `align-self: stretch`; shell.css:448-490) with its own active grammar (a color-mix background
          tint + a painted accent bar, `.shell-rail-brand-button[data-active]::before`). The mobile tab
          instead must look and behave EXACTLY like every sibling tab — flex-1 icon-over-label, color-only
          active state, no accent bar (shell.css:1177-1196) — which is why it already reuses the same
          `RailButton` every other entry uses, rather than a brand-flavored one. Folding both into a single
          DOM node would mean that node carries the header cell's geometry classes AND the tab's flex/sizing
          classes at once, with one arm's active-state layers (`::before`/`::after`) suppressed by the
          other's `@media` rule — a real cost (two coupled, order-dependent class sets on one element,
          reasoned about together forever) paid for zero behavior change: the reflow already produces
          exactly what a fold would produce, one visible Home affordance at every width. That is a decision,
          not neglect — it is not a `matchMedia` read, not a third component, and it does not touch the
          CT-pinned desktop paint at rail.ct.tsx:34-80. */}
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
                <RailChromeEntry
                  key={e.id}
                  entry={e}
                  activeSection={activeSection}
                  mobile={curation.get(e.id) ?? "sheet"}
                  onSelectSection={onSelectSection}
                  onOpenModal={onOpenModal}
                />
              ))}
          </div>
        ))}
      </div>

      <div className="shell-rail-spacer" />

      <div className="shell-rail-actions">
        {endEntries.map((e) => (
          <RailChromeEntry
            key={e.id}
            entry={e}
            activeSection={activeSection}
            mobile={curation.get(e.id) ?? "sheet"}
            onSelectSection={onSelectSection}
            onOpenModal={onOpenModal}
          />
        ))}
      </div>

      {/* THE YOU TAB IS A DOOR, AND NOW ONLY A DOOR (#484, owner-ruled). Its two predecessors both tried to
          stand in for a section that was not on the bar: F-15 gave it `aria-current="page"` (a reader heard
          "You, current page" on five sections it is not), and leg-4 replaced that claim with a sighted
          `data-contains-current` hint. BOTH RULINGS SURVIVE INTACT — a tab that is not the page may not say
          it is, and the topbar answers "where am I" in words — but their INPUT is gone: the current section
          now HOLDS A BAR SLOT of its own (`mobileBarCuration`), so the marker sits on the real thing and
          there is nothing left for this tab to represent. The hint is deleted rather than left dark,
          because a state it can never enter is rot, not caution. */}
      {youModal === undefined ? null : (
        <RailButton
          badge={sheetOverflowChrome(entries).map((e) => <SheetBadge entry={e} key={e.id} />)}
          // Every sheet-hosted entry's count node, by id — the ids are known from the door-frozen list
          // without calling one hook, which is exactly why the tab can describe counts it may not read.
          describedById={sheetOverflowChrome(entries)
            .map((e) => sheetBadgeId(e.id))
            .join(" ")}
          icon={youModal.trigger.icon}
          label={youModal.trigger.label}
          mobile="tab"
          mobileOnly={true}
          modalId={youModal.id}
          onClick={(): void => onOpenModal(youModal.id)}
        />
      )}
    </nav>
  );
}
