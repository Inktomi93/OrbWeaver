// The token-source proof for the markdown Shiki theme (§13.7/§13.8 R6/R7: "the code block uses the
// TOKEN theme via TOKENS, not a hardcoded color"). Deterministic + browser-free — the DOM CT
// (markdown.ct.tsx) proves the theme RENDERS (shiki token spans appear); THIS proves every color in
// it is a `TOKENS[...].value`, never a hand-typed hex/oklch literal. A hardcoded color would pass the
// render CT silently but fail here, which is exactly the "literal keeps passing against the old value"
// trap §13.7 calls out. Mirrors the tokens freshness test's relative-path import into src.

import { MARKDOWN_SHIKI_THEME } from "../../../packages/ui/src/markdown/shiki-theme.ts";
import { TOKENS } from "../../../packages/ui/src/tokens/index.ts";
import { expect, test } from "../../support/fixtures";

// The structural shape the seal builds (shiki's `ThemeRegistrationAny` resolves only permissively —
// shiki is bundled inside streamdown, not installed — so assert against the fields we set).
interface ShikiThemeShape {
  readonly bg: string;
  readonly fg: string;
  readonly colors: Record<string, string>;
  readonly settings: readonly {
    readonly scope: readonly string[];
    readonly settings: { readonly foreground: string };
  }[];
}

const [light, dark] = MARKDOWN_SHIKI_THEME as unknown as [ShikiThemeShape, ShikiThemeShape];
const TOKEN_VALUES = new Set(Object.values(TOKENS).map((t) => t.value));

test("the shiki theme surface (bg/fg) is sourced from the app palette tokens, not literals", () => {
  expect(dark.bg).toBe(TOKENS["color.card"].value);
  expect(dark.fg).toBe(TOKENS["color.foreground"].value);
  expect(dark.colors["editor.background"]).toBe(TOKENS["color.card"].value);
  expect(dark.colors["editor.foreground"]).toBe(TOKENS["color.foreground"].value);
});

test("EVERY syntax-scope color in the shiki theme is a TOKENS value (no hardcoded hex/oklch)", () => {
  expect(dark.settings.length).toBeGreaterThan(0);
  for (const entry of dark.settings) {
    // The load-bearing R6/R7 assertion: a hand-typed color would not be in the generated token set.
    expect(TOKEN_VALUES.has(entry.settings.foreground)).toBe(true);
  }
  // A representative mapping is wired (keyword → primary), guarding against an all-foreground stub.
  const keyword = dark.settings.find((s) => s.scope.includes("keyword"));
  expect(keyword?.settings.foreground).toBe(TOKENS["color.primary"].value);
});

test("both shikiTheme slots are populated (the [light, dark] pair Streamdown requires)", () => {
  // Dark-only app today: both slots are the one dark theme (documented light-slot swap). The pair
  // must still be two real theme objects, not a single value or a hole.
  expect(light.bg).toBe(TOKENS["color.card"].value);
  expect(dark.bg).toBe(TOKENS["color.card"].value);
});
