// D336: Button spells fill style as `variant`, colour as `tone` and a named ink as `ink`; the old `intent` axis is gone.
import type { ButtonProps } from "@orb/ui/button";
import { Button } from "@orb/ui/button";
import type { Tone } from "@orb/ui/tokens";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("the old intent axis and its values do not compile", () => {
  // @ts-expect-error `intent` is not a Button axis
  createElement(Button, { intent: "ghost" }, "x");
  // @ts-expect-error `secondary` is the neutral outline now
  createElement(Button, { variant: "secondary" }, "x");
  // @ts-expect-error `primary` is a tone, not a style
  createElement(Button, { variant: "primary" }, "x");
  // @ts-expect-error a named ink is `ink`, never a tone
  createElement(Button, { variant: "ghost", tone: "muted" }, "x");
  // @ts-expect-error `default` is the unset tone
  createElement(Button, { variant: "ghost", tone: "default" }, "x");
  expectTypeOf<NonNullable<ButtonProps["variant"]>>().toEqualTypeOf<"solid" | "outline" | "ghost" | "link" | "bare">();
  expectTypeOf<NonNullable<ButtonProps["tone"]>>().toEqualTypeOf<Tone>();
});

test("an ink excludes a colour tone and a filled style, and only the solid draws the focal lift", () => {
  // @ts-expect-error an ink would repaint a colour tone's meaning away
  createElement(Button, { variant: "ghost", tone: "destructive", ink: "muted" }, "x");
  // @ts-expect-error the solid owns its ink
  createElement(Button, { ink: "muted" }, "x");
  // @ts-expect-error a fill-less style has no CTA lift
  createElement(Button, { variant: "ghost", focal: true }, "x");
  expectTypeOf<{ variant: "ghost"; ink: "muted" }>().toExtend<ButtonProps>();
});

test("every tone works with every style", () => {
  createElement(Button, {}, "the focal primary");
  createElement(Button, { focal: false }, "a solid without the lift");
  createElement(Button, { tone: "destructive" }, "x");
  createElement(Button, { variant: "outline" }, "x");
  createElement(Button, { variant: "ghost", tone: "warning" }, "x");
  createElement(Button, { variant: "ghost", ink: "muted" }, "x");
  createElement(Button, { variant: "link", tone: "success" }, "x");
  expectTypeOf<{ variant: "outline"; tone: "info" }>().toExtend<ButtonProps>();
});
