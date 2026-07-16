// The Theme entity/input schemas (themes-design §3.2): caps, trims, derived isSeed. The override
// wire clamp's own suite mirrors override.ts (test-presence).

import { createThemeInputSchema, THEME_NAME_MAX, themeSchema } from "@orb/contracts/theme";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

describe("theme entity/input schemas", () => {
  test("createThemeInput enforces the name cap and trims", () => {
    expect(createThemeInputSchema.parse({ name: "  Hearth  ", override: {} }).name).toBe("Hearth");
    expect(() => createThemeInputSchema.parse({ name: "x".repeat(THEME_NAME_MAX + 1), override: {} })).toThrow();
  });

  test("the entity view parses with derived isSeed + nullable css", () => {
    const theme = themeSchema.parse({
      id: "theme_x",
      name: "Hearth",
      override: { accent: "red" },
      css: null,
      isSeed: true,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(theme.isSeed).toBe(true);
  });
});
