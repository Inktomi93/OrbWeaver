// GlyphButton: an icon-only micro control at a glyph step, named by an attribute, painted like any Button.
import type { GlyphButtonProps, GlyphStep } from "@orb/ui/glyph-button";
import { GlyphButton } from "@orb/ui/glyph-button";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("a glyph button takes a glyph step and states its own name", () => {
  // @ts-expect-error no text child fits the box, so the name is an attribute
  createElement(GlyphButton, { glyph: "sm" }, "x");
  // @ts-expect-error the step is the glyph ramp, never the control scale
  createElement(GlyphButton, { glyph: "chip", "aria-label": "x" });
  // @ts-expect-error a glyph button has no control-scale box
  createElement(GlyphButton, { glyph: "sm", size: "sm", "aria-label": "x" });
  // @ts-expect-error the glyph step is required
  createElement(GlyphButton, { "aria-label": "x" });
  createElement(GlyphButton, { glyph: "lg", "aria-labelledby": "label-id" });
  expectTypeOf<GlyphStep>().toEqualTypeOf<"xs" | "sm" | "md" | "lg">();
});

test("a glyph button paints with the Button vocabulary", () => {
  // @ts-expect-error an ink excludes a colour tone
  createElement(GlyphButton, { glyph: "sm", variant: "ghost", tone: "destructive", ink: "muted", "aria-label": "x" });
  // @ts-expect-error a fill-less style has no focal lift
  createElement(GlyphButton, { glyph: "sm", variant: "ghost", focal: true, "aria-label": "x" });
  // @ts-expect-error a style that draws nothing is a picture
  createElement(GlyphButton, { glyph: "sm", variant: "bare", "aria-label": "x" });
  createElement(GlyphButton, { glyph: "lg", focal: false, shape: "pill", "aria-label": "Send" });
  createElement(GlyphButton, { glyph: "lg", variant: "ghost", ink: "muted", "aria-label": "x" });
  expectTypeOf<{ glyph: "xs"; variant: "outline"; tone: "destructive"; "aria-label": "x" }>().toExtend<GlyphButtonProps>();
});
