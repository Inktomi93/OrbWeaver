// IndicatorDot: a childless circle that means "something is here". A tone, a solid fill or a ring, and no children.
import type { IndicatorDotProps } from "@orb/ui/indicator-dot";
import { IndicatorDot } from "@orb/ui/indicator-dot";
import type { Tone } from "@orb/ui/tokens";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("an indicator dot takes a tone and a solid or ring style, and no children", () => {
  // @ts-expect-error a dot has no box step
  createElement(IndicatorDot, { size: "sm" });
  // @ts-expect-error a tint is the Badge soft style
  createElement(IndicatorDot, { variant: "soft" });
  // @ts-expect-error the ink ring is the outline style
  createElement(IndicatorDot, { edge: "ink" });
  createElement(IndicatorDot, { tone: "primary", "aria-hidden": true });
  createElement(IndicatorDot, { tone: "neutral", variant: "outline", role: "img", "aria-label": "Not set" });
  // nothing is printed in a dot
  expectTypeOf<IndicatorDotProps>().not.toHaveProperty("children");
  expectTypeOf<NonNullable<IndicatorDotProps["tone"]>>().toEqualTypeOf<Tone>();
  expectTypeOf<NonNullable<IndicatorDotProps["variant"]>>().toEqualTypeOf<"solid" | "outline">();
});
