// D336: Badge spells colour as `tone` and fill style as `variant`; `intent` and the old fill-style `tone` are gone.
import type { BadgeProps } from "@orb/ui/badge";
import { Badge } from "@orb/ui/badge";
import type { Tone } from "@orb/ui/tokens";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("the old intent axis and its values do not compile", () => {
  // @ts-expect-error `intent` is not a Badge axis
  createElement(Badge, { intent: "warning" }, "x");
  // @ts-expect-error `danger` is the destructive tone
  createElement(Badge, { tone: "danger" }, "x");
  // @ts-expect-error the accent pill left the vocabulary
  createElement(Badge, { tone: "accent" }, "x");
  // @ts-expect-error a fill style is `variant`, never a tone
  createElement(Badge, { tone: "soft" }, "x");
  // @ts-expect-error the unfilled style is `outline`
  createElement(Badge, { variant: "ghost" }, "x");
  expectTypeOf<NonNullable<BadgeProps["tone"]>>().toEqualTypeOf<Tone>();
});

test("every tone works with every style", () => {
  createElement(Badge, {}, "the neutral tint");
  createElement(Badge, { tone: "destructive", variant: "solid" }, "x");
  createElement(Badge, { tone: "info", variant: "outline" }, "x");
  createElement(Badge, { tone: "neutral", variant: "solid" }, "x");
  expectTypeOf<NonNullable<BadgeProps["variant"]>>().toEqualTypeOf<"solid" | "soft" | "outline">();
});
