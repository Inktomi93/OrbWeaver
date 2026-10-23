import type { ThemeOverride } from "@orb/contracts/theme";
import type { ThemeScopeProps, ThemeScopeTokens } from "@orb/ui/theme-scope";
import { expectTypeOf, test } from "vitest";

test("the public render input preserves the wire shape, optional fields and enum members", () => {
  expectTypeOf<ThemeScopeTokens>().toEqualTypeOf<ThemeOverride>();
  expectTypeOf<ThemeScopeProps["tokens"]>().toEqualTypeOf<ThemeOverride>();
  expectTypeOf<ThemeScopeTokens>().toHaveProperty("background");
  expectTypeOf<ThemeScopeTokens>().not.toHaveProperty("chatStyle");
});
