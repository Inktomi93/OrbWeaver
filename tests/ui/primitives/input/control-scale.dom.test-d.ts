// D336 step 3: Input takes the control scale as `size`, in place of the native character-count attribute.
import { Input } from "@orb/ui/input";
import type { ControlSize } from "@orb/ui/lib";
import type { ComponentProps } from "react";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("size is the control scale", () => {
  // @ts-expect-error the native `size` attribute is not the control scale
  createElement(Input, { size: 20 });
  // @ts-expect-error `xl` is not a step
  createElement(Input, { size: "xl" });
  expectTypeOf<NonNullable<ComponentProps<typeof Input>["size"]>>().toEqualTypeOf<ControlSize>();
});
