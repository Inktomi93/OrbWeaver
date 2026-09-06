// The chrome-registry contract (shell-chrome-unification.md §A) — a shell chrome affordance as ONE
// `ChromeEntry`, assembled at the door (main.tsx) via `assembleChrome` → `createContributorRegistry`. A
// chrome entry comes from ONE of three sources, expressed by its `behavior` union (§E-2, the crux): a rail
// SECTION (derived from `SectionDefinition.rail`), a MODAL trigger (derived from `ModalDefinition.trigger`),
// or a live feature-owned WIDGET a static icon can't express (the bell, the shell's own toggles). Widget
// bodies render a lens (`"bar"` = the always-mounted bar DOM, `"sheet"` = the You-sheet projection) — both
// lenses have a consumer (N1 slice shipped, `history/shell-chrome-unification.md`). All four zones are
// consumed: `rail.brand`/`rail.nav`/`rail.end` by `features/app-shell/components/rail.tsx`, `topbar.trail`
// by the shell header, and the sheet lens by `features/app-shell/components/you-sheet.tsx`.

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { ModalSlotId } from "./modal-slot-ids.ts";
import type { SectionId } from "./section-ids.ts";
import type { MobileCuration, SectionGroup } from "./section-registry.ts";
import { RAIL_ZONES, SECTION_GROUPS } from "./section-registry.ts";

// The rail's own zones DERIVE from `RAIL_ZONES` (its one home, beside `RailEntry.zone` in
// section-registry.ts — `rail.nav`, `rail.brand`, `rail.end`) — re-spelling them here would be the
// parallel map the lockdown kills. `topbar.trail` is the one non-rail zone.
export const CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"] as const;
export type ChromeZone = (typeof CHROME_ZONES)[number];

/** A rail entry's mobile fate (`MobileCuration`) is homed in `section-registry.ts` beside the rail's
 *  other vocabulary — re-exported here so a chrome consumer imports the whole zone vocab from one place. */
export type { MobileCuration } from "./section-registry.ts";
/** Which lens renders a widget: the always-mounted bar DOM, or the You-sheet projection. Only `"bar"`
 *  has a consumer this wave; the sheet lens lands §E-5. */
export type ChromePresentation = "bar" | "sheet";

/** Where a chrome entry's affordance comes from — the three sources unified (§A). A `section`/`modal` arm
 *  carries only its target id (the consuming surface renders the affordance + wires the action from the
 *  section/modal registry); a `widget` arm carries a live body a static icon/label pair can't express. */
export type ChromeEntryBehavior =
  | { readonly kind: "section"; readonly sectionId: SectionId }
  | { readonly kind: "modal"; readonly modalId: ModalSlotId }
  | { readonly kind: "widget"; readonly body: (presentation: ChromePresentation) => ReactNode };

/** A shell chrome affordance as ONE definition. `id`/`label`/`icon`/`zone`/`order`/`mobile` are the
 *  presentation axes every source shares; `behavior` is where it points. */
export interface ChromeEntry {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly zone: ChromeZone;
  /** `rail.nav` grouping — the divider order derives from it; the group axis has ONE home in
   *  section-registry.ts (kills rail-slots.ts's duplicate tuple). No consumer this wave. */
  readonly group?: SectionGroup;
  readonly order?: number;
  /** The entry's PHONE FATE. On the rail it is the tab-vs-You-sheet decision and it is REQUIRED (the
   *  `chrome-registry-completeness` gate); on `topbar.trail` it is OPTIONAL and defaults to "stay on the
   *  row" — declaring `"sheet"` moves the entry off a 320px topbar into the You sheet, which projects it by
   *  KIND: a widget's `body("sheet")` lens (the notifications inbox, 2026-08-07: a 48px control was
   *  competing with the one thing that says where you are) or a modal trigger's row (the ⌘K palette, whose
   *  `mobile` is declared on its `ModalTrigger` and derived here, #1789). The axis is chrome-wide; it used
   *  to be rail-only, back when the sheet projected nothing from this zone. */
  readonly mobile?: MobileCuration;
  /** Capability gate, called UNCONDITIONALLY per entry — the registry list is frozen at the door
   *  (contentBySection precedent), so hooks-over-a-stable-list is legal. `false` ⇒ render NOTHING (no
   *  gap) — preserves the notification bell's no-flash-then-yank rule. Omitted ⇒ always visible. */
  readonly useVisible?: () => boolean;
  /** How many items this entry has WAITING for the user, from the entry's own one source — the count the
   *  desktop affordance already badges (`notificationsChrome` returns `useInbox().unreadCount`, the same
   *  read the bell makes; react-query dedupes the key, so a second reader costs no request and mints no
   *  second derivation). `0` ⇒ nothing waiting.
   *
   *  WHY THE REGISTRY CARRIES IT: an entry curated `mobile: "sheet"` leaves the phone's chrome for the You
   *  sheet, so on a phone its signal has nowhere to appear — the notifications inbox was reachable but a
   *  user was never TOLD there was anything in it, while the desktop bell has always badged the count
   *  (side-eye home re-score 2026-08-18, #214 residue). The tab that HOSTS the sheet shows the sheet's own
   *  signal, derived through the same projection as everything else in it; app-shell may not import a
   *  feature (`client-features-no-cross`), so a hardcoded read here would not even resolve.
   *
   *  Called UNCONDITIONALLY inside a per-entry component, and only where `useVisible` already said yes —
   *  the same contract `useVisible` itself has. */
  readonly useBadge?: () => number;
  readonly behavior: ChromeEntryBehavior;
}

