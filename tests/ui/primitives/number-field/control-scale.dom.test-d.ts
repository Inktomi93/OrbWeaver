// D336 step 3: NumberField takes the control scale; its stepper-less knob cell and stat tile are layouts, not scale steps.
import type { ControlSize } from "@orb/ui/lib";
import { NumberField } from "@orb/ui/number-field";
import type { ComponentProps } from "react";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("size is the control scale and the knob cell and stat tile are layouts", () => {
  // @ts-expect-error `inline` left `size` for `layout="inline"`
  createElement(NumberField, { size: "inline" });
  expectTypeOf<NonNullable<ComponentProps<typeof NumberField>["size"]>>().toEqualTypeOf<ControlSize>();
  expectTypeOf<NonNullable<ComponentProps<typeof NumberField>["layout"]>>().toEqualTypeOf<"field" | "inline" | "tile">();
});
