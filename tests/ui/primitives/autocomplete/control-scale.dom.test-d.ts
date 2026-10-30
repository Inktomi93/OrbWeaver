// D336 step 3: the Autocomplete field takes the control scale as `size`.
import type { AutocompleteProps } from "@orb/ui/autocomplete";
import type { ControlSize } from "@orb/ui/lib";
import { expectTypeOf, test } from "vitest";

test("size is the control scale", () => {
  expectTypeOf<NonNullable<AutocompleteProps["size"]>>().toEqualTypeOf<ControlSize>();
});
