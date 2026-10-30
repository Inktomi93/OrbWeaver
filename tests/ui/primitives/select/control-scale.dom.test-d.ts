// D336 step 3: the Select trigger takes the control scale as `size`.
import type { ControlSize } from "@orb/ui/lib";
import type { Select } from "@orb/ui/select";
import type { ComponentProps } from "react";
import { expectTypeOf, test } from "vitest";

test("size is the control scale", () => {
  expectTypeOf<NonNullable<ComponentProps<typeof Select>["size"]>>().toEqualTypeOf<ControlSize>();
});
