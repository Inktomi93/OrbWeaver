// D336: the preview fills, the float, inset and pill shapes, the popover tone and the field, drop and presence states left
// Card for ThemePreviewPane, RoomIsland and FloatingChip, so Card refuses them.
import { Card } from "@orb/ui/card";
import { FloatingChip } from "@orb/ui/floating-chip";
import { RoomIsland } from "@orb/ui/room-island";
import { ThemePreviewPane } from "@orb/ui/theme-swatch";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("Card refuses every value a named component owns", () => {
  // @ts-expect-error a shell surface fill is a ThemePreviewPane fill
  createElement(Card, { tone: "background" }, "x");
  // @ts-expect-error a shell surface fill is a ThemePreviewPane fill
  createElement(Card, { tone: "accent" }, "x");
  // @ts-expect-error a shell surface fill is a ThemePreviewPane fill
  createElement(Card, { tone: "sidebar" }, "x");
  // @ts-expect-error a shell surface fill is a ThemePreviewPane fill
  createElement(Card, { tone: "sidebarEdge" }, "x");
  // @ts-expect-error a shell surface fill is a ThemePreviewPane fill
  createElement(Card, { tone: "translucent" }, "x");
  // @ts-expect-error the popover fill is a FloatingChip's
  createElement(Card, { tone: "popover" }, "x");
  // @ts-expect-error a sub-control mark is a ThemePreviewPane shape
  createElement(Card, { shape: "inset" }, "x");
  // @ts-expect-error the pill is a FloatingChip's shape
  createElement(Card, { shape: "pill" }, "x");
  // @ts-expect-error the room island is RoomIsland
  createElement(Card, { shape: "float" }, "x");
  // @ts-expect-error a chip that comes and goes is a FloatingChip
  createElement(Card, { presence: "hidden" }, "x");
  // @ts-expect-error the field host is RoomIsland
  createElement(Card, { holdsField: true }, "x");
  // @ts-expect-error the drop target is RoomIsland
  createElement(Card, { dropTarget: true }, "x");
  expectTypeOf<Parameters<typeof Card>[0]>().not.toHaveProperty("presence");
});

test("the named components take their own values", () => {
  createElement(ThemePreviewPane, { fill: "sidebar", shape: "row", padding: "none", lifted: true });
  createElement(FloatingChip, { presence: "hidden" }, "x");
  createElement(RoomIsland, { ownSlot: "composer", holdsField: true, dropTarget: true, layout: "stack" }, "x");
  // @ts-expect-error a pane names the surface it stands for
  createElement(ThemePreviewPane, { shape: "row" }, "x");
  // @ts-expect-error a chip names whether it is shown
  createElement(FloatingChip, {}, "x");
  // @ts-expect-error an island names the owner-CSS hook it is
  createElement(RoomIsland, {}, "x");
  expectTypeOf<Parameters<typeof FloatingChip>[0]["presence"]>().toEqualTypeOf<"shown" | "hidden">();
});
