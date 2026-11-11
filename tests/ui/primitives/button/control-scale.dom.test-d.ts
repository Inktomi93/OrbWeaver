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

test("stacked reshapes a scale step like wrap, and no box combines with another", () => {
  createElement(Button, { size: "sm", stacked: true }, "x");
  createElement(Button, { stacked: false }, "x");
  // @ts-expect-error the band is BandButton's box, not a Button size
  createElement(Button, { size: "band" }, "x");
  // @ts-expect-error stacked is a reshape of a scale step, not a size
  createElement(Button, { size: "stacked" }, "x");
  // @ts-expect-error a square cannot be stacked
  createElement(Button, { square: true, stacked: true, "aria-label": "x" });
  // @ts-expect-error a wrap cannot be stacked
  createElement(Button, { wrap: true, stacked: true }, "x");
  expectTypeOf<{ stacked: true; wrap: true }>().not.toExtend<ButtonProps>();
});

test("stretch owns the label's start and, for a line, the width, and a square takes none", () => {
  createElement(Button, { stretch: "row" }, "x");
  createElement(Button, { stretch: "line" }, "x");
  createElement(Button, { justify: "start", width: "full" }, "x");
  // @ts-expect-error stretch already sets the label at the start
  createElement(Button, { stretch: "row", justify: "start" }, "x");
  // @ts-expect-error a whole line already takes the full width
  createElement(Button, { stretch: "line", width: "full" }, "x");
  // @ts-expect-error a square is its step's width, not a share of the row
  createElement(Button, { square: true, stretch: "row", "aria-label": "x" });
  expectTypeOf<{ square: true; stretch: "line"; "aria-label": "x" }>().not.toExtend<ButtonProps>();
});

test("a square is icon-only, so it carries its own name", () => {
  // @ts-expect-error a square leaves no room for a text child to name it
  createElement(Button, { square: true }, "x");
  createElement(Button, { square: true, "aria-label": "Send" });
  createElement(Button, { square: false }, "x");
  expectTypeOf<{ square: true; children: "x" }>().not.toExtend<ButtonProps>();
  // A computed square might be icon-only, so it states its name.
  expectTypeOf<{ square: boolean; children: "x" }>().not.toExtend<ButtonProps>();
  expectTypeOf<{ square: true; "aria-label": "Send" }>().toExtend<ButtonProps>();
});
