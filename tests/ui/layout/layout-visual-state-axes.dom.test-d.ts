// D336 step 4d: the visual-state axes left the layout boxes for named components, so each box refuses them.
import { CurrentGrid, CurrentStack } from "@orb/ui/current";
import { FocalSection } from "@orb/ui/focal-section";
import { DialogBody, Grid, Row, Section, Stack } from "@orb/ui/layout";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("Section refuses focal and FocalSection takes it", () => {
  // @ts-expect-error a focal section is a FocalSection
  createElement(Section, { focal: true }, "x");
  expectTypeOf<Parameters<typeof Section>[0]>().not.toHaveProperty("focal");
  createElement(FocalSection, { focal: false, heading: "x" }, "x");
  expectTypeOf<Parameters<typeof FocalSection>[0]["focal"]>().toEqualTypeOf<boolean | undefined>();
});

test("Stack and Grid refuse highlight, and the current boxes take aria-current instead", () => {
  // @ts-expect-error the anchor mark is a CurrentStack
  createElement(Stack, { highlight: true }, "x");
  // @ts-expect-error the match mark is a CurrentGrid
  createElement(Grid, { highlight: true }, "x");
  createElement(CurrentStack, { "aria-current": "true", gap: "row" }, "x");
  createElement(CurrentGrid, { "aria-current": "true", gap: "row" }, "x");
  expectTypeOf<Parameters<typeof CurrentStack>[0]>().not.toHaveProperty("highlight");
});

test("Stack refuses slide, lifted and opacityMotion; receded carries the opacity motion", () => {
  // @ts-expect-error the flank's slide moved to the shell panel sheet
  createElement(Stack, { slide: "shown" }, "x");
  // @ts-expect-error the flank's lift moved to the shell panel sheet
  createElement(Stack, { lifted: true }, "x");
  // @ts-expect-error receded eases its own opacity
  createElement(Stack, { opacityMotion: true }, "x");
  createElement(Stack, { receded: true }, "x");
  expectTypeOf<Parameters<typeof Stack>[0]>().not.toHaveProperty("slide");
  expectTypeOf<Parameters<typeof Stack>[0]>().not.toHaveProperty("lifted");
  expectTypeOf<Parameters<typeof Stack>[0]>().not.toHaveProperty("opacityMotion");
});

test("Row refuses stateFill", () => {
  // @ts-expect-error a held or hovered row state belongs to ListRow and the selection rail
  createElement(Row, { stateFill: "selected" }, "x");
  expectTypeOf<Parameters<typeof Row>[0]>().not.toHaveProperty("stateFill");
});

test("a divider's meaning is a stamped tone, so dividerTone keeps only the border and the sidebar seam", () => {
  // @ts-expect-error a primary divider is the primary tone
  createElement(Row, { divider: "start", dividerTone: "primary" }, "x");
  // @ts-expect-error a warning divider is the warning tone
  createElement(Stack, { divider: "start", dividerTone: "warning" }, "x");
  createElement(Row, { divider: "start", dividerTone: "sidebar" }, "x");
  createElement(Row, { divider: "start", tone: "primary" }, "x");
  createElement(Stack, { divider: "start", tone: "warning" }, "x");
  expectTypeOf<Parameters<typeof Row>[0]["dividerTone"]>().toEqualTypeOf<"border" | "sidebar" | undefined>();
});

test("DialogBody refuses the inline padding its glyph bleed owns and keeps the block axis", () => {
  // @ts-expect-error the body's inline padding is the glyph bleed
  createElement(DialogBody, { paddingInline: "row" }, "x");
  // @ts-expect-error the whole-box padding would name the inline axis too
  createElement(DialogBody, { padding: "block" }, "x");
  createElement(DialogBody, { paddingBlock: "row" }, "x");
  expectTypeOf<Parameters<typeof DialogBody>[0]>().not.toHaveProperty("paddingInline");
});
