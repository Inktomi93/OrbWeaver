// chrome-registry (state/chrome-registry.ts) — the two PHONE-CURATION derivations in this otherwise
// type-only module, both shared by the mobile bar and the You sheet for the same reason: the door and its
// contents may never disagree, which is why each is a function here instead of a predicate spelled twice.
// `sheetOverflowChrome` names the `topbar.trail` widgets a phone's row cannot afford (the sheet renders
// their `body("sheet")` lens, the You tab badges their `useBadge` count). `mobileBarCuration` decides who
// is a TAB right now: the current section always holds a bar slot (#484), borrowing the last standing one.

import type { ChromeEntry, SectionId } from "@orb/client/state";
import { mobileBarCuration, sheetOverflowChrome } from "@orb/client/state";
import { expect, test } from "../../support/fixtures.ts";

function entry(id: string, zone: ChromeEntry["zone"], mobile?: ChromeEntry["mobile"]): ChromeEntry {
  return {
    id,
    label: id,
    zone,
    ...(mobile === undefined ? {} : { mobile }),
    behavior: { kind: "widget", body: (): null => null },
  };
}

/** A rail SECTION entry — the only kind the bar's swap moves. `id` doubles as the section id, exactly as
 *  `assembleChrome` mints them. */
function section(
  sectionId: SectionId,
  group: NonNullable<ChromeEntry["group"]>,
  mobile: NonNullable<ChromeEntry["mobile"]>,
  zone: ChromeEntry["zone"] = "rail.nav",
): ChromeEntry {
  return { id: sectionId, label: sectionId, zone, group, mobile, behavior: { kind: "section", sectionId } };
}

/** The same, minus the `group` axis — a nav section the rail's group-by-group render can never paint. */
function ungroupedSection(sectionId: SectionId, mobile: NonNullable<ChromeEntry["mobile"]>): ChromeEntry {
  return { id: sectionId, label: sectionId, zone: "rail.nav", mobile, behavior: { kind: "section", sectionId } };
}

test("selects ONLY the topbar widgets curated onto the phone's sheet", () => {
  const entries: readonly ChromeEntry[] = [
    entry("bell", "topbar.trail", "sheet"),
    // Stays on the phone's row — its affordance is already visible there, so the sheet must not double it.
    entry("focus-toggle", "topbar.trail", "tab"),
    // An UNCURATED trail widget defaults to "stay on the row" (`ChromeEntry.mobile` on this zone), so an
    // omitted axis may never be read as sheet-bound.
    entry("context-toggle", "topbar.trail"),
    // A rail entry curated for the sheet is projected by its own path (the footer/overflow lists), never
    // through this one — mixing them would put a nav section where the trail widgets render.
    entry("corpus", "rail.nav", "sheet"),
    entry("persona", "rail.end", "sheet"),
  ];

  expect(sheetOverflowChrome(entries).map((e) => e.id)).toEqual(["bell"]);
});

test("preserves the registry's own order and never mutates the list it is handed", () => {
  const entries: readonly ChromeEntry[] = [entry("second", "topbar.trail", "sheet"), entry("first", "topbar.trail", "sheet")];

  expect(sheetOverflowChrome(entries).map((e) => e.id)).toEqual(["second", "first"]);
  expect(entries.map((e) => e.id)).toEqual(["second", "first"]);
});

// ── mobileBarCuration — the current section always holds a bar slot (#484, owner-ruled) ───────────────
// The phone bar renders 4 of 9 sections. Standing in one of the other five, the current section's button
// was `display:none` there while carrying `aria-current="page"` — a claim about a 0×0 control. The swap
// makes the claim true instead of deleting it: the section takes the last standing slot, its former holder
// folds into the You sheet, and BOTH surfaces read this one map so nobody loses their door.

/** The bar as a phone paints it: the nav sections whose EFFECTIVE curation is `tab`, in registry order. */
function barTabs(entries: readonly ChromeEntry[], active: SectionId): readonly string[] {
  const curation = mobileBarCuration(entries, active);
  return entries.filter((e) => e.zone === "rail.nav" && curation.get(e.id) === "tab").map((e) => e.id);
}

