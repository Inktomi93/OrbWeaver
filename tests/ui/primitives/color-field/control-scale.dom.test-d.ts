// D336 step 3: the ColorField trigger takes the control scale as `size`; the display swatch keeps its own footprint.
import type { ColorField } from "@orb/ui/color-field";
import type { ControlSize } from "@orb/ui/lib";
import type { ComponentProps } from "react";
import { expectTypeOf, test } from "vitest";

test("size is the control scale", () => {
  expectTypeOf<NonNullable<ComponentProps<typeof ColorField>["size"]>>().toEqualTypeOf<ControlSize>();
});