/** The `topbar.trail` entries a PHONE's row cannot afford, which the You sheet projects instead (§E-5).
 *  ONE home for the filter: the sheet projects them (a WIDGET's `body("sheet")` lens, a MODAL trigger's row
 *  — #1789 folded the ⌘K palette in here) and the mobile bar's You tab badges their `useBadge` count, and
 *  the two must never disagree about which entries those are. */
export function sheetOverflowChrome(entries: readonly ChromeEntry[]): readonly ChromeEntry[] {
  return entries.filter((entry) => entry.zone === "topbar.trail" && entry.mobile === "sheet");
}

/**
 * THE PHONE BAR'S EFFECTIVE CURATION — the CURRENT SECTION ALWAYS HOLDS A SLOT (owner ruling, #484).
 *
 * A phone shows four affordances: the brand tab, the `mobile:"tab"` sections, and the You door. Standing in
 * a `mobile:"sheet"` section (corpus · presets · databank · refinery · config · analytics) the bar marked
 * NOTHING current — the section's own button carries `aria-current="page"` but is `display:none` there, so
 * AT was told the current page is a 0×0 control no finger can reach and a sighted user saw four unlit tabs
 * while standing in a fifth place. The ruled fix is a SWAP, not a marker: the active section takes the LAST
 * standing section slot on the bar, and the tab it displaces folds into the You sheet for the duration.
 * Exactly one VISIBLE tab then carries the marker, and the ARIA lie dies of its own accord.
 *
 * ONE HOME, for the same reason `sheetOverflowChrome` has one: the bar and the sheet read this map, so they
 * can never disagree about who is a tab right now — a displaced section stays reachable because the sheet's
 * "More" list is derived from the SAME result, never from the declared `mobile` field.
 *
 * Returns a TOTAL map (every entry id → its effective curation), so a consumer never re-spells a default —
 * and the defaults are per zone, exactly as `ChromeEntry.mobile` documents them: a rail entry that declares
 * nothing folds into the sheet, a `topbar.trail` widget that declares nothing stays on the row. Declared
 * curation is returned untouched when the active section already holds a tab, when it is the brand cell
 * (always the bar's first tab), or when it is not a rail section at all.
 */
export function mobileBarCuration(entries: readonly ChromeEntry[], activeSection: SectionId): ReadonlyMap<string, MobileCuration> {
  const curation = new Map<string, MobileCuration>(entries.map((entry) => [entry.id, entry.mobile ?? (entry.zone === "topbar.trail" ? "tab" : "sheet")]));
  // Only a GROUPED `rail.nav` section — or a `rail.end` section — can hold a bar slot: the rail renders its
  // nav list group by group, so an ungrouped nav entry has no cell to take and displacing a tab for it
  // would shrink the bar to three. A `rail.end` SECTION (Settings since the config revamp, #866 S1) renders
  // in `.shell-rail-actions`, which the bar paints `display: contents` (shell.css) — it HAS a cell, so it
  // borrows a slot like any other overflow section. Without this arm, standing in Settings on a phone would
  // resurrect the exact #484 lie: `aria-current="page"` on a `display:none` control and four unlit tabs.
  const barSections = entries.filter(
    (entry) => entry.behavior.kind === "section" && ((entry.zone === "rail.nav" && entry.group !== undefined) || entry.zone === "rail.end"),
  );
  const active = barSections.find((entry) => entry.behavior.kind === "section" && entry.behavior.sectionId === activeSection);
  if (active === undefined || curation.get(active.id) === "tab") {
    return curation;
  }
  // The LAST standing tab is the one that yields — the bar's own grammar reads left-to-right from the most
  // everyday destination, so the slot nearest the You door is the cheapest to lend (and its section is one
  // tap away inside that door while it is lent).
  const standing = barSections
    .filter((entry) => curation.get(entry.id) === "tab")
    .toSorted((a, b) => SECTION_GROUPS.indexOf(a.group ?? SECTION_GROUPS[0]) - SECTION_GROUPS.indexOf(b.group ?? SECTION_GROUPS[0]));
  const displaced = standing.at(-1);
  curation.set(active.id, "tab");
  if (displaced !== undefined) {
    curation.set(displaced.id, "sheet");
  }
  return curation;
}
