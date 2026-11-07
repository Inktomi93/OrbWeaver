// D336: the glyph, inline-text and picture boxes left Button for their named components, so Button refuses them.
import type { ButtonProps } from "@orb/ui/button";
import { Button } from "@orb/ui/button";
import type { ControlSize } from "@orb/ui/lib";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("Button refuses every box a named component owns", () => {
  // @ts-expect-error a glyph box is GlyphButton
  createElement(Button, { size: "glyph-xs", "aria-label": "x" });
  // @ts-expect-error a glyph box is GlyphButton
  createElement(Button, { size: "glyph-lg", "aria-label": "x" });
  // @ts-expect-error a text-height action is InlineAction
  createElement(Button, { size: "inline" }, "x");
  // @ts-expect-error a body-step action is InlineAction
  createElement(Button, { size: "inline-body" }, "x");
  // @ts-expect-error a content-sized picture is PictureButton
  createElement(Button, { size: "media" }, "x");
  // @ts-expect-error a style that draws nothing is PictureButton
  createElement(Button, { variant: "bare" }, "x");
  expectTypeOf<NonNullable<ButtonProps["size"]>>().toEqualTypeOf<ControlSize>();
});
