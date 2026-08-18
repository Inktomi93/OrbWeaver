// chrome-registry (state/chrome-registry.ts) — the SHEET-OVERFLOW selector, which is the one behaviour in
// this otherwise type-only module. `sheetOverflowChrome` names the `topbar.trail` widgets a phone's row
// cannot afford: the You SHEET renders their `body("sheet")` lens and the mobile bar's You TAB badges their
// `useBadge` count, and the door and its contents may never disagree about which entries those are — which
// is why the filter is a function here instead of the same predicate spelled at both call sites.

import type { ChromeEntry } from "@orb/client/state";
import { sheetOverflowChrome } from "@orb/client/state";
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
