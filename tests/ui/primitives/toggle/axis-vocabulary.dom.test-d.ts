// D336: Toggle spells fill style as `variant`, colour as `tone`, a named ink as `ink` and its box as the control scale.
import type { ControlSize } from "@orb/ui/lib";
import { Toggle } from "@orb/ui/toggle";
import type { Tone } from "@orb/ui/tokens";
import type { ComponentProps } from "react";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

type ToggleProps = ComponentProps<typeof Toggle>;

test("the old intent axis and its values do not compile", () => {
  // @ts-expect-error `intent` is not a Toggle axis
  createElement(Toggle, { intent: "outline" }, "x");
  // @ts-expect-error `command` is the foreground ink
  createElement(Toggle, { variant: "command" }, "x");
  // @ts-expect-error `primary` is a tone, not a style
  createElement(Toggle, { variant: "primary" }, "x");
  expectTypeOf<NonNullable<ToggleProps["variant"]>>().toEqualTypeOf<"ghost" | "outline">();
  expectTypeOf<NonNullable<ToggleProps["tone"]>>().toEqualTypeOf<Tone>();
  expectTypeOf<NonNullable<ToggleProps["size"]>>().toEqualTypeOf<ControlSize>();
});

test("an ink excludes a colour tone", () => {
  // @ts-expect-error an ink would repaint a colour tone's meaning away
  createElement(Toggle, { tone: "primary", ink: "foreground" }, "x");
  createElement(Toggle, { ink: "foreground" }, "a view command");
  createElement(Toggle, { variant: "outline", tone: "warning" }, "x");
  expectTypeOf<{ tone: "primary"; ink: "foreground" }>().not.toExtend<ToggleProps>();
});
