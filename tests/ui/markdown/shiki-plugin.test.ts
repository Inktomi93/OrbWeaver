// The token-source + wiring proof for the markdown Shiki plugin (D44 §12/UI-Gates §11.6; §13.7/§13.8
// R6/R7: "the code block uses the TOKEN theme via TOKENS, not a hardcoded color"). Deterministic +
// browser-free — the DOM CT (markdown.ct.tsx) proves the plugin RENDERS real highlighted spans; THIS
// proves every syntax color in both theme slots is a `TOKENS[...].value` (dark) or the light-mode
// literal it's transcribed from (light has no separate TOKENS namespace — see shiki-plugin.ts header),
// never a hand-typed unrelated hex/oklch, AND that `highlight()` actually resolves real per-token colors
// end-to-end through a real shiki highlighter (not the reconstructed-shape trap of asserting only the
// plugin's declared themes).
import { MARKDOWN_SHIKI_PLUGIN } from "../../../packages/ui/src/markdown/shiki-plugin.ts";
import { SEED_THEME_VALUE_SETS, TOKEN_POLARITY_ARMS, TOKENS } from "../../../packages/ui/src/tokens/index.ts";
import { expect, test } from "../../support/fixtures.ts";

// Types are DERIVED off the plugin's own public signatures (streamdown's `ThemeInput`/`HighlightOptions`/
// `HighlightResult` aren't directly importable from this test's aggregator program — see file header) so
// any drift in the plugin's shape fails `tsc` here too, not just a hand-copied local interface.
type ThemeSlot = ReturnType<typeof MARKDOWN_SHIKI_PLUGIN.getThemes>[number];
type HighlightOptions = Parameters<typeof MARKDOWN_SHIKI_PLUGIN.highlight>[0];
type HighlightResult = Parameters<NonNullable<Parameters<typeof MARKDOWN_SHIKI_PLUGIN.highlight>[1]>>[0];

function asShikiTheme(theme: ThemeSlot): Required<Pick<ThemeSlot, "type" | "bg" | "fg" | "colors" | "settings">> {
  const { type, bg, fg, colors, settings } = theme;
  if (type === undefined || bg === undefined || fg === undefined || colors === undefined || settings === undefined) {
    throw new Error("a seeded theme is missing a field the token-source proof asserts on");
  }
  return { type, bg, fg, colors, settings };
}

const themePair = MARKDOWN_SHIKI_PLUGIN.getThemes();
const light = asShikiTheme(themePair[0]);
const dark = asShikiTheme(themePair[1]);
const DARK_TOKEN_VALUES = new Set([...Object.values(TOKENS).map((t) => t.value), ...Object.values(TOKEN_POLARITY_ARMS).map((arms) => arms.dark)]);

// `HighlightOptions["language"]` types as shiki's ~200-language `BundledLanguage` union; our own plugin
// only ever loads from the curated `LANGUAGE_LOADERS` map, so a plain runtime string cast is the correct
// boundary here (same reasoning as `shiki-plugin.ts`'s own file-header note on the type/runtime gap).
function highlight(code: string, language: string): Promise<HighlightResult> {
  return new Promise((resolve) => {
    MARKDOWN_SHIKI_PLUGIN.highlight(
      // Only `language` needs the runtime-string → `BundledLanguage` narrowing (the documented type/runtime
      // gap above); the rest of the literal is checked structurally by `satisfies HighlightOptions`.
      {
        code,
        language: language as HighlightOptions["language"],
        themes: themePair,
      } satisfies HighlightOptions,
      (result) => resolve(result),
    );
  });
}

test("the DARK theme surface (bg/fg) is sourced from the app palette tokens, not literals", () => {
  expect(dark.type).toBe("dark");
  expect(dark.bg).toBe(TOKENS["color.card"].value);
  expect(dark.fg).toBe(TOKENS["color.foreground"].value);
  expect(dark.colors["editor.background"]).toBe(TOKENS["color.card"].value);
  expect(dark.colors["editor.foreground"]).toBe(TOKENS["color.foreground"].value);
});

test("EVERY syntax-scope color in the DARK theme is a generated token value (no hardcoded hex/oklch)", () => {
  expect(dark.settings.length).toBeGreaterThan(0);
  for (const entry of dark.settings) {
    // The load-bearing R6/R7 assertion: a hand-typed color would not be in the generated token set.
    expect(DARK_TOKEN_VALUES.has(entry.settings.foreground ?? "")).toBe(true);
  }
  const keyword = dark.settings.find((s) => Array.isArray(s.scope) && s.scope.includes("keyword"));
  expect(keyword?.settings.foreground).toBe(TOKENS["color.primary"].value);
});

test("chart-backed Shiki scopes use distinct concrete polarity arms in Light and Dark", () => {
  const foreground = (theme: typeof light, scope: string): string | undefined =>
    theme.settings.find((setting) => Array.isArray(setting.scope) && setting.scope.includes(scope))?.settings.foreground;
  const cases = [
    ["string", "color.chart-4"],
    ["constant.numeric", "color.chart-2"],
    ["entity.name.function", "color.chart-3"],
    ["entity.name.type", "color.chart-5"],
  ] as const;
  for (const [scope, path] of cases) {
    expect(foreground(light, scope), `${scope} light arm`).toBe(TOKEN_POLARITY_ARMS[path].light);
    expect(foreground(dark, scope), `${scope} dark arm`).toBe(TOKEN_POLARITY_ARMS[path].dark);
    expect(foreground(light, scope), `${scope} must change across polarity`).not.toBe(foreground(dark, scope));
  }
});

test("Shiki receives only concrete colors, never CSS functions it cannot resolve", () => {
  for (const theme of [light, dark]) {
    for (const entry of theme.settings) {
      expect(entry.settings.foreground).not.toContain("light-dark(");
      expect(entry.settings.foreground).not.toContain("var(");
    }
  }
  const lightKeyword = light.settings.find((setting) => Array.isArray(setting.scope) && setting.scope.includes("keyword"));
  expect(lightKeyword?.settings.foreground).toBe(SEED_THEME_VALUE_SETS.light.vars["--color-primary"]);
});

test("both theme slots are REAL and DISTINCT (the [light, dark] pair Streamdown requires)", () => {
  expect(light.type).toBe("light");
  expect(dark.type).toBe("dark");
  // The prior dark-only-app rationale (both slots = one dark theme) no longer applies — Light is a real
  // seeded theme now, so the pair must genuinely differ, not be the same object twice.
  expect(light.bg).not.toBe(dark.bg);
  expect(light.fg).not.toBe(dark.fg);
});

test("highlight() resolves REAL non-inherit colors for both themes on every token", async () => {
  const result = await highlight("const answer: number = 42;", "typescript");
  const tokens = result.tokens.flat();
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) {
    const lightColor = token.color ?? token.htmlStyle?.["color"];
    const darkColor = token.htmlStyle?.["--shiki-dark"];
    expect(lightColor).toBeTruthy();
    expect(lightColor).not.toBe("inherit");
    expect(darkColor).toBeTruthy();
    expect(darkColor).not.toBe("inherit");
  }
});

test("an unlisted fence language falls back to plaintext (no grammar, never crashes)", async () => {
  const result = await highlight("whatever", "cobol-9000");
  expect(result.tokens.flat().length).toBeGreaterThan(0);
});
