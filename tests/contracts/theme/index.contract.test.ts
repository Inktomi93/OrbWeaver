// The Theme entity/input schemas: caps, trims, the two derived flags. The override
// wire clamp's own suite mirrors override.ts (test-presence).

import { createThemeInputSchema, THEME_NAME_MAX, themeSchema } from "@orb/contracts/theme";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("theme entity/input schemas", () => {
  test("createThemeInput enforces the name cap and trims", () => {
    expect(createThemeInputSchema.parse({ name: "  Hearth  ", override: {} }).name).toBe("Hearth");
    expect(() => createThemeInputSchema.parse({ name: "x".repeat(THEME_NAME_MAX + 1), override: {} })).toThrow();
  });

  test("the entity view parses with both derived flags + nullable css", () => {
    const theme = themeSchema.parse({
      id: "theme_x",
      name: "Hearth",
      override: { accent: "red" },
      css: null,
      isSeed: true,
      isDefault: true,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(theme.isSeed).toBe(true);
    expect(theme.isDefault).toBe(true);
  });

  test("isDefault is REQUIRED — a producer cannot ship a row without it (#1671)", () => {
    // The flag is the client's only handle on which row `selectedThemeId: null` resolves to, so an
    // OPTIONAL field would read as `undefined` → falsy → no current card, exactly the #1667 symptom.
    const row = { id: "theme_x", name: "Hearth", override: {}, css: null, isSeed: true, createdAt: 1, updatedAt: 1 };
    expect(() => themeSchema.parse(row)).toThrow();
  });
});
