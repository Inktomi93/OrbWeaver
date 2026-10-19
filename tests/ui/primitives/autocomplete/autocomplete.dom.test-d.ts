import type { AutocompleteProps } from "@orb/ui/autocomplete";
import { expectTypeOf, test } from "vitest";

test("Autocomplete props keep string values and items, with no undefined-only shape", () => {
  expectTypeOf<AutocompleteProps["value"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<AutocompleteProps["defaultValue"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<AutocompleteProps["items"]>().toEqualTypeOf<readonly string[] | undefined>();
  expectTypeOf<NonNullable<AutocompleteProps["items"]>[number]>().toEqualTypeOf<string>();
  expectTypeOf<NonNullable<AutocompleteProps["items"]>[number]>().not.toBeAny();
  expectTypeOf<AutocompleteProps["value"]>().not.toBeAny();
  expectTypeOf<AutocompleteProps["items"]>().not.toEqualTypeOf<readonly number[]>();
  expectTypeOf<NonNullable<Parameters<NonNullable<AutocompleteProps["onValueChange"]>>[1]>>().toHaveProperty("cancel");
  expectTypeOf<{ value: undefined } extends AutocompleteProps ? true : false>().toEqualTypeOf<false>();
  expectTypeOf<{ defaultValue: undefined } extends AutocompleteProps ? true : false>().toEqualTypeOf<false>();
  expectTypeOf<{ items: undefined } extends AutocompleteProps ? true : false>().toEqualTypeOf<false>();
});
