// resolveThemeScopeTokens — the app-shell seed-guard. A seed theme paints from its generated [data-theme]
// block, so its stored override must NEVER reach <ThemeScope> (clampThemeTokens would re-derive the 34
// vars and shadow the hand-tuned block — e.g. system-bubble fg deriving bright off the bg). This pins that
// a seed collapses to `{}` + the appearance density, while a custom theme flows its own override through.

import type { Theme, ThemeOverride } from "@orb/contracts/theme";
import { describe } from "vitest";
import { resolveThemeScopeTokens } from "../../../../../packages/client/src/features/app-shell/lib/resolve-theme-scope-tokens.ts";
import { expect, test } from "../../../../support/fixtures";

const FULL_OVERRIDE: ThemeOverride = {
  accent: "oklch(0.72 0.175 52)",
  background: "oklch(0.158 0.006 60)",
  density: "compact",
};

function theme(over: Partial<Theme>): Theme {
  return {
    id: "theme_x",
    name: "X",
    override: {},
    css: null,
    isSeed: false,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe("resolveThemeScopeTokens", () => {
  test("a SEED theme (even with a full override) yields {} tokens + the appearance density", () => {
    const resolved = resolveThemeScopeTokens(theme({ isSeed: true, override: FULL_OVERRIDE }), "comfortable");
    expect(resolved.tokens).toEqual({});
    expect(resolved.density).toBe("comfortable");
  });

  test("a CUSTOM theme flows its override through; its override.density wins over appearance", () => {
    const resolved = resolveThemeScopeTokens(theme({ isSeed: false, override: FULL_OVERRIDE }), "comfortable");
    expect(resolved.tokens).toBe(FULL_OVERRIDE);
    expect(resolved.density).toBe("compact");
  });

  test("a CUSTOM theme without a density override falls back to the appearance density", () => {
    const resolved = resolveThemeScopeTokens(theme({ isSeed: false, override: { accent: "oklch(0.5 0.1 60)" } }), "compact");
    expect(resolved.density).toBe("compact");
  });

  test("a null theme (Hearth default) yields {} tokens + the appearance density", () => {
    const resolved = resolveThemeScopeTokens(null, "comfortable");
    expect(resolved.tokens).toEqual({});
    expect(resolved.density).toBe("comfortable");
  });
});
