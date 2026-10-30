// D336 step 3: the Combobox field takes the control scale as `size`.
import type { ComboboxProps } from "@orb/ui/combobox";
import type { ControlSize } from "@orb/ui/lib";
import { expectTypeOf, test } from "vitest";

test("size is the control scale", () => {
  expectTypeOf<NonNullable<ComboboxProps["size"]>>().toEqualTypeOf<ControlSize>();
});
