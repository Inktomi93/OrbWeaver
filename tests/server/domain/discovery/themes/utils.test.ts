// Unit: theme-name sanitization.

import { describe } from "vitest";
import { parseThemeName } from "../../../../../packages/server/src/domain/discovery/themes/utils.ts";
import { expect, test } from "../../../../support/fixtures";

describe("parseThemeName", () => {
  test("strips surrounding quotes and trims", () => {
    expect(parseThemeName('  "Forbidden Romance" ')).toBe("Forbidden Romance");
  });

  test("strips a leading markdown bullet/number", () => {
    expect(parseThemeName("1. Slow-Burn Mystery")).toBe("Slow-Burn Mystery");
    expect(parseThemeName("- Cyberpunk Heists")).toBe("Cyberpunk Heists");
  });

  test("collapses inner whitespace", () => {
    expect(parseThemeName("Court   Intrigue")).toBe("Court Intrigue");
  });

  test("empty / whitespace-only yields null", () => {
    expect(parseThemeName("   ")).toBeNull();
    expect(parseThemeName('""')).toBeNull();
  });

  test("caps length", () => {
    const name = parseThemeName("x".repeat(200));
    expect((name ?? "").length).toBeLessThanOrEqual(60);
  });
});
