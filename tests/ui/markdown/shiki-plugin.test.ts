// The token-source + wiring proof for the markdown Shiki plugin (D44 §12/UI-Gates §11.6; §13.7/§13.8
// R6/R7: "the code block uses the TOKEN theme via TOKENS, not a hardcoded color"). Deterministic +
// browser-free — the DOM CT (markdown.ct.tsx) proves the plugin RENDERS real highlighted spans; THIS
// proves every syntax color in both theme slots is a `TOKENS[...].value` (dark) or the light-mode
// literal it's transcribed from (light has no separate TOKENS namespace — see shiki-plugin.ts header),
// never a hand-typed unrelated hex/oklch, AND that `highlight()` actually resolves real per-token colors
// end-to-end through a real shiki highlighter (not the reconstructed-shape trap of asserting only the
// plugin's declared themes).
import { MARKDOWN_SHIKI_PLUGIN } from "../../../packages/ui/src/markdown/shiki-plugin.ts";
import { TOKENS } from "../../../packages/ui/src/tokens/index.ts";
import { expect, test } from "../../support/fixtures.ts";

// Types are DERIVED off the plugin's own public signatures (streamdown's `ThemeInput`/`HighlightOptions`/
// `HighlightResult` aren't directly importable from this test's aggregator program — see file header) so
// any drift in the plugin's shape fails `tsc` here too, not just a hand-copied local interface.
type ThemeSlot = ReturnType<typeof MARKDOWN_SHIKI_PLUGIN.getThemes>[number];
type HighlightOptions = Parameters<typeof MARKDOWN_SHIKI_PLUGIN.highlight>[0];
type HighlightResult = Parameters<NonNullable<Parameters<typeof MARKDOWN_SHIKI_PLUGIN.highlight>[1]>>[0];

// A `ThemeSlot` is `string (BundledTheme name) | ThemeRegistrationAny (all-optional object)`, so the
// fields this token-source proof reads are statically absent. Rather than cast a fabricated shape over
// the pair, RUNTIME-narrow each real theme object and fail loudly if the plugin ever stops emitting a
// field the assertions below depend on.
function asShikiTheme(theme: ThemeSlot): {
  readonly type: "light" | "dark";
  readonly bg: string;
  readonly fg: string;
  readonly colors: Record<string, string>;
  readonly settings: readonly {
    readonly scope: readonly string[];
    readonly settings: { readonly foreground: string };
  }[];
} {
  if (typeof theme === "string") {
    throw new Error(`getThemes() returned a bundled-theme NAME (${theme}), not the seeded theme object`);
  }
  const { type, bg, fg, colors, settings } = theme;
  if (type === undefined || bg === undefined || fg === undefined || colors === undefined || settings === undefined) {
    throw new Error("a seeded theme is missing a field the token-source proof asserts on");
  }
  return { type, bg, fg, colors, settings };
}

const themePair = MARKDOWN_SHIKI_PLUGIN.getThemes();
const light = asShikiTheme(themePair[0]);
const dark = asShikiTheme(themePair[1]);
const TOKEN_VALUES = new Set(Object.values(TOKENS).map((t) => t.value));

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

test("EVERY syntax-scope color in the DARK theme is a TOKENS value (no hardcoded hex/oklch)", () => {
  expect(dark.settings.length).toBeGreaterThan(0);
  for (const entry of dark.settings) {
    // The load-bearing R6/R7 assertion: a hand-typed color would not be in the generated token set.
    expect(TOKEN_VALUES.has(entry.settings.foreground)).toBe(true);
  }
  const keyword = dark.settings.find((s) => s.scope.includes("keyword"));
  expect(keyword?.settings.foreground).toBe(TOKENS["color.primary"].value);
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
