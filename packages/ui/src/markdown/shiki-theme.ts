// The ONE Streamdown↔design-token Shiki mapping site (the charts-seal lesson, D44 §12.1 / UI-Gates
// §11.6): fenced code must match the app palette, not Shiki's stock `github-*` themes. Every color is
// a STATIC token literal `TOKENS[path].value` — the exact precedent the chart-option builders use
// (`charts/*/option.ts` feed `TOKENS["color.chart-1"].value` straight into ECharts). NOTE the brief
// cited a "getComputedStyle + theme-switch re-read" pattern in charts/ — that pattern does not exist
// in the code (grep: zero getComputedStyle in @orb/ui); charts read the static generated literal,
// because the runtime theme selector is Phase-6/unbuilt (§12.1). So this file follows the ACTUAL
// precedent: bake the token literals. Shiki emits these as inline `color:` on the token spans, so a
// future live palette swap is a re-render away — no live re-read machinery is warranted yet.
//
// LIGHT-SLOT NOTE: Streamdown's `shikiTheme` is a `[light, dark]` pair. The app is dark-only today
// (Light palette deferred, §12.1), so BOTH slots use this one dark theme — a correct no-op under the
// current single palette. When a Light palette lands, build a second theme from its token set and put
// it in slot 0; nothing else here changes.
import type { ThemeInput } from "streamdown";
import { TOKENS } from "#tokens";

// A TextMate-style theme registration (the shape Shiki's `ThemeRegistrationAny` accepts). Declared
// locally — `shiki` is bundled inside streamdown and not installed as its own package, so its types
// resolve only permissively through streamdown's re-export; this captures exactly the fields we set.
interface ShikiTokenColor {
  readonly scope: readonly string[];
  readonly settings: { readonly foreground: string; readonly fontStyle?: string };
}
interface ShikiThemeRegistration {
  readonly name: string;
  readonly type: "dark" | "light";
  readonly fg: string;
  readonly bg: string;
  readonly colors: Record<string, string>;
  readonly settings: readonly ShikiTokenColor[];
}

// Semantic scope → token. The syntax hues come from the categorical `chart-*` ramp (a deliberately
// distinct-hue palette — exactly what code highlighting needs) plus the semantic role tokens; the
// surface (fg/bg) tracks the message code-block chrome (`color.card`/`color.foreground`). One entry
// per broad TextMate scope family so any Shiki grammar lands a sensible color.
const ORB_DARK: ShikiThemeRegistration = {
  name: "orbweaver-dark",
  type: "dark",
  fg: TOKENS["color.foreground"].value,
  bg: TOKENS["color.card"].value,
  colors: {
    "editor.background": TOKENS["color.card"].value,
    "editor.foreground": TOKENS["color.foreground"].value,
  },
  settings: [
    // Default text — the base color for any token a grammar doesn't scope.
    { scope: ["source", "text"], settings: { foreground: TOKENS["color.foreground"].value } },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: TOKENS["color.muted-foreground"].value, fontStyle: "italic" },
    },
    {
      scope: ["string", "string.quoted", "constant.character", "punctuation.definition.string"],
      settings: { foreground: TOKENS["color.chart-4"].value },
    },
    {
      scope: ["constant.numeric", "constant.language", "constant.other", "keyword.other.unit"],
      settings: { foreground: TOKENS["color.chart-2"].value },
    },
    {
      scope: ["keyword", "storage", "storage.type", "keyword.control", "keyword.operator"],
      settings: { foreground: TOKENS["color.primary"].value },
    },
    {
      scope: ["entity.name.function", "support.function", "meta.function-call"],
      settings: { foreground: TOKENS["color.chart-3"].value },
    },
    {
      scope: ["entity.name.type", "entity.name.class", "support.type", "support.class"],
      settings: { foreground: TOKENS["color.chart-5"].value },
    },
    {
      scope: ["variable", "variable.other", "meta.definition.variable"],
      settings: { foreground: TOKENS["color.foreground"].value },
    },
    {
      scope: ["entity.name.tag", "meta.tag", "support.type.property-name"],
      settings: { foreground: TOKENS["color.chart-5"].value },
    },
    {
      scope: ["punctuation", "meta.brace", "punctuation.separator", "punctuation.terminator"],
      settings: { foreground: TOKENS["color.muted-foreground"].value },
    },
    {
      scope: ["invalid", "invalid.illegal"],
      settings: { foreground: TOKENS["color.destructive"].value },
    },
  ],
};

/**
 * The token-sourced `[light, dark]` Shiki theme pair for `<Streamdown shikiTheme>`. Both slots are the
 * one dark theme today (see LIGHT-SLOT NOTE above). Typed as the Streamdown prop's `ThemeInput` so a
 * shape drift fails `tsc` at the seal.
 */
export const MARKDOWN_SHIKI_THEME: [ThemeInput, ThemeInput] = [
  ORB_DARK as unknown as ThemeInput,
  ORB_DARK as unknown as ThemeInput,
];
