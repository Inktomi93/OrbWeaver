// The reading boxes' reach and a message card's edges are a Row's own; Stack and Grid cross only the insets they name.
import { Grid, Row, Stack } from "@orb/ui/layout";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("Row takes every reach, and Stack and Grid take the two named insets", () => {
  for (const reach of ["row", "section", "column", "page", "header", "foot"] as const) {
    createElement(Row, { reach }, "x");
  }
  createElement(Stack, { reach: "row" }, "x");
  createElement(Grid, { reach: "section" }, "x");
  // @ts-expect-error a reading box's reach means nothing on a Stack
  createElement(Stack, { reach: "column" }, "x");
  // @ts-expect-error a reading box's reach means nothing on a Grid
  createElement(Grid, { reach: "page" }, "x");
  // @ts-expect-error a card's edges are a Row's
  createElement(Stack, { reach: "header" }, "x");
  expectTypeOf<NonNullable<Parameters<typeof Stack>[0]["reach"]>>().toEqualTypeOf<"row" | "section">();
});

test("Row refuses the axes that folded into alignBelow and reach", () => {
  // @ts-expect-error the stacked row's alignment is alignBelow
  createElement(Row, { stretchBelow: "cq-32" }, "x");
  // @ts-expect-error the stacked row's alignment is alignBelow
  createElement(Row, { alignEndBelow: "cq-28" }, "x");
  // @ts-expect-error a card's edges are an arm of reach
  createElement(Row, { reachCard: "header" }, "x");
  // @ts-expect-error alignBelow names its value and its step
  createElement(Row, { alignBelow: "cq-32" }, "x");
  createElement(Row, { alignBelow: "stretch-cq-32" }, "x");
  expectTypeOf<Parameters<typeof Row>[0]>().not.toHaveProperty("reachCard");
  expectTypeOf<Parameters<typeof Row>[0]>().not.toHaveProperty("stretchBelow");
});
