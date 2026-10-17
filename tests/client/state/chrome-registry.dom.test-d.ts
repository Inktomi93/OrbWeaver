import type { ChromeEntry } from "@orb/client/state";

declare const widget: Extract<ChromeEntry["behavior"], { kind: "widget" }>;
const topbar: ChromeEntry = { id: "test-topbar", label: "Topbar", zone: "topbar.trail", behavior: widget };
const rail: ChromeEntry = { id: "test-rail", label: "Rail", zone: "rail.end", mobile: "sheet", behavior: widget };
// @ts-expect-error a rail entry must declare its mobile fate
const missingMobile: ChromeEntry = { id: "test-rail", label: "Rail", zone: "rail.end", behavior: widget };
void [topbar, rail, missingMobile];