test("an overflow section takes the LAST standing tab's slot, and that tab folds into the sheet", () => {
  const entries: readonly ChromeEntry[] = [
    section("home", "primary", "tab", "rail.brand"),
    section("chats", "primary", "tab"),
    section("characters", "primary", "tab"),
    section("corpus", "primary", "sheet"),
    entry("persona", "rail.end", "sheet"),
  ];

  const curation = mobileBarCuration(entries, "corpus");
  expect(curation.get("corpus")).toBe("tab");
  expect(curation.get("characters")).toBe("sheet");
  // Everything else keeps its declared fate — the swap trades exactly one slot.
  expect(curation.get("chats")).toBe("tab");
  expect(curation.get("home")).toBe("tab");
  expect(curation.get("persona")).toBe("sheet");
  expect(barTabs(entries, "corpus")).toEqual(["chats", "corpus"]);
});

test("LAST is by the rail's GROUP order, not list order — the bar reflows groups, so the yielding slot follows", () => {
  const entries: readonly ChromeEntry[] = [
    // Declared (and thus rendered) in list order, but `insight` paints after `primary` on the bar.
    section("analytics", "insight", "tab"),
    section("chats", "primary", "tab"),
    section("corpus", "primary", "sheet"),
  ];

  expect(mobileBarCuration(entries, "corpus").get("analytics")).toBe("sheet");
  expect(mobileBarCuration(entries, "corpus").get("chats")).toBe("tab");
});

test("a section that already holds a tab changes nothing — and neither does the brand cell", () => {
  const entries: readonly ChromeEntry[] = [
    section("home", "primary", "tab", "rail.brand"),
    section("chats", "primary", "tab"),
    section("corpus", "primary", "sheet"),
  ];

  expect(barTabs(entries, "chats")).toEqual(["chats"]);
  expect(mobileBarCuration(entries, "chats").get("corpus")).toBe("sheet");
  // Home's affordance is the brand cell, which is always the bar's first tab: standing there borrows nothing.
  expect(barTabs(entries, "home")).toEqual(["chats"]);
});

// #866 S1 — a `rail.end` SECTION (Settings at the rail foot) HAS a cell on the phone (`.shell-rail-actions` paints
// `display: contents`), so standing in it borrows a slot exactly like an overflow nav section. Without this arm
// the #484 lie returns: `aria-current="page"` on a `display:none` control and four unlit tabs.
test("a rail.end SECTION curated to the sheet takes the last standing tab's slot when active", () => {
  const entries: readonly ChromeEntry[] = [
    section("chats", "primary", "tab"),
    section("characters", "primary", "tab"),
    section("corpus", "primary", "tab"),
    section("config", "authoring", "sheet", "rail.end"),
  ];
  const curation = mobileBarCuration(entries, "config");
  expect(curation.get("config")).toBe("tab");
  expect(curation.get("corpus")).toBe("sheet");
  expect(curation.get("chats")).toBe("tab");
});

test("an UNGROUPED nav section may not take a slot — it has no cell to paint in, so nothing is lent", () => {
  const entries: readonly ChromeEntry[] = [section("chats", "primary", "tab"), ungroupedSection("corpus", "sheet")];

  expect(mobileBarCuration(entries, "corpus").get("corpus")).toBe("sheet");
  expect(mobileBarCuration(entries, "corpus").get("chats")).toBe("tab");
});

test("the map is TOTAL and carries each zone's own default, so no consumer re-spells a fallback", () => {
  const entries: readonly ChromeEntry[] = [entry("uncurated-trail", "topbar.trail"), entry("uncurated-footer", "rail.end"), section("chats", "primary", "tab")];

  const curation = mobileBarCuration(entries, "chats");
  expect([...curation.keys()].toSorted()).toEqual(["chats", "uncurated-footer", "uncurated-trail"]);
  // A rail entry that declares nothing folds into the sheet; a trail widget that declares nothing stays on
  // the row — the two documented defaults of `ChromeEntry.mobile`, not one guess applied to both.
  expect(curation.get("uncurated-footer")).toBe("sheet");
  expect(curation.get("uncurated-trail")).toBe("tab");
});
