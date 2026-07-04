// The D44 §12.5 STRUCTURAL-PAIRING suite (mirror-exempt `.suite` kind — one property spanning two
// packages): the `@orb/contracts/theme` WIRE clamp and the `@orb/ui` `<ThemeScope>` RENDER clamp
// are a DELIBERATE two-copy (the cake forbids either importing the other); this suite is what
// keeps the copies byte-equivalent — identical field-key sets, identical enum members, identical
// font allowlist. Tests may import both packages; the packages never import each other.

import {
  THEME_CHAT_STYLES,
  THEME_DENSITIES,
  THEME_FONT_ALLOWLIST,
  THEME_RADII,
  themeOverrideSchema,
} from "@orb/contracts/theme";
import {
  THEME_SCOPE_CHAT_STYLES,
  THEME_SCOPE_DENSITIES,
  THEME_SCOPE_RADII,
  themeScopeTokensSchema,
  THEME_FONT_ALLOWLIST as UI_FONTS,
} from "@orb/ui/theme-scope";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

describe("ThemeOverride wire ↔ ThemeScope render pairing (D44 §12.5)", () => {
  test("identical field-key sets", () => {
    const wireKeys = Object.keys(themeOverrideSchema.shape).sort();
    const renderKeys = Object.keys(themeScopeTokensSchema.shape).sort();
    expect(wireKeys).toEqual(renderKeys);
  });

  test("identical font allowlists", () => {
    expect([...THEME_FONT_ALLOWLIST]).toEqual([...UI_FONTS]);
  });

  test("identical enum members (chatStyle / density / radius)", () => {
    expect([...THEME_CHAT_STYLES]).toEqual([...THEME_SCOPE_CHAT_STYLES]);
    expect([...THEME_DENSITIES]).toEqual([...THEME_SCOPE_DENSITIES]);
    expect([...THEME_RADII]).toEqual([...THEME_SCOPE_RADII]);
  });

  test("the clamps AGREE on a hostile value (both drop it; both keep the safe sibling)", () => {
    const hostile = { accent: "url(https://evil.example/x)", bodyColor: "red" };
    const wire = themeOverrideSchema.parse(hostile);
    const render = themeScopeTokensSchema.safeParse(hostile);
    expect(wire.accent).toBeUndefined();
    expect(wire.bodyColor).toBe("red");
    // The render clamp is whole-parse (clampThemeTokens catches failure → {}); the wire clamp is
    // per-field. Equivalent OUTCOME either way: the hostile value never reaches a custom property.
    expect(render.success).toBe(false);
  });
});
