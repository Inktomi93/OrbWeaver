import type { ComboboxProps } from "@orb/ui/combobox";
import { expectTypeOf, test } from "vitest";

test("Combobox props keep string-array values, with no undefined-only shape", () => {
  expectTypeOf<ComboboxProps["value"]>().toEqualTypeOf<readonly string[] | undefined>();
  expectTypeOf<ComboboxProps["defaultValue"]>().toEqualTypeOf<readonly string[] | undefined>();
  expectTypeOf<NonNullable<ComboboxProps["value"]>[number]>().toEqualTypeOf<string>();
  expectTypeOf<NonNullable<ComboboxProps["value"]>[number]>().not.toBeAny();
  expectTypeOf<NonNullable<ComboboxProps["defaultValue"]>[number]>().not.toBeAny();
  expectTypeOf<ComboboxProps["value"]>().not.toEqualTypeOf<readonly number[]>();
  expectTypeOf<NonNullable<Parameters<NonNullable<ComboboxProps["onValueChange"]>>[1]>>().toHaveProperty("cancel");
  expectTypeOf<{ value: undefined } extends ComboboxProps ? true : false>().toEqualTypeOf<false>();
  expectTypeOf<{ defaultValue: undefined } extends ComboboxProps ? true : false>().toEqualTypeOf<false>();
});
