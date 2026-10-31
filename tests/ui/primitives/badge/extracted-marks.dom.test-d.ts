// D336: the in-flow chip and the childless dot left Badge for their named components, so Badge refuses them.
import type { BadgeProps } from "@orb/ui/badge";
import { Badge } from "@orb/ui/badge";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("Badge refuses every mark a named component owns", () => {
  // @ts-expect-error a chip in running text is InlineToken
  createElement(Badge, { size: "inline" }, "x");
  // @ts-expect-error a childless dot is IndicatorDot
  createElement(Badge, { size: "dot" });
  // @ts-expect-error the ink ring is the IndicatorDot outline
  createElement(Badge, { edge: "ink" });
  expectTypeOf<NonNullable<BadgeProps["size"]>>().toEqualTypeOf<"compact" | "sm" | "md">();
});
