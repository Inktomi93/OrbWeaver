import type { ChromeEntry } from "@orb/client/state";
import { expectTypeOf, test } from "vitest";

declare const widget: Extract<ChromeEntry["behavior"], { kind: "widget" }>;
declare const trailWidget: Extract<ChromeEntry["behavior"], { kind: "widget"; useMenuForms: unknown }>;

test("a rail chrome entry must declare its mobile fate", () => {
  const topbar: ChromeEntry = { id: "test-topbar", label: "Topbar", zone: "topbar.trail", behavior: trailWidget };
  const rail: ChromeEntry = { id: "test-rail", label: "Rail", zone: "rail.end", mobile: "sheet", behavior: widget };
  // @ts-expect-error a rail entry must declare its mobile fate
  const missingMobile: ChromeEntry = { id: "test-rail", label: "Rail", zone: "rail.end", behavior: widget };
  expectTypeOf([topbar, rail, missingMobile]).toEqualTypeOf<ChromeEntry[]>();
});

test("every rail zone and the topbar trail are chrome zones, and nothing else is", () => {
  const brand: ChromeEntry = { id: "test-brand", label: "Brand", zone: "rail.brand", mobile: "tab", behavior: widget };
  const nav: ChromeEntry = { id: "test-nav", label: "Nav", zone: "rail.nav", mobile: "sheet", behavior: widget };
  const trailWithFate: ChromeEntry = { id: "test-trail", label: "Trail", zone: "topbar.trail", mobile: "sheet", behavior: trailWidget };
  // @ts-expect-error a zone outside CHROME_ZONES renders nowhere
  const unknownZone: ChromeEntry = { id: "test-zone", label: "Zone", zone: "sidebar.top", mobile: "tab", behavior: widget };
  expectTypeOf([brand, nav, trailWithFate, unknownZone]).toEqualTypeOf<ChromeEntry[]>();
});

test("a topbar trail widget must declare its menu form", () => {
  // @ts-expect-error a trail widget with no menu form has no way to stay reachable when its row overflows
  const noMenuForm: ChromeEntry = { id: "test-trail", label: "Trail", zone: "topbar.trail", behavior: widget };
  expectTypeOf(noMenuForm).toEqualTypeOf<ChromeEntry>();
});
