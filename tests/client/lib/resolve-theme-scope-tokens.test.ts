// The seed-guard, and its other half. A seed theme paints from its generated [data-theme] block, so its
// stored override must NEVER reach <ThemeScope> (clampThemeTokens would re-derive the 34 vars and shadow
// the hand-tuned block — e.g. system-bubble fg deriving bright off the bg). This pins that a seed collapses
// to `{}` + the appearance density, while a custom theme flows its own override through.
//
// RE-HOMED to the util floor with #920: the shell is no longer the only reader — every theme card's
// thumbnail must paint its row exactly as selecting it would, which is the same question. `dataThemeOf` is
// the block half of that answer and moved here with it, out of `use-selected-theme`.

import type { Theme, ThemeOverride } from "@orb/contracts/theme";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { describe } from "vitest";
import { BASE_PALETTE_VARS, dataThemeOf, isSeedThemeName, resolveThemeScopeTokens } from "../../../packages/client/src/lib/resolve-theme-scope-tokens.ts";
import { expect, test } from "../../support/fixtures.ts";

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

  test.each([
    ["oklch(0.62 0.01 60)", "oklch(0.72 0.14 280)"],
    ["oklch(0.6201 0.01 60)", "oklch(0.48 0.16 40)"],
  ] as const)("an accepted pivot custom theme carries background %s to the runtime derivation unchanged", (background, accent) => {
    const override = { background, accent };
    expect(resolveThemeScopeTokens(theme({ isSeed: false, override }), "comfortable").tokens).toEqual(override);
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

  // #236 — the AMBIENT BASE: the surface the active theme actually paints, threaded to <ThemeScope> so an
  // ink-only card override is judged against it instead of failing open. Read off the SAME generated
  // sources the app paints from (SEED_THEME_VALUE_SETS / TOKENS), so a palette edit can never desync it.
  test("the ambient base is the opaque surface underneath ThemeScope's carried custom pick", () => {
    // A seed paints from its generated [data-theme] block: its base is that block's own background.
    expect(resolveThemeScopeTokens(theme({ isSeed: true, name: "Light", override: FULL_OVERRIDE }), "comfortable").ambientBackground).toBe(
      SEED_THEME_VALUE_SETS.light.vars["--color-background"],
    );
    expect(resolveThemeScopeTokens(theme({ isSeed: true, name: "Mocha" }), "comfortable").ambientBackground).toBe(
      SEED_THEME_VALUE_SETS.mocha.vars["--color-background"],
    );
    // Hearth IS the base `@theme` — no value-set, so it resolves to the base ramp, as does "no theme".
    expect(resolveThemeScopeTokens(theme({ isSeed: true, name: "Hearth" }), "comfortable").ambientBackground).toBe(TOKENS["color.background"].value);
    expect(resolveThemeScopeTokens(null, "comfortable").ambientBackground).toBe(TOKENS["color.background"].value);
    // A custom pick is carried in tokens; ambient names the base ramp physically underneath it so alpha
    // can be composited before derivation. A custom theme with no pick paints that same base directly.
    expect(resolveThemeScopeTokens(theme({ override: FULL_OVERRIDE }), "comfortable").ambientBackground).toBe(TOKENS["color.background"].value);
    expect(resolveThemeScopeTokens(theme({ override: { accent: "oklch(0.5 0.1 60)" } }), "comfortable").ambientBackground).toBe(
      TOKENS["color.background"].value,
    );
  });
});

// The BLOCK half (#920): which generated `[data-theme]` a row paints from. The shell stamps it on <html>
// and a thumbnail stamps it on its own box — two readers, one answer, which is why it lives here.
describe("dataThemeOf", () => {
  test("a named seed resolves to its lowercased block name", () => {
    expect(dataThemeOf(theme({ isSeed: true, name: "Mocha" }))).toBe("mocha");
    expect(dataThemeOf(theme({ isSeed: true, name: "Light" }))).toBe("light");
  });

  test("Hearth stamps NOTHING — it IS the base @theme, so it has no block", () => {
    expect(dataThemeOf(theme({ isSeed: true, name: "Hearth" }))).toBeNull();
  });

  test("a custom theme stamps nothing, whatever it is called — even if it borrows a seed's name", () => {
    expect(dataThemeOf(theme({ isSeed: false, name: "Mocha" }))).toBeNull();
    expect(dataThemeOf(null)).toBeNull();
  });

  test("a seed whose name has no generated value-set degrades to null rather than stamping a dead block", () => {
    expect(dataThemeOf(theme({ isSeed: true, name: "Not A Palette" }))).toBeNull();
    // Positive control on the guard the derivation leans on — a always-false predicate would make the
    // three assertions above pass for the wrong reason.
    expect(isSeedThemeName("mocha")).toBe(true);
    expect(isSeedThemeName("not-a-palette")).toBe(false);
  });
});

// The BASE palette replayed for the one seed that owns no `[data-theme]` block. Hearth's thumbnail must
// paint Hearth on ANY root — stamping nothing is only "the base palette" at the shell root, and nested it
// means "inherit the ambient" (measured: a cream Hearth card under `--theme Light`).
describe("BASE_PALETTE_VARS", () => {
  test("carries the same key set the generated seed blocks emit — a drift between the two makes it EMPTY, never wrong", () => {
    const seedKeys = Object.keys(Object.values(SEED_THEME_VALUE_SETS)[0]?.vars ?? {});
    // Positive control: a zero-key seed block would make every claim below vacuous.
    expect(seedKeys.length).toBeGreaterThan(10);
    expect(Object.keys(BASE_PALETTE_VARS)).toEqual(seedKeys);
  });

  test("every value is the TOKENS value for that var — replayed from the one generated source, never re-derived", () => {
    expect(BASE_PALETTE_VARS["--color-background"]).toBe(TOKENS["color.background"].value);
    expect(BASE_PALETTE_VARS["--color-foreground"]).toBe(TOKENS["color.foreground"].value);
    expect(BASE_PALETTE_VARS["--color-primary"]).toBe(TOKENS["color.primary"].value);
  });

  test("it is the BASE, not a seed — Hearth's replay differs from the Light and Mocha blocks", () => {
    for (const set of Object.values(SEED_THEME_VALUE_SETS)) {
      expect(BASE_PALETTE_VARS["--color-background"]).not.toBe(set.vars["--color-background"]);
    }
  });
});
