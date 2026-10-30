// D336 step 3: Button's `size` is the control scale plus the boxes step four names; `square` and `wrap` reshape a step.
import type { ButtonProps } from "@orb/ui/button";
import { Button } from "@orb/ui/button";
import type { ControlSize } from "@orb/ui/lib";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("the removed size values do not compile", () => {
  // @ts-expect-error `icon` is the md step with `square`
  createElement(Button, { size: "icon", "aria-label": "x" });
  // @ts-expect-error `icon-sm` is the sm step with `square`
  createElement(Button, { size: "icon-sm", "aria-label": "x" });
  // @ts-expect-error `wrap` is the sm step with `wrap`
  createElement(Button, { size: "wrap" }, "x");
  // @ts-expect-error `wrap-md` is the md step with `wrap`
  createElement(Button, { size: "wrap-md" }, "x");
  expectTypeOf<ControlSize>().toExtend<NonNullable<ButtonProps["size"]>>();
});

test("square and wrap reshape a scale step only, and never together", () => {
  // @ts-expect-error a glyph box is already square
  createElement(Button, { size: "glyph-lg", square: true, "aria-label": "x" });
  // @ts-expect-error an inline box is text-height, not a step to wrap
  createElement(Button, { size: "inline", wrap: true }, "x");
  // @ts-expect-error a square cannot wrap
  createElement(Button, { square: true, wrap: true, "aria-label": "x" });
  createElement(Button, { size: "sm", square: true, "aria-label": "x" });
  createElement(Button, { size: "chip", wrap: true }, "x");
  expectTypeOf<{ size: "glyph-lg"; square: true; "aria-label": "x" }>().not.toExtend<ButtonProps>();
});

test("a square is icon-only, so it carries its own name", () => {
  // @ts-expect-error a square leaves no room for a text child to name it
  createElement(Button, { square: true }, "x");
  // @ts-expect-error a computed square might be icon-only, so it states its name
  createElement(Button, { square: Math.random() > 0.5 }, "x");
  createElement(Button, { square: true, "aria-label": "Send" });
  createElement(Button, { square: false }, "x");
  expectTypeOf<{ square: true; children: "x" }>().not.toExtend<ButtonProps>();
  expectTypeOf<{ square: true; "aria-label": "Send" }>().toExtend<ButtonProps>();
});
