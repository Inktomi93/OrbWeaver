// The Shiki CodeHighlighterPlugin for <Streamdown plugins={{ code }}>. Streamdown 2.5 dropped its
// bundled Shiki entirely, so a consumer must supply plugins.code or fenced blocks render unhighlighted.
//
// Engine: @shikijs/engine-javascript, not the oniguruma WASM one, to avoid refattening the client
// entry chunk. Grammars are fine-grained + lazy: createHighlighterCore starts with zero grammars
// loaded, and loadLanguage dynamic-imports one only the first time a fence in that language renders.
//
// Themes: getThemes() returns the token-sourced [light, dark] pair as literal values (not reactive to
// a live theme flip) — Shiki's inline color/--shiki-dark CSS on spans cascades through a theme flip,
// so baking both mode literals up front is what makes both slots correct at once.
//
// Async contract: highlight() returns null while the grammar hasn't loaded yet, and calls `callback`
// once loading + tokenizing finishes; HighlightedCodeBlockBody is written for exactly this.
import type { HighlighterCore } from "@shikijs/core";
import { createHighlighterCore } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import type { CodeHighlighterPlugin, HighlightOptions, ThemeInput } from "streamdown";
import { SEED_THEME_VALUE_SETS, TOKENS } from "#tokens";

// HighlightResult is declared in streamdown's .d.ts but not exported publicly — reconstructed here
// structurally. TS still checks this against the real (unexported) interface at the
// CodeHighlighterPlugin assignment below, so a drift in Streamdown's shape still fails tsc.
interface ShikiHighlightToken {
  bgColor?: string;
  color?: string;
  content: string;
  htmlAttrs?: Record<string, string>;
  htmlStyle?: Record<string, string>;
  offset?: number;
}
interface ShikiHighlightResult {
  bg?: string;
  fg?: string;
  rootStyle?: string | false;
  tokens: ShikiHighlightToken[][];
}

// Curated fence-language set: the everyday web/scripting/data languages a chat message actually
// fences. An unlisted fence id falls through to the plaintext branch below.
const LANGUAGE_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  javascript: () => import("@shikijs/langs/javascript"),
  js: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  ts: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  python: () => import("@shikijs/langs/python"),
  py: () => import("@shikijs/langs/python"),
  bash: () => import("@shikijs/langs/bash"),
  sh: () => import("@shikijs/langs/bash"),
  shell: () => import("@shikijs/langs/bash"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  markdown: () => import("@shikijs/langs/markdown"),
  md: () => import("@shikijs/langs/markdown"),
  rust: () => import("@shikijs/langs/rust"),
  rs: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  sql: () => import("@shikijs/langs/sql"),
  yaml: () => import("@shikijs/langs/yaml"),
  yml: () => import("@shikijs/langs/yaml"),
  diff: () => import("@shikijs/langs/diff"),
};

// Semantic scope → token, split light/dark. One entry per broad TextMate scope family so any grammar
// in LANGUAGE_LOADERS lands a sensible color.
function buildTheme(name: string, type: "light" | "dark", fg: string, bg: string): ThemeInput {
  return {
    name,
    type,
    fg,
    bg,
    colors: { "editor.background": bg, "editor.foreground": fg },
    settings: [
      { scope: ["source", "text"], settings: { foreground: fg } },
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
        settings: { foreground: fg },
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
}

// Dark literals: TOKENS["color.*"].value (the base/dark palette). Light literals: DERIVED from
// SEED_THEME_VALUE_SETS.light — the same generated [data-theme="light"] override values (source:
// src/tokens/themes/light.json), so a palette edit flows through the ONE seed home (no transcription drift).
const LIGHT_VARS = SEED_THEME_VALUE_SETS.light.vars;
const ORB_DARK = buildTheme("orbweaver-dark", "dark", TOKENS["color.foreground"].value, TOKENS["color.card"].value);
const ORB_LIGHT = buildTheme("orbweaver-light", "light", LIGHT_VARS["--color-foreground"], LIGHT_VARS["--color-card"]);

const THEMES: [ThemeInput, ThemeInput] = [ORB_LIGHT, ORB_DARK];

// Lazily constructed on first `highlight()` call — nothing here runs (no engine construction, no
// grammar fetch) until a fenced code block actually mounts.
let highlighterPromise: Promise<HighlighterCore> | null = null;
function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    themes: THEMES,
    langs: [],
  });
  return highlighterPromise;
}

async function highlightAsync(code: string, language: string): Promise<ShikiHighlightResult> {
  const highlighter = await getHighlighter();
  const loader = LANGUAGE_LOADERS[language];
  const lang = loader ? language : "plaintext";
  if (loader && !highlighter.getLoadedLanguages().includes(language)) {
    const mod = await loader();
    await highlighter.loadLanguage(mod.default as Parameters<HighlighterCore["loadLanguage"]>[0]);
  }
  const result = highlighter.codeToTokens(code, {
    lang,
    themes: { light: ORB_LIGHT, dark: ORB_DARK },
    defaultColor: "light",
  });
  // Structural cast: shiki's TokensResult and Streamdown's HighlightResult are independently
  // declared but field-identical. No runtime transform needed, just re-typing at the seam.
  return result as unknown as ShikiHighlightResult;
}

/**
 * The `CodeHighlighterPlugin` for `<Streamdown plugins={{ code }}>`. `getThemes()` wins over the
 * top-level `shikiTheme` prop, so this plugin alone determines both fenced-code palettes.
 * `highlight()` always returns `null` synchronously and delivers the real result via `callback`.
 */
export const MARKDOWN_SHIKI_PLUGIN: CodeHighlighterPlugin = {
  name: "shiki",
  type: "code-highlighter",
  getThemes: () => THEMES,
  getSupportedLanguages: () => Object.keys(LANGUAGE_LOADERS) as never[],
  supportsLanguage: (language) => language in LANGUAGE_LOADERS,
  highlight(options: HighlightOptions, callback?: (result: ShikiHighlightResult) => void): ShikiHighlightResult | null {
    highlightAsync(options.code, options.language)
      .then((result) => callback?.(result))
      .catch(() => {
        // Grammar fetch/tokenize failure: leave the block unhighlighted rather than crashing the render.
      });
    return null;
  },
};
